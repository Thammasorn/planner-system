'use server'
// src/server/actions/allocations.ts — plan writes (§3.2 PERM-12, SPEC §7.4, FR-612; X65, M6-D3/D6).
// Shape: zod (wrapper) → services.allocations.* inside withDeadlockRetry(db.transaction(…)) — the service locks the
// assignments, authorizes per item (authz.requireProject 'edit') before touching allocations, and writes one audit
// row per changed assignment in the same tx. Never calls the Next.js refresh API (PLAN §1.3): the grid reads via TanStack Query.
import type { PlanAssignmentRangeOk, SaveAllocationsOk } from '@/lib/contracts/grid'
import { planAssignmentRangeSchema, saveAllocationsSchema } from '@/lib/schemas/allocations'
import { action } from '../action'
import { serverToday } from '../clock'
import { db } from '../db/client'
import { withDeadlockRetry } from '../db/retry'
import * as services from '../services'

/** Batch grid save `{ items[], onDayWeekConflict?, clientOpId }` → authoritative `results` (X65). */
export const saveAllocations = action<typeof saveAllocationsSchema, SaveAllocationsOk>(
  saveAllocationsSchema,
  (input, { user }) => {
    const today = serverToday()
    return withDeadlockRetry(() => db.transaction((tx) => services.allocations.save(tx, user, input, today)))
  },
)

/** FR-612 "วางแผน N วัน" per assignee: dryRun preview, then apply as one undo entry (BR-25, M6-D6). */
export const planAssignmentRange = action<typeof planAssignmentRangeSchema, PlanAssignmentRangeOk>(
  planAssignmentRangeSchema,
  (input, { user }) => {
    const today = serverToday()
    return withDeadlockRetry(() => db.transaction((tx) => services.allocations.planRange(tx, user, input, today)))
  },
)
