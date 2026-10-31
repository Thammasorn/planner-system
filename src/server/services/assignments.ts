// src/server/services/assignments.ts — task assignments (FR-605, BR-31, BR-60, AC-203, PERM-13/14, M3-D12/D13).
// Called after the action's authz (requireTasks / requireAssignments(…, 'edit')); a non-member target or restore needs
// 'manage' and is added as MEMBER in the same transaction (BR-60). The action writes the audit rows (M3-D4/D43).
// Invariant kept: an active assignment implies membership; only leaves are assigned.
import { randomUUID } from 'node:crypto'
import { th } from '@/i18n/th'
import type { AssignResult, RestoreAssignmentBatchResult, UnassignResult } from '@/lib/contracts/tasks'
import { displayName } from '@/lib/display-name'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import type { AssignmentRow } from '../repo/task-assignments'
import type { SessionUser } from '../session'
import { personDisplayName } from './shared'

/** BR-60: makes `userId` a MEMBER when it is not one yet (needs manage: Me → FORBIDDEN). True when added. */
async function ensureMember(tx: DbOrTx, user: SessionUser, projectId: string, userId: string): Promise<boolean> {
  if (await repo.members.getMember(tx, projectId, userId)) return false
  await authz.requireProject(tx, user, projectId, 'manage')
  await repo.members.insertMember(tx, { projectId, userId, role: 'MEMBER', addedBy: user.id })
  return true
}

export interface AssignOutcome extends AssignResult {
  personName: string
}

/** M3-D13: active target only; tasks with live children skipped (single task → CONFLICT); already assigned skipped. */
export async function assign(
  tx: DbOrTx,
  user: SessionUser,
  a: { projectId: string; taskIds: readonly string[]; userId: string },
): Promise<AssignOutcome> {
  const person = await repo.people.getPerson(tx, a.userId)
  if (!person || !person.active) {
    throw new ValidationError({ userId: [th.tasks.errors.userInactive] }, th.tasks.errors.userInactive)
  }
  const ids = [...new Set(a.taskIds)].sort()
  for (const id of ids) if (!(await repo.tasks.getLive(tx, id, { forUpdate: true }))) throw new NotFoundError()
  const parents = await repo.tasks.idsWithLiveChildren(tx, ids)
  if (a.taskIds.length === 1 && parents.size > 0) {
    throw new ConflictError('CONFLICT', th.tasks.errors.parentNotAssignable)
  }
  const leaves = ids.filter((id) => !parents.has(id))
  const isMember = (await repo.members.getMember(tx, a.projectId, a.userId)) !== null
  if (!isMember) await authz.requireProject(tx, user, a.projectId, 'manage')
  const addedMember = leaves.length > 0 && (await ensureMember(tx, user, a.projectId, a.userId))
  const created: AssignResult['created'] = []
  const alreadyAssignedIds: string[] = []
  for (const taskId of leaves) {
    const row = await repo.assignments.insertIfAbsent(tx, { taskId, userId: a.userId })
    if (row) created.push({ assignmentId: row.id, taskId })
    else alreadyAssignedIds.push(taskId)
  }
  return {
    projectId: a.projectId,
    created,
    addedMember,
    skippedParentIds: ids.filter((id) => parents.has(id)),
    alreadyAssignedIds,
    personName: displayName(person),
  }
}

/** × on a chip: soft-deletes the active rows under one server batch (plans stay attached from M6). */
export async function unassign(
  tx: DbOrTx,
  _user: SessionUser,
  a: { projectId: string; rows: readonly AssignmentRow[] },
): Promise<UnassignResult> {
  if (a.rows.some((r) => r.deletedAt !== null)) throw new NotFoundError()
  const batch = randomUUID()
  await repo.assignments.softDelete(
    tx,
    a.rows.map((r) => r.id),
    batch,
  )
  return { projectId: a.projectId, batch, taskIds: [...new Set(a.rows.map((r) => r.taskId))] }
}

export interface RestoredAssignment {
  assignmentId: string
  taskId: string
  userId: string
}

/**
 * Restores one unassign / member-removal batch (M3-D12): refused after 30 days; rows whose task is no longer a live
 * leaf, or whose (task, user) pair is active again, are skipped (counted, never a 23505); a user who is no longer a
 * member is re-added as MEMBER (needs manage, BR-60). `allowDeletedTasks` (FR-404 undo, M3-D14): rows on a
 * soft-deleted task come back too, so a later restore of that task finds its assignment as before (X13).
 */
export async function restoreAssignmentRows(
  tx: DbOrTx,
  user: SessionUser,
  a: { projectId: string; batch: string; allowDeletedTasks?: boolean },
): Promise<{ restored: RestoredAssignment[]; skipped: number }> {
  const rows = await repo.assignments.listBatch(tx, a.batch)
  if (rows.some((r) => !r.withinWindow)) {
    throw new ConflictError('CONFLICT', th.tasks.errors.restore.expired, { reason: 'expired' })
  }
  const restored: RestoredAssignment[] = []
  let skipped = 0
  for (const r of rows) {
    const task = await repo.tasks.getAny(tx, r.taskId, { forUpdate: true })
    const usable =
      task !== null &&
      task.projectId === a.projectId &&
      (task.deletedAt === null ? !(await repo.tasks.hasLiveChildren(tx, task.id)) : a.allowDeletedTasks === true)
    if (!usable) {
      skipped++
      continue
    }
    await ensureMember(tx, user, a.projectId, r.userId)
    if (await repo.assignments.restoreOne(tx, r.id)) {
      restored.push({ assignmentId: r.id, taskId: r.taskId, userId: r.userId })
    } else skipped++
  }
  return { restored, skipped }
}

export async function restoreAssignmentBatch(
  tx: DbOrTx,
  user: SessionUser,
  a: { projectId: string; batch: string },
): Promise<RestoreAssignmentBatchResult & { details: RestoredAssignment[] }> {
  const r = await restoreAssignmentRows(tx, user, a)
  return {
    projectId: a.projectId,
    restored: r.restored.map(({ assignmentId, taskId }) => ({ assignmentId, taskId })),
    skipped: r.skipped,
    details: r.restored,
  }
}

/** Names for assignment audit summaries: task names + the users' display names. */
export async function auditNames(
  tx: DbOrTx,
  items: readonly { taskId: string; userId: string }[],
): Promise<{ task: (id: string) => string; person: (id: string) => Promise<string> }> {
  const names = await repo.tasks.namesByIds(
    tx,
    items.map((i) => i.taskId),
  )
  const people = new Map<string, string>()
  return {
    task: (id) => names.get(id) ?? '',
    person: async (id) => {
      if (!people.has(id)) people.set(id, await personDisplayName(tx, id))
      return people.get(id)!
    },
  }
}
