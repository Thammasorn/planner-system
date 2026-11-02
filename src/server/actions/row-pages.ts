'use server'
// src/server/actions/row-pages.ts — database row body writes (SPEC §4.14 FR-1453, §7.7; plan/m11 S0.7, M11-D8).
// Shape: zod → db.transaction(service: requireDbRow(edit) first → insert-or-get → audit only when inserted) → result.
// No refresh(): the client sets qk.rowBody itself (the task-pages pattern).
import type { EnsureRowBodyResult } from '@/lib/contracts/row-pages'
import { ensureRowBodySchema } from '@/lib/schemas/row-pages'
import { action } from '../action'
import { db } from '../db/client'
import * as rowPages from '../services/row-pages'

/** Idempotent; the first call creates the DB_ROW page (audit `page · create`), later calls return it. */
export const ensureRowBody = action(
  ensureRowBodySchema,
  ({ rowId }, { user }): Promise<EnsureRowBodyResult> =>
    db.transaction(async (tx) => {
      const { audited: _audited, ...result } = await rowPages.ensureRowBody(tx, user, rowId)
      return result
    }),
)
