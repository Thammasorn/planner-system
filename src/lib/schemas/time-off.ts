// src/lib/schemas/time-off.ts — record / edit / delete / restore leave (FR-903, FR-909, M5-D6). Zod 4: `.extend()` on
// a refined object throws, so the field shape and the range refinement are kept separate.
import { compareISO, diffDays, isISODate } from '@/domain/dates'
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { optionalText, userIdSchema } from './common'
import { isoDateSchema } from './dates'

/** M5-D6: one entry covers at most 366 days (start and end inclusive). */
export const TIME_OFF_MAX_DAYS = 366
export const TIME_OFF_NOTE_MAX = 500

export const halfDaySchema = z.enum(['AM', 'PM']).nullable()

const timeOffFields = {
  leaveTypeId: z.uuid({ error: th.timeOff.errors.typeRequired }),
  startDate: isoDateSchema(th.timeOff.errors.invalidDate),
  endDate: isoDateSchema(th.timeOff.errors.invalidDate),
  half: halfDaySchema.default(null),
  note: optionalText(TIME_OFF_NOTE_MAX, th.timeOff.errors.noteTooLong), // '' → null
}

/** end ≥ start · half only when start = end · ≤ TIME_OFF_MAX_DAYS days. Skipped when a date failed its own parse. */
export function refineTimeOffRange(
  v: { startDate: string; endDate: string; half: 'AM' | 'PM' | null },
  ctx: z.RefinementCtx,
): void {
  if (!isISODate(v.startDate) || !isISODate(v.endDate)) return
  if (compareISO(v.endDate, v.startDate) < 0) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: th.timeOff.errors.endBeforeStart })
    return
  }
  if (v.half !== null && v.startDate !== v.endDate) {
    ctx.addIssue({ code: 'custom', path: ['half'], message: th.timeOff.errors.halfMultiDay })
  }
  if (diffDays(v.startDate, v.endDate) + 1 > TIME_OFF_MAX_DAYS) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: th.timeOff.errors.rangeTooLong })
  }
}

/** `userId` omitted = the caller's own leave; a manager may record for someone else (PERM-21). */
export const createTimeOffSchema = z
  .object({ userId: userIdSchema.optional(), ...timeOffFields })
  .superRefine(refineTimeOffRange)
/** The owner of an entry never changes (M5-D14: the employee field is fixed in edit mode). */
export const updateTimeOffSchema = z
  .object({ id: z.uuid(), ...timeOffFields })
  .superRefine(refineTimeOffRange)
export const timeOffIdSchema = z.object({ id: z.uuid() })
export const restoreTimeOffSchema = z.object({ batch: z.uuid() })

export type CreateTimeOffInput = z.input<typeof createTimeOffSchema>
export type UpdateTimeOffInput = z.input<typeof updateTimeOffSchema>
