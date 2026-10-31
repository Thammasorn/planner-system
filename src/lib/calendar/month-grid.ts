// src/lib/calendar/month-grid.ts — month view helpers for /calendar (FR-907/908, M5-D8/D13, X01).
// Pure string/integer arithmetic on top of src/domain/dates.ts; no JS Date, no ICU (hydration-safe, r5 M5-15).
import { addDays, compareISO, weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'

/** 'YYYY-MM' (the `?month=` URL parameter). */
export type YearMonth = string

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const GRID_WEEKS = 6

export function isYearMonth(s: string): boolean {
  return YEAR_MONTH_RE.test(s)
}

function parseYearMonth(ym: YearMonth): [year: number, month: number] {
  if (!isYearMonth(ym)) throw new RangeError(`Invalid YearMonth: ${JSON.stringify(ym)}`)
  return [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))]
}

export function yearMonthOf(d: ISODate): YearMonth {
  return d.slice(0, 7)
}

/** Integer y/m arithmetic. RangeError on an invalid month or a non-integer offset. */
export function addMonths(ym: YearMonth, n: number): YearMonth {
  const [y, m] = parseYearMonth(ym)
  if (!Number.isSafeInteger(n)) throw new RangeError(`Month offset must be a safe integer, got ${n}`)
  const idx = y * 12 + (m - 1) + n
  const year = Math.floor(idx / 12)
  const month = idx - year * 12 + 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/** "ตุลาคม 2569": th.calendar.months + Buddhist-era year (y + 543). */
export function monthTitle(ym: YearMonth): string {
  const [y, m] = parseYearMonth(ym)
  return th.calendar.monthTitle(th.calendar.months[m - 1]!, y + 543)
}

/** 6 Monday-first weeks starting at weekStart(<month>-01); `to` is exclusive (from + 42 days). */
export function monthGrid(ym: YearMonth): { from: ISODate; to: ISODate; weeks: ISODate[][] } {
  parseYearMonth(ym)
  const from = weekStart(`${ym}-01`)
  const weeks = Array.from({ length: GRID_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(from, w * 7 + d)),
  )
  return { from, to: addDays(from, GRID_WEEKS * 7), weeks }
}

export function inMonth(d: ISODate, ym: YearMonth): boolean {
  return d.slice(0, 7) === ym
}

export function dayOfMonth(d: ISODate): number {
  return Number(d.slice(8, 10))
}

/** A pointer/keyboard selection between two days, in either order. */
export function orderRange(a: ISODate, b: ISODate): { startDate: ISODate; endDate: ISODate } {
  return compareISO(a, b) <= 0 ? { startDate: a, endDate: b } : { startDate: b, endDate: a }
}

const FOCUS_STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as const

/** Roving focus in the month grid: ±1 day (left/right), ±7 days (up/down). */
export function moveFocus(d: ISODate, code: keyof typeof FOCUS_STEP): ISODate {
  return addDays(d, FOCUS_STEP[code])
}

/** Entries covering day d (boundaries included), in input order. ISO strings compare lexicographically. */
export function entriesOnDay<T extends { startDate: ISODate; endDate: ISODate }>(
  entries: readonly T[],
  d: ISODate,
): T[] {
  return entries.filter((e) => e.startDate <= d && d <= e.endDate)
}

/** At most `max` chips per cell, then "+N" (M5-D13). */
export function splitVisible<T>(items: readonly T[], max = 3): { shown: T[]; more: number } {
  return { shown: items.slice(0, max), more: Math.max(0, items.length - max) }
}
