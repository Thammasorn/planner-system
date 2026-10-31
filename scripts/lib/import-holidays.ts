// scripts/lib/import-holidays.ts — the testable core of `pnpm import:holidays <file.csv> [--dry-run]` (FR-901,
// M5-D11, X64, PLAN §3.13). Same parser as the settings dialog (src/lib/csv/holidays.ts); writes go through the
// holidays service in one transaction with actor = null (one audit row). Any parse error → nothing is written.
import {
  classifyHolidayRows,
  holidayCsvErrorMessage,
  HOLIDAY_CSV_MAX_ROWS,
  parseHolidaysCsv,
  type ClassifiedHolidayRow,
} from '@/lib/csv/holidays'
import { th } from '@/i18n/th'
import type { HolidayImportResult } from '@/lib/contracts/holidays'
import type { Db } from '@/server/db/types'
import * as services from '@/server/services'

export type ImportHolidaysOutcome =
  { ok: true; result: HolidayImportResult | ClassifiedHolidayRow[] } | { ok: false; messages: string[] }

const FILE_ERRORS = {
  EMPTY: th.holidays.import.errors.empty,
  TOO_MANY: th.holidays.import.errors.tooMany(HOLIDAY_CSV_MAX_ROWS),
  TOO_LARGE: th.holidays.import.errors.tooLarge,
} as const

export async function runImportHolidays(
  db: Db,
  bytes: Uint8Array,
  opts: { dryRun: boolean },
): Promise<ImportHolidaysOutcome> {
  const parsed = parseHolidaysCsv(bytes)
  if (parsed.fileError) return { ok: false, messages: [FILE_ERRORS[parsed.fileError]] }
  if (parsed.errors.length > 0) return { ok: false, messages: parsed.errors.map(holidayCsvErrorMessage) }
  const rows = parsed.rows.map(({ date, name }) => ({ date, name }))
  if (opts.dryRun)
    return { ok: true, result: classifyHolidayRows(parsed.rows, await services.holidays.listHolidays(db)) }
  const result = await db.transaction((tx) => services.holidays.importHolidays(tx, null, rows))
  return { ok: true, result }
}
