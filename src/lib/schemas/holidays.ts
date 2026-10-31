// src/lib/schemas/holidays.ts — holiday CRUD + CSV import (FR-901, M5-D11, X64). The server re-validates every row
// the browser previewed; names are trimmed and NFC-normalised.
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { isoDateSchema } from './dates'

const holidayName = z
  .string()
  .trim()
  .min(1, { error: th.holidays.errors.nameRequired })
  .max(200, { error: th.holidays.errors.nameTooLong })
  .transform((v) => v.normalize('NFC'))
const holidayDate = isoDateSchema(th.holidays.errors.invalidDate)

export const createHolidaySchema = z.object({ date: holidayDate, name: holidayName })
export const updateHolidaySchema = z.object({ id: z.uuid(), date: holidayDate, name: holidayName })
export const holidayIdSchema = z.object({ id: z.uuid() })
/** Undo of a hard delete: re-insert the same id (X64). */
export const restoreHolidaySchema = z.object({ id: z.uuid(), date: holidayDate, name: holidayName })

export const HOLIDAY_IMPORT_MAX = 500
export const importHolidaysSchema = z.object({
  rows: z
    .array(z.object({ date: holidayDate, name: holidayName }))
    .min(1, { error: th.holidays.import.errors.empty })
    .max(HOLIDAY_IMPORT_MAX, { error: th.holidays.import.errors.tooMany(HOLIDAY_IMPORT_MAX) })
    .refine((rows) => new Set(rows.map((r) => r.date)).size === rows.length, {
      error: th.holidays.import.errors.duplicateAny,
    }),
})

export type CreateHolidayInput = z.input<typeof createHolidaySchema>
export type UpdateHolidayInput = z.input<typeof updateHolidaySchema>
export type ImportHolidaysInput = z.input<typeof importHolidaysSchema>
