// src/lib/schemas/workload.ts — queries of the M9 workload / people routes (plan/m09 S0.4, M9-D2/D4/D5/D9/D16).
// `from`/`to` are Mondays, `to` exclusive, both or neither (the route applies the default [weekStart(today), +12 w)),
// ≤ 53 weeks (same rule as the grid, GRID_MAX_WEEKS). Parse precedes authz and reveals nothing (X41).
import { compareISO, diffDays, isISODate, isoWeekday } from '@/domain/dates'
import { th } from '@/i18n/th'
import { GRID_MAX_WEEKS } from '@/lib/schemas/grid'
import { zUserId } from '@/lib/schemas/tasks'
import { z } from '@/lib/z'

const zMonday = z.iso.date().refine((d) => isISODate(d) && isoWeekday(d) === 1, {
  error: th.grid.errors.weekNotMonday,
})

const zFlag = z
  .enum(['0', '1'])
  .default('0')
  .transform((v) => v === '1')

export const workloadQuerySchema = z
  .object({
    from: zMonday.optional(),
    to: zMonday.optional(),
    positionId: z.uuid().optional(),
    projectId: z.uuid().optional(),
    onlyOver: zFlag,
  })
  .superRefine((q, ctx) => {
    if ((q.from === undefined) !== (q.to === undefined)) {
      ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['to'] })
      return
    }
    if (q.from === undefined || q.to === undefined || !isISODate(q.from) || !isISODate(q.to)) return
    if (compareISO(q.to, q.from) <= 0 || diffDays(q.from, q.to) > GRID_MAX_WEEKS * 7)
      ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['to'] })
  })

export type WorkloadQuery = z.output<typeof workloadQuerySchema>

export const workloadCellQuerySchema = z.object({ userId: zUserId, week: zMonday })
export type WorkloadCellQuery = z.output<typeof workloadCellQuerySchema>

/** Fixed window [weekStart(today) − 52 w, weekStart(today) + 53 w) (M9-D16) — no parameters. */
export const personTimeOffQuerySchema = z.object({})
