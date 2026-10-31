// src/server/services/taskStatus.ts — the one status writer (SPEC v3.1 X71, BR-80–83, BR-87, FR-607/608/626/628,
// M3-D5, M3-D28, M3-D38). Checkbox (BR-82), board drag, status menu, bulk bar and undo all go through it. Called only
// after the action's authz (requireTasks(…, 'edit')); the action writes one audit row per changed task (M3-D4/D43).
// Never touches task_assignments (BR-87). Never reads the clock: `today` is a required trailing parameter (X90).
import { compareISO } from '@/domain/dates'
import { completionTransition, defaultStatus, firstDoneStatus } from '@/domain/status'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { SetTaskStatusResult } from '@/lib/contracts/tasks'
import type { DbOrTx } from '../db/types'
import { NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import type { SessionUser } from '../session'

export async function setStatus(
  tx: DbOrTx,
  user: SessionUser,
  a: {
    projectId: string
    taskIds: readonly string[]
    statusId: string
    withChildren: boolean
    only?: 'open' | 'completed'
  },
  today: ISODate,
): Promise<SetTaskStatusResult> {
  const target = await repo.statuses.getLiveInProject(tx, a.projectId, a.statusId)
  if (!target) throw new NotFoundError()
  const toDone = target.category === 'DONE'
  const extra = a.withChildren && toDone ? await repo.tasks.openLiveDescendantIds(tx, a.taskIds) : []
  const rows = await repo.tasks.lockWithCategory(tx, a.projectId, [...new Set([...a.taskIds, ...extra])])
  const changed: SetTaskStatusResult['changed'] = []
  for (const r of rows) {
    if (a.only === 'open' && r.category === 'DONE') continue
    if (a.only === 'completed' && r.category !== 'DONE') continue
    if (r.statusId === target.id) continue
    const t = completionTransition({ from: r.category, to: target.category, completedOn: r.completedOn, today })
    await repo.tasks.setStatusRow(tx, r.id, {
      statusId: target.id,
      completedOn: t.completedOn,
      completedBy: t.completedOn === null ? null : t.changed ? user.id : r.completedBy,
    })
    changed.push({ taskId: r.id, previous: { statusId: r.statusId, completedOn: r.completedOn } })
  }
  // FR-608: a single task moved to DONE without its children → the client asks about the open ones (M3-D38).
  const openDescendantIds =
    a.taskIds.length === 1 && toDone && !a.withChildren
      ? await repo.tasks.openLiveDescendantIds(tx, a.taskIds)
      : []
  return { projectId: a.projectId, statusId: target.id, changed, openDescendantIds }
}

/** BR-82: checkbox on → the first DONE status, for the open ids (+ open descendants with `withChildren`). */
export async function completeTask(
  tx: DbOrTx,
  user: SessionUser,
  a: { projectId: string; taskIds: readonly string[]; withChildren: boolean },
  today: ISODate,
): Promise<SetTaskStatusResult> {
  const done = firstDoneStatus(await repo.statuses.listLiveStatuses(tx, a.projectId))
  return setStatus(tx, user, { ...a, statusId: done.id, only: 'open' }, today)
}

/** BR-81/82: checkbox off → the default status, for the completed ids; never cascades (M3-D5). */
export async function uncompleteTask(
  tx: DbOrTx,
  user: SessionUser,
  a: { projectId: string; taskIds: readonly string[] },
  today: ISODate,
): Promise<SetTaskStatusResult> {
  const todo = defaultStatus(await repo.statuses.listLiveStatuses(tx, a.projectId))
  return setStatus(
    tx,
    user,
    { projectId: a.projectId, taskIds: a.taskIds, statusId: todo.id, withChildren: false, only: 'completed' },
    today,
  )
}

/**
 * M3-D28: exact undo — writes the given status and completedOn (no BR-80 recomputation). Each status must be a live
 * status of the project (else NOT_FOUND); completedOn must be set exactly for DONE statuses and not after `today`.
 * `changed` holds the inverse (the values before this call); unchanged items are left out.
 */
export async function revertStatuses(
  tx: DbOrTx,
  user: SessionUser,
  a: {
    projectId: string
    items: readonly { taskId: string; statusId: string; completedOn: ISODate | null }[]
  },
  today: ISODate,
): Promise<SetTaskStatusResult> {
  const items = new Map(a.items.map((i) => [i.taskId, i]))
  const categories = new Map<string, string>()
  for (const statusId of new Set(a.items.map((i) => i.statusId))) {
    const s = await repo.statuses.getLiveInProject(tx, a.projectId, statusId)
    if (!s) throw new NotFoundError()
    categories.set(s.id, s.category)
  }
  for (const i of items.values()) {
    const isDone = categories.get(i.statusId) === 'DONE'
    if (isDone !== (i.completedOn !== null)) throw new ValidationError({ items: [th.errors.VALIDATION] })
    if (i.completedOn !== null && compareISO(i.completedOn, today) > 0) {
      throw new ValidationError({ items: [th.tasks.errors.completedInFuture] }, th.tasks.errors.completedInFuture)
    }
  }
  const rows = await repo.tasks.lockWithCategory(tx, a.projectId, [...items.keys()])
  if (rows.length !== items.size) throw new NotFoundError()
  const changed: SetTaskStatusResult['changed'] = []
  for (const r of rows) {
    const i = items.get(r.id)!
    if (r.statusId === i.statusId && r.completedOn === i.completedOn) continue
    await repo.tasks.setStatusRow(tx, r.id, {
      statusId: i.statusId,
      completedOn: i.completedOn,
      completedBy: i.completedOn === null ? null : r.completedOn === i.completedOn ? r.completedBy : user.id,
    })
    changed.push({ taskId: r.id, previous: { statusId: r.statusId, completedOn: r.completedOn } })
  }
  return { projectId: a.projectId, statusId: null, changed, openDescendantIds: [] }
}
