// src/lib/schemas/calendar.ts — GET /api/calendar query (FR-907, M5-D8): Mondays, `to` exclusive, ≤ 6 weeks.
import { compareISO, diffDays, isISODate, isoWeekday } from '@/domain/dates'
import { th } from '@/i18n/th'
import { z } from '@/lib/z'

export const CALENDAR_MAX_DAYS = 42

export const calendarQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .superRefine((v, ctx) => {
    if (!isISODate(v.from) || !isISODate(v.to)) return // their own issues are already reported
    const ok =
      isoWeekday(v.from) === 1 &&
      isoWeekday(v.to) === 1 &&
      compareISO(v.to, v.from) > 0 &&
      diffDays(v.from, v.to) <= CALENDAR_MAX_DAYS
    if (!ok) ctx.addIssue({ code: 'custom', path: ['to'], message: th.errors.VALIDATION })
  })

export type CalendarQuery = z.output<typeof calendarQuerySchema>

/** GET /api/tasks/plan-spans (M11.4, FR-669): the month-grid range of calendarQuerySchema + an optional project. */
export const teamPlanSpansQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date(), projectId: z.uuid().optional() })
  .superRefine((v, ctx) => {
    if (!isISODate(v.from) || !isISODate(v.to)) return
    const ok =
      isoWeekday(v.from) === 1 &&
      isoWeekday(v.to) === 1 &&
      compareISO(v.to, v.from) > 0 &&
      diffDays(v.from, v.to) <= CALENDAR_MAX_DAYS
    if (!ok) ctx.addIssue({ code: 'custom', path: ['to'], message: th.errors.VALIDATION })
  })

export type TeamPlanSpansQuery = z.output<typeof teamPlanSpansQuerySchema>
