'use server'
// src/server/actions/task-pages.ts — task body writes (SPEC §4.6.4 FR-681, §7.7; plan/m06.1 S0.7 / S1.5).
// Shape: zod → db.transaction(service: requireTask(edit) first → insert-or-get → audit only when inserted) → result.
// No refresh() (M4-D29): the client sets qk.taskBody itself.
import type { EnsureTaskBodyResult } from '@/lib/contracts/task-pages'
import { ensureTaskBodySchema } from '@/lib/schemas/task-pages'
import { action } from '../action'
import { db } from '../db/client'
import * as taskPages from '../services/task-pages'

/** M6.1-D6: idempotent; the first call creates the TASK page (audit `page · create`), later calls return it. */
export const ensureTaskBody = action(
  ensureTaskBodySchema,
  ({ taskId }, { user }): Promise<EnsureTaskBodyResult> =>
    db.transaction(async (tx) => {
      const { audited: _audited, ...result } = await taskPages.ensureTaskBody(tx, user, taskId)
      return result
    }),
)
