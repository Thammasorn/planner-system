// src/server/services/tasks.ts — task create / fields / tree moves / delete + restore / project list (FR-601–611,
// BR-30–33, AC-602/603, X62, M3-D2/D3/D11/D12/D23). Every mutation runs inside the caller's transaction after the
// action's authz; the action writes the audit row (M3-D43, X96). Services never read the clock: `today` is a parameter.
import { randomUUID } from 'node:crypto'
import { compareISO } from '@/domain/dates'
import { defaultStatus } from '@/domain/status'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type {
  AssignmentTransfer,
  CreateTaskResult,
  DeleteTaskTreeResult,
  ProjectTasksResponse,
  RestoreTaskBatchResult,
  TaskAssigneeDTO,
  TaskDepth,
  TaskDTO,
  TreeMoveResult,
} from '@/lib/contracts/tasks'
import type { createTaskSchema, updateTaskSchema } from '@/lib/schemas/tasks'
import type { z } from '@/lib/z'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import type { TaskFieldPatch, TaskListRow, TaskRow } from '../repo/tasks'
import type { SessionUser } from '../session'
import { applyTransfer, fitsDepth, keyAt, lockSiblingScope, placeTask, subtree } from './task-tree'
import { ensureProjectStatuses, toStatusDTO } from './taskStatuses'

const validation = (field: string, message: string): ValidationError =>
  new ValidationError({ [field]: [message] }, message)

/** M3-D12: a refused restore — CONFLICT whose message is the reason (the client shows "กู้คืนไม่ได้ เพราะ<reason>"). */
type RestoreReason = keyof typeof th.tasks.errors.restore
export const restoreRefused = (reason: RestoreReason): ConflictError =>
  new ConflictError('CONFLICT', th.tasks.errors.restore[reason], { reason })

const toDepth = (d: number): TaskDepth => (d <= 0 ? 0 : d >= 2 ? 2 : 1)

/** Wire shape of a task (drops statusCategory / completedWeek, folds the counts into `blockers`). */
export function toTaskDTO(row: TaskListRow, assignees: readonly TaskAssigneeDTO[]): TaskDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    depth: toDepth(row.depth),
    position: row.position,
    name: row.name,
    startDate: row.startDate,
    dueDate: row.dueDate,
    certaintyOverride: row.certaintyOverride,
    completedOn: row.completedOn,
    assignees: [...assignees],
    statusId: row.statusId,
    blockers: { open: row.blockersOpen, total: row.blockersTotal },
    hasBody: row.hasBody ?? false, // M6.1-D11: listColumns always sets it; hand-built rows may omit it
  }
}

/** One live task as a DTO (results of single-task mutations). */
export async function loadTaskDTO(tx: DbOrTx, taskId: string): Promise<TaskDTO> {
  const row = await repo.tasks.getLiveWithBlockerCounts(tx, taskId)
  if (!row) throw new NotFoundError()
  const assignees = (await repo.assignments.activeForTask(tx, taskId)).map((a) => ({
    assignmentId: a.id,
    userId: a.userId,
  }))
  return toTaskDTO(row, assignees)
}

/** Parent for a new child / a cross-project probe: invisible project → 404, other project → VALIDATION (BR-33). */
async function sameProjectParent(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string,
  parentId: string,
): Promise<TaskRow> {
  const parent = await repo.tasks.getLive(tx, parentId, { forUpdate: true })
  if (!parent) throw new NotFoundError()
  if (parent.projectId !== projectId) {
    if (!(await authz.projectAccess(tx, user, parent.projectId))) throw new NotFoundError()
    throw validation('parentId', th.tasks.errors.crossProject)
  }
  return parent
}

// ── create (FR-602, FR-610, FR-625/664) ─────────────────────────────────────────────────────────────────────────

export async function createTask(
  tx: DbOrTx,
  user: SessionUser,
  a: z.output<typeof createTaskSchema>,
  today: ISODate,
): Promise<CreateTaskResult> {
  const parent = a.parentId ? await sameProjectParent(tx, user, a.projectId, a.parentId) : null
  const depth = parent ? parent.depth + 1 : 0
  if (!fitsDepth(depth, 0)) throw validation('parentId', th.tasks.errors.maxDepth)

  let status
  if (a.statusId) {
    status = await repo.statuses.getLiveInProject(tx, a.projectId, a.statusId)
    if (!status) throw new NotFoundError()
  } else {
    let live = await repo.statuses.listLiveStatuses(tx, a.projectId)
    if (live.length === 0 && (await ensureProjectStatuses(tx, a.projectId))) {
      live = await repo.statuses.listLiveStatuses(tx, a.projectId)
    }
    status = defaultStatus(live) // BR-81
  }
  const done = status.category === 'DONE' // BR-80 (column quick add on a DONE column)

  const parentWasLeaf = parent ? !(await repo.tasks.hasLiveChildren(tx, parent.id)) : false
  await lockSiblingScope(tx, a.projectId, a.parentId)
  const position = await keyAt(tx, { projectId: a.projectId, parentId: a.parentId, afterId: a.afterId })
  const row = await repo.tasks.insertTask(tx, {
    projectId: a.projectId,
    parentId: a.parentId,
    depth: toDepth(depth),
    name: a.name,
    position,
    createdBy: user.id,
    statusId: status.id,
    completedOn: done ? today : null,
    completedBy: done ? user.id : null,
  })

  // FR-610 / X20: the first child of an assigned leaf takes over its assignments.
  let transfer: AssignmentTransfer | null = null
  if (parent && parentWasLeaf) {
    const onParent = await repo.assignments.activeForTask(tx, parent.id, { forUpdate: true })
    if (onParent.length > 0) {
      transfer = { assignmentIds: onParent.map((r) => r.id), fromTaskId: parent.id, toTaskId: row.id }
      await applyTransfer(tx, a.projectId, transfer)
    }
  }
  return { task: await loadTaskDTO(tx, row.id), transfer }
}

// ── fields (FR-601) ──────────────────────────────────────────────────────────────────────────────────────────────

type Field = keyof TaskFieldPatch
const FIELDS: readonly Field[] = ['name', 'startDate', 'dueDate', 'certaintyOverride'] // no notes (M6.1-D12)

/** Only changed fields are written; `before`/`after` hold exactly those (audit). */
export async function updateTask(
  tx: DbOrTx,
  _user: SessionUser,
  a: z.output<typeof updateTaskSchema>,
): Promise<{ task: TaskDTO; before: TaskFieldPatch; after: TaskFieldPatch; name: string }> {
  const cur = await repo.tasks.getLive(tx, a.taskId, { forUpdate: true })
  if (!cur) throw new NotFoundError()
  const before: TaskFieldPatch = {}
  const after: TaskFieldPatch = {}
  for (const k of FIELDS) {
    const v = a.patch[k]
    if (v === undefined || v === cur[k]) continue
    Object.assign(before, { [k]: cur[k] })
    Object.assign(after, { [k]: v })
  }
  const start = after.startDate !== undefined ? after.startDate : cur.startDate
  const due = after.dueDate !== undefined ? after.dueDate : cur.dueDate
  if (start && due && compareISO(due, start) < 0) throw validation('dueDate', th.tasks.errors.dueBeforeStart)
  if (Object.keys(after).length > 0) await repo.tasks.updateFields(tx, cur.id, after)
  return { task: await loadTaskDTO(tx, cur.id), before, after, name: after.name ?? cur.name }
}

// ── tree moves (FR-603/604, AC-602, BR-30/31/33) ─────────────────────────────────────────────────────────────────

async function moveResult(
  tx: DbOrTx,
  r: Awaited<ReturnType<typeof placeTask>>,
): Promise<TreeMoveResult> {
  if (!r.changed) return { changed: false }
  return { changed: true, task: await loadTaskDTO(tx, r.task.id), previous: r.previous, transfer: r.transfer }
}

/** Tab: the previous sibling becomes the parent (appended as last child); no sibling or too deep → silent no-op. */
export async function indentTask(
  tx: DbOrTx,
  user: SessionUser,
  a: { taskId: string },
): Promise<TreeMoveResult> {
  const task = await repo.tasks.getLive(tx, a.taskId, { forUpdate: true })
  if (!task) throw new NotFoundError()
  const siblings = await repo.tasks.liveChildren(tx, task.projectId, task.parentId)
  const i = siblings.findIndex((s) => s.id === task.id)
  const prev = i > 0 ? siblings[i - 1]! : null
  if (!prev) return { changed: false }
  if (!fitsDepth(prev.depth + 1, (await subtree(tx, task.id)).height)) return { changed: false }
  return moveResult(tx, await placeTask(tx, task, { parentId: prev.id, afterId: undefined }, { user }))
}

/** Shift+Tab: to the grandparent, right after the old parent; a root → no-op. */
export async function outdentTask(
  tx: DbOrTx,
  user: SessionUser,
  a: { taskId: string },
): Promise<TreeMoveResult> {
  const task = await repo.tasks.getLive(tx, a.taskId, { forUpdate: true })
  if (!task) throw new NotFoundError()
  if (task.parentId === null) return { changed: false }
  const parent = await repo.tasks.getLive(tx, task.parentId)
  if (!parent) throw new NotFoundError()
  return moveResult(tx, await placeTask(tx, task, { parentId: parent.parentId, afterId: parent.id }, { user }))
}

/** Drag / move menu (intent only, M3-D11); the optional transfer is the undo/redo of a BR-31 move (M3-D3). */
export async function moveTask(
  tx: DbOrTx,
  user: SessionUser,
  a: { taskId: string; parentId: string | null; afterId: string | null; transfer?: AssignmentTransfer },
): Promise<TreeMoveResult> {
  const task = await repo.tasks.getLive(tx, a.taskId, { forUpdate: true })
  if (!task) throw new NotFoundError()
  return moveResult(
    tx,
    await placeTask(
      tx,
      task,
      { parentId: a.parentId, afterId: a.afterId },
      { user, ...(a.transfer ? { transfer: a.transfer } : {}) },
    ),
  )
}

// ── delete + restore (FR-609, BR-32, AC-603, FR-645, §7.5) ──────────────────────────────────────────────────────

export interface DeletedRoot {
  id: string
  name: string
  descendants: number
}

/** Soft-deletes the selected subtrees under one batch (descendants of selected rows deduplicated, M3-D23) and the
 *  blocker edges touching them (FR-645); assignments are not touched (X13). `transfer` = undo of FR-610.
 *  FR-689 / M6.1-D13: the bodies (TASK pages) of every deleted task join the same batch and lose their leases. */
export async function deleteTaskTree(
  tx: DbOrTx,
  _user: SessionUser,
  a: { projectId: string; tasks: readonly TaskRow[]; taskIds: readonly string[]; transfer?: AssignmentTransfer },
): Promise<DeleteTaskTreeResult & { roots: DeletedRoot[] }> {
  const byId = new Map(a.tasks.map((t) => [t.id, t]))
  const selected = new Set(byId.keys())
  const ancestorsOf = async (t: TaskRow): Promise<string[]> => {
    const out: string[] = []
    let parentId = t.parentId
    while (parentId && out.length < 3) {
      out.push(parentId)
      parentId = (byId.get(parentId) ?? (await repo.tasks.getAny(tx, parentId)))?.parentId ?? null
    }
    return out
  }
  const ordered = [...new Set(a.taskIds)].map((id) => byId.get(id)!).filter(Boolean)
  const rootRows: TaskRow[] = []
  for (const t of ordered) if (!(await ancestorsOf(t)).some((id) => selected.has(id))) rootRows.push(t)

  const batch = randomUUID()
  const deletedIds: string[] = []
  const roots: DeletedRoot[] = []
  for (const r of rootRows) {
    const ids = await repo.tasks.softDeleteSubtree(tx, r.id, batch)
    deletedIds.push(...ids)
    roots.push({ id: r.id, name: r.name, descendants: Math.max(0, ids.length - 1) })
  }
  await repo.blockers.softDeleteTouching(tx, deletedIds, batch)
  const bodyIds = await repo.pages.softDeleteTaskBodies(tx, deletedIds, batch)
  await repo.pageLocks.clearLocks(tx, bodyIds)
  if (a.transfer) await applyTransfer(tx, a.projectId, a.transfer, { allowDeletedFrom: true })
  return {
    projectId: a.projectId,
    batch,
    rootIds: roots.map((r) => r.id),
    deletedIds,
    transfer: a.transfer ?? null,
    roots,
  }
}

/** Undo of deleteTaskTree (M3-D12): 30 days, live parent, depth still fits, parent not an assigned leaf unless the
 *  given transfer re-points its assignments (redo of FR-610); edges whose other task is live come back too, and so do
 *  the bodies of the restored tasks (FR-689, M6.1-D13). */
export async function restoreTaskBatch(
  tx: DbOrTx,
  _user: SessionUser,
  a: { projectId: string; batch: string; transfer?: AssignmentTransfer },
): Promise<RestoreTaskBatchResult & { roots: DeletedRoot[] }> {
  const rows = (await repo.tasks.listBatch(tx, a.batch)).filter((r) => r.projectId === a.projectId)
  if (rows.length === 0) throw new NotFoundError()
  if (rows.some((r) => !r.withinWindow)) throw restoreRefused('expired')
  const inBatch = new Set(rows.map((r) => r.id))
  const childrenOf = new Map<string, string[]>()
  for (const r of rows) {
    if (r.parentId && inBatch.has(r.parentId)) {
      childrenOf.set(r.parentId, [...(childrenOf.get(r.parentId) ?? []), r.id])
    }
  }
  const depthOf = new Map(rows.map((r) => [r.id, r.depth]))
  const roots: DeletedRoot[] = []
  const restoredIds: string[] = []
  for (const root of rows.filter((r) => !r.parentId || !inBatch.has(r.parentId))) {
    const parent = root.parentId ? await repo.tasks.getLive(tx, root.parentId, { forUpdate: true }) : null
    if (root.parentId && (!parent || parent.projectId !== a.projectId)) throw restoreRefused('parentDeleted')
    const ids: string[] = []
    const stack = [root.id]
    while (stack.length > 0) {
      const id = stack.pop()!
      ids.push(id)
      stack.push(...(childrenOf.get(id) ?? []))
    }
    const delta = (parent ? parent.depth + 1 : 0) - root.depth
    if (Math.max(...ids.map((id) => depthOf.get(id)!)) + delta > 2) throw restoreRefused('tooDeep')
    if (parent && !(await repo.tasks.hasLiveChildren(tx, parent.id))) {
      const assigned = await repo.assignments.activeForTask(tx, parent.id, { forUpdate: true })
      if (assigned.length > 0 && a.transfer?.fromTaskId !== parent.id) throw restoreRefused('parentAssigned')
    }
    await repo.tasks.restoreRows(tx, ids, delta)
    restoredIds.push(...ids)
    roots.push({ id: root.id, name: root.name, descendants: ids.length - 1 })
  }
  await repo.blockers.restoreBatch(tx, a.batch)
  await repo.pages.restoreTaskBodies(tx, a.batch, restoredIds)
  if (a.transfer) await applyTransfer(tx, a.projectId, a.transfer)
  return { projectId: a.projectId, restoredIds, transfer: a.transfer ?? null, roots }
}

// ── reads (PERM-06, X62, M3-D37/D39) ─────────────────────────────────────────────────────────────────────────────

/** GET /api/projects/[id]/tasks. Authz first (archived readable; invisible / malformed id → 404). */
export async function listProjectTasks(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string,
): Promise<ProjectTasksResponse> {
  const access = await authz.requireProject(tx, user, projectId, 'view')
  const project = await repo.projects.getProject(tx, projectId)
  if (!project) throw new NotFoundError()
  const rows = await repo.tasks.listLiveWithBlockerCounts(tx, projectId)
  const assignments = await repo.assignments.listActiveForProject(tx, projectId)
  const members = await repo.members.listMembers(tx, projectId)
  const statuses = await repo.statuses.listLiveStatuses(tx, projectId)
  const blockerEdges = await repo.blockers.listLiveEdges(tx, projectId)
  const byTask = new Map<string, TaskAssigneeDTO[]>()
  for (const a of assignments) {
    byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), { assignmentId: a.id, userId: a.userId }])
  }
  const archived = project.archivedAt !== null
  return {
    project: { id: project.id, name: project.name, certainty: project.certainty, archived },
    viewer: {
      role: access.role,
      canEdit: !archived,
      canManage: (access.role === 'MANAGER' || access.role === 'LEAD') && !archived,
    },
    members: members.map((m) => ({ userId: m.userId, role: m.role })),
    tasks: rows.map((r) => toTaskDTO(r, byTask.get(r.id) ?? [])),
    statuses: statuses.map(toStatusDTO),
    blockerEdges,
  }
}
