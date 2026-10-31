'use server'
// src/server/actions/assignments.ts — task assignments (§3.2 PERM-13/14, FR-605, BR-31, BR-60, plan/m03 S2.7).
// Shape: zod → db.transaction(authz.requireTasks/requireAssignments(…, 'edit') [+ 'manage' for non-members, inside the
// service] → service → audit, one row per assignment, M3-D4) → result. No refresh() (X18).
import { th } from '@/i18n/th'
import type { AssignResult, RestoreAssignmentBatchResult, UnassignResult } from '@/lib/contracts/tasks'
import { assignSchema, restoreAssignmentBatchSchema, unassignSchema } from '@/lib/schemas/tasks'
import { action } from '../action'
import * as audit from '../audit'
import * as authz from '../authz'
import { db } from '../db/client'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'

/** FR-605, M3-D13; a non-member target needs manage and is added as MEMBER in the same tx (BR-60). */
export const assign = action(assignSchema, async (input, { user }): Promise<AssignResult> =>
  db.transaction(async (tx) => {
    const acc = await authz.requireTasks(tx, user, input.taskIds, 'edit')
    const { personName, ...result } = await services.assignments.assign(tx, user, {
      projectId: acc.projectId,
      taskIds: input.taskIds,
      userId: input.userId,
    })
    const names = await repo.tasks.namesByIds(
      tx,
      result.created.map((c) => c.taskId),
    )
    for (const [i, c] of result.created.entries()) {
      const addedMember = i === 0 && result.addedMember // BR-60 recorded inside the first row (M3-D4)
      await audit.log(tx, user, {
        entity: 'task_assignment',
        entityId: c.assignmentId,
        action: 'create',
        projectId: acc.projectId,
        summary: th.audit.assignmentCreated(names.get(c.taskId) ?? '', personName),
        after: { taskId: c.taskId, userId: input.userId, ...(addedMember ? { addedMember: input.userId } : {}) },
      })
    }
    return result
  }),
)

/** FR-605 × on a chip (soft delete under one batch). Need: edit. Already removed → NOT_FOUND. */
export const unassign = action(unassignSchema, async (input, { user }): Promise<UnassignResult> =>
  db.transaction(async (tx) => {
    const acc = await authz.requireAssignments(tx, user, input.assignmentIds, 'edit')
    if (acc.rows.some((r) => r.deletedAt !== null)) throw new NotFoundError()
    const result = await services.assignments.unassign(tx, user, { projectId: acc.projectId, rows: acc.rows })
    const n = await services.assignments.auditNames(tx, acc.rows)
    for (const r of acc.rows) {
      await audit.log(tx, user, {
        entity: 'task_assignment',
        entityId: r.id,
        action: 'delete',
        projectId: acc.projectId,
        summary: th.audit.assignmentRemoved(n.task(r.taskId), await n.person(r.userId)),
        after: { batch: result.batch },
      })
    }
    return result
  }),
)

/** Undo of unassign (M3-D12); re-adding a member needs manage (BR-60). */
export const restoreAssignmentBatch = action(
  restoreAssignmentBatchSchema,
  async (input, { user }): Promise<RestoreAssignmentBatchResult> =>
    db.transaction(async (tx) => {
      const rows = await repo.assignments.listBatch(tx, input.batch)
      if (rows.length === 0) throw new NotFoundError()
      const acc = await authz.requireAssignments(
        tx,
        user,
        rows.map((r) => r.id),
        'edit',
        { includeDeletedTasks: true },
      )
      const { details, ...result } = await services.assignments.restoreAssignmentBatch(tx, user, {
        projectId: acc.projectId,
        batch: input.batch,
      })
      const n = await services.assignments.auditNames(tx, details)
      for (const d of details) {
        await audit.log(tx, user, {
          entity: 'task_assignment',
          entityId: d.assignmentId,
          action: 'restore',
          projectId: acc.projectId,
          summary: th.audit.assignmentRestored(n.task(d.taskId), await n.person(d.userId)),
          after: { batch: input.batch },
        })
      }
      return result
    }),
)
