// src/server/services/taskStatuses.ts — per-project status set (SPEC v3.1 FR-620–624, BR-81/83/84, PERM-23, X70,
// X72, M3-D25–D27, M3-D29). camelCase file name is the documented exception (X80). Every change runs after the
// action's authz, under the project's status advisory lock, with BR-84 checked in the same transaction. The action
// writes the audit row (M3-D43). Services never read the clock: `today` is a required parameter.
import { randomUUID } from 'node:crypto'
import { compareISO } from '@/domain/dates'
import {
  completionTransition,
  DEFAULT_STATUSES,
  defaultStatus,
  type StatusSetProblem,
  validateStatusSet,
} from '@/domain/status'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type {
  DeleteTaskStatusResult,
  ProjectStatusesResponse,
  ReorderTaskStatusResult,
  RestoreTaskStatusBatchResult,
  TaskStatusDTO,
} from '@/lib/contracts/tasks'
import type {
  createTaskStatusSchema,
  deleteTaskStatusSchema,
  reorderTaskStatusSchema,
  restoreTaskStatusBatchSchema,
  updateTaskStatusSchema,
} from '@/lib/schemas/tasks'
import type { z } from '@/lib/z'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, pgErrorInfo, ValidationError } from '../errors'
import * as repo from '../repo'
import type { StatusPatch, TaskStatusRow } from '../repo/task-statuses'
import type { SessionUser } from '../session'
import { keyAmong } from './order-keys'

export function toStatusDTO(s: TaskStatusRow): TaskStatusDTO {
  return { id: s.id, projectId: s.projectId, name: s.name, color: s.color, category: s.category, position: s.position }
}

const E = th.tasks.status.errors
const PROBLEM_MESSAGE: Record<StatusSetProblem, string> = {
  TOO_MANY: E.tooMany,
  DUPLICATE_NAME: E.duplicateName,
  NO_TODO: E.needTodo,
  NO_DONE: E.needDone,
}
const PROBLEM_FIELD: Record<StatusSetProblem, string> = {
  TOO_MANY: 'name',
  DUPLICATE_NAME: 'name',
  NO_TODO: 'category',
  NO_DONE: 'category',
}
const invalid = (field: string, message: string): ValidationError =>
  new ValidationError({ [field]: [message] }, message)
const problemError = (p: StatusSetProblem): ValidationError => invalid(PROBLEM_FIELD[p], PROBLEM_MESSAGE[p])

/** Serialises status-set changes of one project (BR-84 / name checks see committed state). */
async function lockStatusSet(tx: DbOrTx, projectId: string): Promise<void> {
  await repo.order.lockOrderScope(tx, `task_statuses:${projectId}`)
}

/** No live status → insert the 5 FR-621 defaults (names from th, keys spread evenly). True if inserted. */
export async function ensureProjectStatuses(tx: DbOrTx, projectId: string): Promise<boolean> {
  await lockStatusSet(tx, projectId)
  if ((await repo.statuses.listLiveStatuses(tx, projectId)).length > 0) return false
  const keys = repo.order.rekey(DEFAULT_STATUSES.length)
  for (const [i, d] of DEFAULT_STATUSES.entries()) {
    await repo.statuses.insertTaskStatus(tx, {
      projectId,
      name: th.tasks.status.defaults[d.key],
      category: d.category,
      color: d.color,
      position: keys[i]!,
    })
  }
  return true
}

/** Bootstrap + seed backfill (X70); idempotent. Returns how many projects got the defaults. */
export async function ensureAllProjectStatuses(tx: DbOrTx): Promise<number> {
  let n = 0
  for (const id of await repo.statuses.projectIdsWithoutStatuses(tx)) {
    if (await ensureProjectStatuses(tx, id)) n++
  }
  return n
}

/** Live statuses, ORDER BY position, id. */
export function listStatuses(tx: DbOrTx, projectId: string): Promise<TaskStatusRow[]> {
  return repo.statuses.listLiveStatuses(tx, projectId)
}

/** Live tasks per live status (every live status present, 0 when unused). */
export async function statusUsage(tx: DbOrTx, projectId: string): Promise<Record<string, number>> {
  const [statuses, counts] = [await listStatuses(tx, projectId), await repo.statuses.usage(tx, projectId)]
  return Object.fromEntries(statuses.map((s) => [s.id, counts[s.id] ?? 0]))
}

/** GET /api/projects/[id]/statuses — authz first (archived readable). */
export async function listProjectStatuses(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string,
): Promise<ProjectStatusesResponse> {
  const access = await authz.requireProject(tx, user, projectId, 'view')
  const statuses = await listStatuses(tx, projectId)
  return {
    statuses: statuses.map(toStatusDTO),
    usage: await statusUsage(tx, projectId),
    canManage: (access.role === 'MANAGER' || access.role === 'LEAD') && !access.archived,
  }
}

/** 23505 on task_statuses_name → VALIDATION duplicateName (the DB is the backstop of the service check). */
async function guardDuplicate<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f()
  } catch (e) {
    if (pgErrorInfo(e).code === '23505') throw invalid('name', E.duplicateName)
    throw e
  }
}

export async function createTaskStatus(
  tx: DbOrTx,
  _user: SessionUser,
  a: z.output<typeof createTaskStatusSchema>,
): Promise<{ status: TaskStatusDTO }> {
  await lockStatusSet(tx, a.projectId)
  const live = await listStatuses(tx, a.projectId)
  const problem = validateStatusSet([...live, { name: a.name, category: a.category }])
  if (problem) throw problemError(problem)
  const position = await keyAmong(live, a.afterId, (id, p) =>
    repo.statuses.updateStatusRow(tx, id, { position: p }).then(() => undefined),
  )
  const row = await guardDuplicate(() =>
    repo.statuses.insertTaskStatus(tx, {
      projectId: a.projectId,
      name: a.name,
      category: a.category,
      color: a.color,
      position,
    }),
  )
  return { status: toStatusDTO(row) }
}

/** Rename / colour / category (M3-D27: into or out of DONE while live tasks use it → VALIDATION). */
export async function updateTaskStatus(
  tx: DbOrTx,
  _user: SessionUser,
  a: z.output<typeof updateTaskStatusSchema>,
): Promise<{ status: TaskStatusDTO; before: StatusPatch; after: StatusPatch }> {
  const first = await repo.statuses.getLiveById(tx, a.statusId)
  if (!first) throw new NotFoundError()
  await lockStatusSet(tx, first.projectId)
  const live = await listStatuses(tx, first.projectId)
  const cur = live.find((s) => s.id === a.statusId)
  if (!cur) throw new NotFoundError()
  const before: StatusPatch = {}
  const after: StatusPatch = {}
  for (const k of ['name', 'category', 'color'] as const) {
    const v = a.patch[k]
    if (v === undefined || v === cur[k]) continue
    Object.assign(before, { [k]: cur[k] })
    Object.assign(after, { [k]: v })
  }
  if (Object.keys(after).length === 0) return { status: toStatusDTO(cur), before, after }
  const next = live.map((s) => (s.id === cur.id ? { ...s, ...after } : s))
  const problem = validateStatusSet(next)
  if (problem) throw problemError(problem)
  if (
    after.category !== undefined &&
    (cur.category === 'DONE') !== (after.category === 'DONE') &&
    (await repo.statuses.liveTaskCount(tx, cur.id)) > 0
  ) {
    throw invalid('category', E.doneCategoryInUse)
  }
  const row = await guardDuplicate(() => repo.statuses.updateStatusRow(tx, cur.id, after))
  return { status: toStatusDTO(row), before, after }
}

/** Board column order (X48 keying); `previousAfterId` is the undo target (M3-D29). */
export async function reorderTaskStatus(
  tx: DbOrTx,
  _user: SessionUser,
  a: z.output<typeof reorderTaskStatusSchema>,
): Promise<ReorderTaskStatusResult> {
  const first = await repo.statuses.getLiveById(tx, a.statusId)
  if (!first) throw new NotFoundError()
  await lockStatusSet(tx, first.projectId)
  const live = await listStatuses(tx, first.projectId)
  const i = live.findIndex((s) => s.id === a.statusId)
  if (i < 0) throw new NotFoundError()
  const previousAfterId = i > 0 ? live[i - 1]!.id : null
  if (previousAfterId === a.afterId) return { status: toStatusDTO(live[i]!), previousAfterId }
  const others = live.filter((s) => s.id !== a.statusId)
  const position = await keyAmong(others, a.afterId, (id, p) =>
    repo.statuses.updateStatusRow(tx, id, { position: p }).then(() => undefined),
  )
  const row = await repo.statuses.updateStatusRow(tx, a.statusId, { position })
  return { status: toStatusDTO(row), previousAfterId }
}

/**
 * FR-624 / X72 / M3-D29: soft-deletes the status under a batch and moves its tasks (live ones listed in `moved` with
 * their previous `completedOn`; soft-deleted ones moved silently) applying BR-80. Used status without destination →
 * VALIDATION needDestination; BR-84 on the remaining set.
 */
export async function deleteTaskStatus(
  tx: DbOrTx,
  user: SessionUser,
  a: z.output<typeof deleteTaskStatusSchema>,
  today: ISODate,
): Promise<DeleteTaskStatusResult & { name: string }> {
  const first = await repo.statuses.getLiveById(tx, a.statusId)
  if (!first) throw new NotFoundError()
  const projectId = first.projectId
  await lockStatusSet(tx, projectId)
  const live = await listStatuses(tx, projectId)
  const status = live.find((s) => s.id === a.statusId)
  if (!status) throw new NotFoundError()
  const rest = live.filter((s) => s.id !== status.id)
  const problem = validateStatusSet(rest)
  if (problem) throw problemError(problem)

  let dest: TaskStatusRow | null = null
  if (a.moveToStatusId !== undefined) {
    dest = rest.find((s) => s.id === a.moveToStatusId) ?? null
    if (!dest) throw new NotFoundError()
  }
  const onIt = await repo.statuses.lockTasksOnStatus(tx, status.id)
  if (!dest && onIt.some((t) => t.live)) throw invalid('moveToStatusId', E.needDestination)
  const target = dest ?? (onIt.length > 0 ? defaultStatus(rest) : null)

  const batch = randomUUID()
  const moved: DeleteTaskStatusResult['moved'] = []
  if (target) {
    for (const t of onIt) {
      const tr = completionTransition({
        from: status.category,
        to: target.category,
        completedOn: t.completedOn,
        today,
      })
      await repo.tasks.setStatusRow(tx, t.id, {
        statusId: target.id,
        completedOn: tr.completedOn,
        completedBy: tr.completedOn === null ? null : tr.changed ? user.id : t.completedBy,
      })
      if (t.live) moved.push({ taskId: t.id, fromStatusId: status.id, completedOn: t.completedOn })
    }
  }
  await repo.statuses.softDelete(tx, status.id, batch)
  return { projectId, batch, moveToStatusId: dest?.id ?? null, moved, name: status.name }
}

/**
 * Undo of deleteTaskStatus (X72): 30 days, no name clash / too many (→ CONFLICT with the reason), old position kept;
 * only live tasks still on `moveToStatusId` go back, with their exact previous `completedOn` (never clobbers later
 * edits: others are counted in `skipped`).
 */
export async function restoreTaskStatusBatch(
  tx: DbOrTx,
  user: SessionUser,
  a: z.output<typeof restoreTaskStatusBatchSchema>,
  today: ISODate,
): Promise<RestoreTaskStatusBatchResult & { name: string }> {
  const first = await repo.statuses.getByBatch(tx, a.batch)
  if (!first) throw new NotFoundError()
  const projectId = first.projectId
  await lockStatusSet(tx, projectId)
  const st = await repo.statuses.getByBatch(tx, a.batch)
  if (!st) throw new NotFoundError()
  if (!st.withinWindow) {
    throw new ConflictError('CONFLICT', th.tasks.errors.restore.expired, { reason: 'expired' })
  }
  const live = await listStatuses(tx, projectId)
  const problem = validateStatusSet([...live, st])
  if (problem) throw new ConflictError('CONFLICT', PROBLEM_MESSAGE[problem], { reason: problem })
  const restoredRow = await guardDuplicate(() => repo.statuses.undelete(tx, st.id))

  let restored = 0
  let skipped = 0
  if (a.moveToStatusId !== null && a.moved.length > 0) {
    const rows = await repo.tasks.lockWithCategory(
      tx,
      projectId,
      a.moved.map((m) => m.taskId),
    )
    const byId = new Map(rows.map((r) => [r.id, r]))
    const isDone = st.category === 'DONE'
    for (const m of a.moved) {
      const r = byId.get(m.taskId)
      const consistent =
        m.fromStatusId === st.id &&
        isDone === (m.completedOn !== null) &&
        (m.completedOn === null || compareISO(m.completedOn, today) <= 0)
      if (!r || r.statusId !== a.moveToStatusId || !consistent) {
        skipped++
        continue
      }
      await repo.tasks.setStatusRow(tx, r.id, {
        statusId: st.id,
        completedOn: m.completedOn,
        completedBy:
          m.completedOn === null ? null : r.completedOn === m.completedOn ? r.completedBy : user.id,
      })
      restored++
    }
  }
  return { projectId, status: toStatusDTO(restoredRow), restored, skipped, name: st.name }
}
