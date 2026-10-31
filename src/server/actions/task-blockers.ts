'use server'
// src/server/actions/task-blockers.ts — "ถูกขวางโดย" links (SPEC v3.1 §3.2 PERM-11, FR-640–645, BR-85, X73, plan/m03
// S2.15). Shape: zod → db.transaction(authz.requireTask(…, 'edit') → service, which writes its own audit row
// (M3-D43: an existing edge returns `created: false` without one)) → result.
import type { AddTaskBlockerResult, RemoveTaskBlockerResult } from '@/lib/contracts/tasks'
import { addTaskBlockerSchema, removeTaskBlockerSchema } from '@/lib/schemas/tasks'
import { action } from '../action'
import * as authz from '../authz'
import { db } from '../db/client'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'

export const addTaskBlocker = action(addTaskBlockerSchema, async (input, { user }): Promise<AddTaskBlockerResult> =>
  db.transaction(async (tx) => {
    await authz.requireTask(tx, user, input.taskId, 'edit')
    return services.taskBlockers.addTaskBlocker(tx, user, input)
  }),
)

/** Undo = addTaskBlocker on the same pair (M3-D31). */
export const removeTaskBlocker = action(
  removeTaskBlockerSchema,
  async (input, { user }): Promise<RemoveTaskBlockerResult> =>
    db.transaction(async (tx) => {
      const edge = await repo.blockers.getLive(tx, input.blockerId)
      if (!edge) throw new NotFoundError()
      await authz.requireTask(tx, user, edge.taskId, 'edit')
      return services.taskBlockers.removeTaskBlocker(tx, user, input)
    }),
)
