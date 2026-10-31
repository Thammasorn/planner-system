// src/lib/contracts/holidays.ts — holiday DTOs (FR-901, plan/m05 S0.5). Type-only, isomorphic.
import type { ISODate } from '@/domain/types'

export interface HolidayDTO {
  id: string
  date: ISODate
  name: string
}

/** What deleteHoliday returns and restoreHoliday takes back (hard delete; undo re-inserts the same id, X64). */
export type DeletedHoliday = HolidayDTO

/** importHolidays (M5-D11): rows inserted, renamed (existing date, new name) and left as they were. */
export interface HolidayImportResult {
  inserted: number
  updated: number
  unchanged: number
}
