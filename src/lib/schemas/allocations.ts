// src/lib/schemas/allocations.ts — plan writes (SPEC §7.4 saveAllocations, FR-612 planAssignmentRange; X65, BR-26,
// M6-D3/D6). Bounds are per cell (BR-26: WEEK ≤ 700, DAY ≤ 100 cd); business rules (UNREPRESENTABLE, MAX
// against the current plan) are the service's. Refinements skip values that already failed their own parse.
import { compareISO, diffDays, isISODate, isoWeekday } from '@/domain/dates'
import { th } from '@/i18n/th'
import { z } from '@/lib/z'

/** Most cells one batch may carry (8-week chunks × 53 rows is far below; protects the action body size). */
export const SAVE_MAX_ITEMS = 500
export const SAVE_MAX_CHANGES_PER_ITEM = 800
/** FR-612: N ≤ 371 days × 100 cd (M6-D6); range ≤ 371 days inclusive. */
export const PLAN_RANGE_MAX_CD = 37_100
export const PLAN_RANGE_MAX_DIFF_DAYS = 370

export const zChange = z
  .object({
    granularity: z.enum(['WEEK', 'DAY']),
    period: z.iso.date(),
    cd: z.number().int().min(0).max(700).nullable(), // null / 0 = delete
  })
  .superRefine((c, ctx) => {
    if (c.granularity === 'WEEK' && isISODate(c.period) && isoWeekday(c.period) !== 1) {
      ctx.addIssue({ code: 'custom', message: th.grid.errors.weekNotMonday, path: ['period'] })
    }
    if (c.granularity === 'DAY' && typeof c.cd === 'number' && c.cd > 100) {
      ctx.addIssue({ code: 'custom', message: th.grid.errors.maxDay, path: ['cd'] })
    }
  })

export const saveAllocationsSchema = z
  .object({
    items: z
      .array(
        z.object({
          taskAssignmentId: z.uuid(),
          baseVersion: z.number().int().min(1),
          changes: z.array(zChange).min(1).max(SAVE_MAX_CHANGES_PER_ITEM),
        }),
      )
      .min(1)
      .max(SAVE_MAX_ITEMS),
    onDayWeekConflict: z.enum(['SCALE', 'COLLAPSE']).optional(),
    clientOpId: z.string().min(1).max(64),
  })
  .refine((v) => new Set(v.items.map((i) => i.taskAssignmentId)).size === v.items.length, {
    error: th.grid.errors.invalidBatch,
    path: ['items'],
  })

export const planAssignmentRangeSchema = z
  .object({
    taskAssignmentId: z.uuid(),
    baseVersion: z.number().int().min(1).nullable(), // null only for dryRun
    totalCd: z.number().int().min(0).max(PLAN_RANGE_MAX_CD),
    start: z.iso.date(),
    end: z.iso.date(),
    dryRun: z.boolean(),
    clientOpId: z.string().min(1).max(64),
  })
  .superRefine((v, ctx) => {
    if (isISODate(v.start) && isISODate(v.end)) {
      if (compareISO(v.end, v.start) < 0) {
        ctx.addIssue({ code: 'custom', message: th.plan.errors.endBeforeStart, path: ['end'] })
      } else if (diffDays(v.start, v.end) > PLAN_RANGE_MAX_DIFF_DAYS) {
        ctx.addIssue({ code: 'custom', message: th.plan.errors.rangeTooLong, path: ['end'] })
      }
    }
    if (!v.dryRun && v.baseVersion === null) {
      ctx.addIssue({ code: 'custom', message: th.grid.errors.invalidBatch, path: ['baseVersion'] })
    }
  })

export type SaveAllocationsSchemaInput = z.input<typeof saveAllocationsSchema>
export type PlanAssignmentRangeSchemaInput = z.input<typeof planAssignmentRangeSchema>
