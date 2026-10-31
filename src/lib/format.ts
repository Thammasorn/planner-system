/** Display formatting (SPEC §8.8, PLAN.md §3.6). Thai dates use the Buddhist era ("30 ก.ย. 2569"). M1 narrows the
 *  date parameters to `ISODate` (M0-D23) and adds `formatWeekday`; M4 adds `formatRelative`; M5 adds date ranges. */
import type { HalfDay, ISODate } from '@/domain/types'
import { th } from '@/i18n/th'

export type ThaiDateStyle = 'medium' | 'long'

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

const planDateFormat: Record<ThaiDateStyle, Intl.DateTimeFormat> = {
  medium: new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'UTC' }),
  long: new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' }),
}

const instantDateFormat: Record<ThaiDateStyle, Intl.DateTimeFormat> = {
  medium: new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }),
  long: new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' }),
}

/** 'YYYY-MM-DD' → integer parts; RangeError unless it is a real calendar date. */
function parseIso(iso: string): { y: number; m: number; d: number } {
  const match = ISO.exec(iso)
  if (!match) throw new RangeError(`Invalid ISO date: ${JSON.stringify(iso)}`)
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const probe = utcDate(y, m, d)
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new RangeError(`Invalid ISO date: ${JSON.stringify(iso)}`)
  }
  return { y, m, d }
}

/** UTC midnight of the given civil date (setUTCFullYear avoids Date.UTC's 0–99 → 19xx mapping). */
function utcDate(y: number, m: number, d: number): Date {
  const date = new Date(0)
  date.setUTCFullYear(y, m - 1, d)
  return date
}

/** Plan date 'YYYY-MM-DD' → "30 ก.ย. 2569" (SPEC §8.8, B.E.). Builds a UTC Date and formats in UTC — with
 *  todayBangkok() (M1) the only places allowed to construct a Date from a plan date (PLAN.md §3.6). */
export function formatThaiDate(iso: string, style: ThaiDateStyle = 'medium'): string {
  const { y, m, d } = parseIso(iso)
  return planDateFormat[style].format(utcDate(y, m, d))
}

/** Grid week header "30/9" (no year). */
export function formatWeekHeader(weekStart: string): string {
  const { m, d } = parseIso(weekStart)
  return `${d}/${m}`
}

/** An instant (timestamp) shown as a Thai date in Asia/Bangkok. Not for plan dates. */
export function formatThaiInstantDate(instant: Date, style: ThaiDateStyle = 'medium'): string {
  return instantDateFormat[style].format(instant)
}

/** "5 ต.ค. 2569 – 6 ต.ค. 2569", or "5 ต.ค. 2569" when start = end (M5). RangeError on invalid dates. */
export function formatThaiDateRange(start: ISODate, end: ISODate): string {
  const a = formatThaiDate(start)
  return start === end ? a : `${a} – ${formatThaiDate(end)}`
}

/** Leave label used in messages and toasts: the range + " (ครึ่งวันเช้า|ครึ่งวันบ่าย)" for half days. */
export function formatLeaveRange(start: ISODate, end: ISODate, half: HalfDay | null): string {
  const range = formatThaiDateRange(start, end)
  return half ? `${range} (${th.timeOff.halfLong[half]})` : range
}
