// src/lib/schemas/grid.ts — query of GET /api/grid/project/[projectId] (X65, r6b M6-31). `from`/`to` are Mondays,
// `to` exclusive, both or neither (default window −4/+12 weeks is applied by the route), ≤ 53 weeks. M7 (M7-D17):
// `expand=<Monday>,<Monday>` (each a Monday in [from, to), ≤ 53, needs an explicit window) and `zoom=week|day`
// (lowercase, default week). Parse precedes authz and reveals nothing (X41).
import { compareISO, diffDays, isISODate, isoWeekday } from '@/domain/dates'
import { th } from '@/i18n/th'
import { z } from '@/lib/z'

export const GRID_MAX_WEEKS = 53

const zMonday = z.iso.date().refine((d) => isISODate(d) && isoWeekday(d) === 1, {
  error: th.grid.errors.weekNotMonday,
})

export const gridQuerySchema = z
  .object({
    from: zMonday.optional(),
    to: zMonday.optional(),
    includeOthers: z
      .enum(['0', '1'])
      .default('0')
      .transform((v) => v === '1'),
    // M7
    expand: z
      .string()
      .optional()
      .transform((s) => (s ? s.split(',').filter(Boolean) : []))
      .pipe(z.array(zMonday).max(GRID_MAX_WEEKS)),
    zoom: z.enum(['week', 'day']).default('week'),
  })
  .superRefine((q, ctx) => {
    if ((q.from === undefined) !== (q.to === undefined)) {
      ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['to'] })
      return
    }
    if (q.expand.length > 0 && (q.from === undefined || q.to === undefined)) {
      ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['expand'] })
      return
    }
    if (q.from === undefined || q.to === undefined || !isISODate(q.from) || !isISODate(q.to)) return
    if (compareISO(q.to, q.from) <= 0 || diffDays(q.from, q.to) > GRID_MAX_WEEKS * 7) {
      ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['to'] })
      return
    }
    const { from, to } = q
    if (q.expand.some((w) => compareISO(w, from) < 0 || compareISO(w, to) >= 0)) {
      ctx.addIssue({ code: 'custom', message: th.grid.errors.expandOutOfRange, path: ['expand'] })
    }
  })

export type GridQuery = z.output<typeof gridQuerySchema>
