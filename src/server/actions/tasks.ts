'use server'
// src/server/actions/tasks.ts — task tree, fields and status changes (§3.2 PERM-11, SPEC §7.8, plan/m03 S2.3–S2.8).
// Shape: zod (wrapper) → db.transaction(lookup → authz.requireTask(s)/requireProject(…, 'edit') → service → audit) →
// result. "Today" comes from serverToday() and is passed to the service (M3-D43). No refresh(): the views are
// TanStack queries the client invalidates (X18).
import { th } from '@/i18n/th'
import type {
  CreateTaskResult,
  DeleteTaskTreeResult,
  RestoreTaskBatchResult,
  SetTaskStatusResult,
  TreeMoveResult,
  UpdateTaskResult,
} from '@/lib/contracts/tasks'
import {
  completeTaskSchema,
  createTaskSchema,
  deleteTaskTreeSchema,
  moveTaskSchema,
  restoreTaskBatchSchema,
  revertTaskStatusSchema,
  setTaskStatusSchema,
  taskRefSchema,
  uncompleteTaskSchema,
  updateTaskSchema,
} from '@/lib/schemas/tasks'
import { action } from '../action'
import * as audit from '../audit'
import * as authz from '../authz'
import { serverToday } from '../clock'
import { db } from '../db/client'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'
import type { SessionUser } from '../session'

/** FR-602, FR-610 (transfer), FR-625/664 (status). Need: edit. */
export const createTask = action(createTaskSchema, async (input, { user }): Promise<CreateTaskResult> =>
  db.transaction(async (tx) => {
    await authz.requireProject(tx, user, input.projectId, 'edit')
    const r = await services.tasks.createTask(tx, user, input, serverToday())
    await audit.log(tx, user, {
      entity: 'task',
      entityId: r.task.id,
      action: 'create',
      projectId: input.projectId,
      summary: th.audit.taskCreated(r.task.name),
      after: { parentId: input.parentId, statusId: r.task.statusId, transfer: r.transfer },
    })
    return r
  }),
)

/** FR-601. Need: edit. */
export const updateTask = action(updateTaskSchema, async (input, { user }): Promise<UpdateTaskResult> =>
  db.transaction(async (tx) => {
    const { task } = await authz.requireTask(tx, user, input.taskId, 'edit')
    const r = await services.tasks.updateTask(tx, user, input)
    if (Object.keys(r.after).length > 0) {
      await audit.log(tx, user, {
        entity: 'task',
        entityId: task.id,
        action: 'update',
        projectId: task.projectId,
        summary: th.audit.taskUpdated(r.name),
        before: r.before,
        after: r.after,
      })
    }
    return { task: r.task }
  }),
)

async function auditMove(tx: DbOrTx, user: SessionUser, r: TreeMoveResult): Promise<TreeMoveResult> {
  if (!r.changed) return r
  await audit.log(tx, user, {
    entity: 'task',
    entityId: r.task.id,
    action: 'update',
    projectId: r.task.projectId,
    summary: th.audit.taskMoved(r.task.name),
    before: { ...r.previous },
    after: { parentId: r.task.parentId, transfer: r.transfer },
  })
  return r
}

/** FR-603 Tab (over-limit → `{ changed: false }`, AC-602). Need: edit. */
export const indentTask = action(taskRefSchema, async (input, { user }): Promise<TreeMoveResult> =>
  db.transaction(async (tx) => {
    await authz.requireTask(tx, user, input.taskId, 'edit')
    return auditMove(tx, user, await services.tasks.indentTask(tx, user, input))
  }),
)

/** FR-603 Shift+Tab. Need: edit. */
export const outdentTask = action(taskRefSchema, async (input, { user }): Promise<TreeMoveResult> =>
  db.transaction(async (tx) => {
    await authz.requireTask(tx, user, input.taskId, 'edit')
    return auditMove(tx, user, await services.tasks.outdentTask(tx, user, input))
  }),
)

/** FR-604 drag / move menu; `transfer` = undo/redo of a BR-31 move (M3-D3). Need: edit. */
export const moveTask = action(moveTaskSchema, async (input, { user }): Promise<TreeMoveResult> =>
  db.transaction(async (tx) => {
    await authz.requireTask(tx, user, input.taskId, 'edit')
    return auditMove(tx, user, await services.tasks.moveTask(tx, user, input))
  }),
)

/** One audit row per changed task (M3-D4); names from the DB, never from the client. */
async function auditStatusChanges(
  tx: DbOrTx,
  user: SessionUser,
  r: SetTaskStatusResult,
): Promise<SetTaskStatusResult> {
  const ids = r.changed.map((c) => c.taskId)
  const names = await repo.tasks.namesByIds(tx, ids)
  const statusIds = new Map<string, string>()
  for (const t of await repo.tasks.statusIdsOf(tx, ids)) statusIds.set(t.id, t.statusId)
  const statusNames = await repo.statuses.namesByIds(tx, [...new Set(statusIds.values())])
  for (const c of r.changed) {
    const statusId = statusIds.get(c.taskId) ?? ''
    await audit.log(tx, user, {
      entity: 'task',
      entityId: c.taskId,
      action: 'update',
      projectId: r.projectId,
      summary: th.audit.taskStatusChanged(names.get(c.taskId) ?? '', statusNames.get(statusId) ?? ''),
      before: { ...c.previous },
      after: { statusId },
    })
  }
  return r
}

/** FR-607/608 via setStatus to the first DONE status (BR-82, M3-D5). Need: edit. */
export const completeTask = action(completeTaskSchema, async (input, { user }): Promise<SetTaskStatusResult> =>
  db.transaction(async (tx) => {
    const acc = await authz.requireTasks(tx, user, input.taskIds, 'edit')
    const r = await services.taskStatus.completeTask(
      tx,
      user,
      { projectId: acc.projectId, taskIds: input.taskIds, withChildren: input.withChildren },
      serverToday(),
    )
    return auditStatusChanges(tx, user, r)
  }),
)

/** FR-607 via setStatus to the default status (BR-81, M3-D5). Need: edit. */
export const uncompleteTask = action(uncompleteTaskSchema, async (input, { user }): Promise<SetTaskStatusResult> =>
  db.transaction(async (tx) => {
    const acc = await authz.requireTasks(tx, user, input.taskIds, 'edit')
    const r = await services.taskStatus.uncompleteTask(
      tx,
      user,
      { projectId: acc.projectId, taskIds: input.taskIds },
      serverToday(),
    )
    return auditStatusChanges(tx, user, r)
  }),
)

/** v3.1 FR-626 (X71): chip, panel, board drag, bulk bar. Need: edit (PERM-11). */
export const setTaskStatus = action(setTaskStatusSchema, async (input, { user }): Promise<SetTaskStatusResult> =>
  db.transaction(async (tx) => {
    const acc = await authz.requireTasks(tx, user, input.taskIds, 'edit')
    const r = await services.taskStatus.setStatus(
      tx,
      user,
      {
        projectId: acc.projectId,
        taskIds: input.taskIds,
        statusId: input.statusId,
        withChildren: input.withChildren,
      },
      serverToday(),
    )
    return auditStatusChanges(tx, user, r)
  }),
)

/** M3-D28: exact undo of setTaskStatus / completeTask / uncompleteTask. Need: edit (PERM-11). */
export const revertTaskStatus = action(revertTaskStatusSchema, async (input, { user }): Promise<SetTaskStatusResult> =>
  db.transaction(async (tx) => {
    const acc = await authz.requireTasks(
      tx,
      user,
      input.items.map((i) => i.taskId),
      'edit',
    )
    const r = await services.taskStatus.revertStatuses(
      tx,
      user,
      { projectId: acc.projectId, items: input.items },
      serverToday(),
    )
    return auditStatusChanges(tx, user, r)
  }),
)

/** FR-609, BR-32: subtrees under one batch; one audit row per root (M3-D4). Need: edit. */
export const deleteTaskTree = action(deleteTaskTreeSchema, async (input, { user }): Promise<DeleteTaskTreeResult> =>
  db.transaction(async (tx) => {
    const acc = await authz.requireTasks(tx, user, input.taskIds, 'edit')
    const { roots, ...result } = await services.tasks.deleteTaskTree(tx, user, {
      projectId: acc.projectId,
      tasks: acc.tasks,
      taskIds: input.taskIds,
      ...(input.transfer ? { transfer: input.transfer } : {}),
    })
    for (const r of roots) {
      await audit.log(tx, user, {
        entity: 'task',
        entityId: r.id,
        action: 'delete',
        projectId: acc.projectId,
        summary: th.audit.taskDeleted(r.name, r.descendants),
        after: { batch: result.batch },
      })
    }
    return result
  }),
)

/** §7.5 UNDO-3/4/5, M3-D12: re-checks authz (archived → 403), 30 days, live parent, depth. Need: edit. */
export const restoreTaskBatch = action(restoreTaskBatchSchema, async (input, { user }): Promise<RestoreTaskBatchResult> =>
  db.transaction(async (tx) => {
    const [first] = await repo.tasks.listBatch(tx, input.batch)
    if (!first) throw new NotFoundError()
    await authz.requireProject(tx, user, first.projectId, 'edit')
    const { roots, ...result } = await services.tasks.restoreTaskBatch(tx, user, {
      projectId: first.projectId,
      batch: input.batch,
      ...(input.transfer ? { transfer: input.transfer } : {}),
    })
    for (const r of roots) {
      await audit.log(tx, user, {
        entity: 'task',
        entityId: r.id,
        action: 'restore',
        projectId: first.projectId,
        summary: th.audit.taskRestored(r.name, r.descendants),
        after: { batch: input.batch },
      })
    }
    return result
  }),
)
