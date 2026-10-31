'use server'
// src/server/actions/task-statuses.ts — per-project status set (SPEC v3.1 §3.2 PERM-23, FR-621–624, X72, plan/m03
// S2.14). Shape: zod → db.transaction(authz.requireStatus/requireProject(…, 'manage') → service (BR-84 in the same
// tx) → audit) → result. Me → FORBIDDEN, non-member → NOT_FOUND, archived → FORBIDDEN (X79).
import { th } from '@/i18n/th'
import type {
  DeleteTaskStatusResult,
  ReorderTaskStatusResult,
  RestoreTaskStatusBatchResult,
  TaskStatusResult,
} from '@/lib/contracts/tasks'
import {
  createTaskStatusSchema,
  deleteTaskStatusSchema,
  reorderTaskStatusSchema,
  restoreTaskStatusBatchSchema,
  updateTaskStatusSchema,
} from '@/lib/schemas/tasks'
import { action } from '../action'
import * as audit from '../audit'
import * as authz from '../authz'
import { serverToday } from '../clock'
import { db } from '../db/client'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'

export const createTaskStatus = action(createTaskStatusSchema, async (input, { user }): Promise<TaskStatusResult> =>
  db.transaction(async (tx) => {
    await authz.requireProject(tx, user, input.projectId, 'manage')
    const r = await services.taskStatuses.createTaskStatus(tx, user, input)
    await audit.log(tx, user, {
      entity: 'task_status',
      entityId: r.status.id,
      action: 'create',
      projectId: input.projectId,
      summary: th.audit.statusCreated(r.status.name),
      after: { name: r.status.name, category: r.status.category, color: r.status.color },
    })
    return r
  }),
)

export const updateTaskStatus = action(updateTaskStatusSchema, async (input, { user }): Promise<TaskStatusResult> =>
  db.transaction(async (tx) => {
    const { status } = await authz.requireStatus(tx, user, input.statusId, 'manage')
    const r = await services.taskStatuses.updateTaskStatus(tx, user, input)
    if (Object.keys(r.after).length > 0) {
      await audit.log(tx, user, {
        entity: 'task_status',
        entityId: status.id,
        action: 'update',
        projectId: status.projectId,
        summary: th.audit.statusUpdated(r.status.name),
        before: r.before,
        after: r.after,
      })
    }
    return { status: r.status }
  }),
)

export const reorderTaskStatus = action(
  reorderTaskStatusSchema,
  async (input, { user }): Promise<ReorderTaskStatusResult> =>
    db.transaction(async (tx) => {
      const { status } = await authz.requireStatus(tx, user, input.statusId, 'manage')
      const r = await services.taskStatuses.reorderTaskStatus(tx, user, input)
      await audit.log(tx, user, {
        entity: 'task_status',
        entityId: status.id,
        action: 'update',
        projectId: status.projectId,
        summary: th.audit.statusReordered(r.status.name),
        before: { afterId: r.previousAfterId },
        after: { afterId: input.afterId },
      })
      return r
    }),
)

/** FR-624 / X72: soft delete + move its tasks in one tx → `{ batch, moved }`. */
export const deleteTaskStatus = action(
  deleteTaskStatusSchema,
  async (input, { user }): Promise<DeleteTaskStatusResult> =>
    db.transaction(async (tx) => {
      const { status } = await authz.requireStatus(tx, user, input.statusId, 'manage')
      const { name, ...result } = await services.taskStatuses.deleteTaskStatus(tx, user, input, serverToday())
      await audit.log(tx, user, {
        entity: 'task_status',
        entityId: status.id,
        action: 'delete',
        projectId: status.projectId,
        summary: th.audit.statusDeleted(name, result.moved.length),
        after: { batch: result.batch, moveToStatusId: result.moveToStatusId, moved: result.moved.length },
      })
      return result
    }),
)

/** Undo of deleteTaskStatus (X72, M3-D29): re-checks authz, the 30-day window and BR-84 / names. */
export const restoreTaskStatusBatch = action(
  restoreTaskStatusBatchSchema,
  async (input, { user }): Promise<RestoreTaskStatusBatchResult> =>
    db.transaction(async (tx) => {
      const deleted = await repo.statuses.getByBatch(tx, input.batch)
      if (!deleted) throw new NotFoundError()
      await authz.requireProject(tx, user, deleted.projectId, 'manage')
      const { name, ...result } = await services.taskStatuses.restoreTaskStatusBatch(
        tx,
        user,
        input,
        serverToday(),
      )
      await audit.log(tx, user, {
        entity: 'task_status',
        entityId: deleted.id,
        action: 'restore',
        projectId: deleted.projectId,
        summary: th.audit.statusRestored(name),
        after: { batch: input.batch, restored: result.restored, skipped: result.skipped },
      })
      return result
    }),
)
