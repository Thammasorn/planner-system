// src/domain/database/date.ts — BR-92 typed date input → ISODate (Buddhist years ≥ 2400 → −543); v3.7 per-cell date
// ranges `{ start, end }` (BR-90/92/93/97).
import { addDays, compareISO, isISODate, maxISO, minISO } from '../dates'
import type { DateRangeValue, ISODate } from '../types'
import { asciiDigits } from './number'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const DMY_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/
/** BR-92: a 4-digit year ≥ 2400 is a Buddhist year. */
const BE_MIN = 2400
const BE_OFFSET = 543

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0')
}

/**
 * `YYYY-MM-DD`, `D/M/YYYY` (year ≥ 2400 = พ.ศ.), `D/M` (year of `today`); Thai digits accepted.
 * Empty → null; anything else or a date that does not exist (31/2) → 'invalid'.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- ISODate is a string alias; 'invalid' names the sentinel of the plan/m11 S1.4 contract.
export function parseDateInput(raw: string, today: ISODate): ISODate | null | 'invalid' {
  const s = asciiDigits(raw).trim()
  if (s === '') return null
  if (ISO_RE.test(s)) return isISODate(s) ? s : 'invalid'
  const m = DMY_RE.exec(s)
  if (!m) return 'invalid'
  let year = m[3] === undefined ? Number(today.slice(0, 4)) : Number(m[3])
  if (year >= BE_MIN) year -= BE_OFFSET
  const iso = `${pad(year, 4)}-${pad(Number(m[2]), 2)}-${pad(Number(m[1]), 2)}`
  return isISODate(iso) ? iso : 'invalid'
}

// ── v3.7 date ranges per cell (BR-90/92/93, owner 2026-11-03) ───────────────────────────────────────────────────────

/** BR-93 text form of a range: `2026-11-03 → 2026-11-07`. */
export const RANGE_ARROW = ' → '
/** Separators a typed / converted text may use between two dates (BR-92/93): `→`, `->`, `–` (en dash), `—`, ` - `. */
const RANGE_SPLIT_RE = /\s*(?:→|->|–|—)\s*|\s+-\s+/u

/** BR-90: `{ start, end }` with exactly those two keys, both existing ISODates, `start ≤ end`. */
export function isDateRangeValue(v: unknown): v is DateRangeValue {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const keys = Object.keys(v)
  if (keys.length !== 2 || !keys.includes('start') || !keys.includes('end')) return false
  const { start, end } = v as Record<string, unknown>
  return (
    typeof start === 'string' &&
    typeof end === 'string' &&
    isISODate(start) &&
    isISODate(end) &&
    compareISO(start, end) <= 0
  )
}

/** A DATE cell value as a span: a single date = [d, d]; anything else → null. */
export function dateSpanOf(v: unknown): DateRangeValue | null {
  if (typeof v === 'string') return isISODate(v) ? { start: v, end: v } : null
  return isDateRangeValue(v) ? { start: v.start, end: v.end } : null
}

/** BR-93 text of a DATE value: ISO date, or `start → end` for a range. */
export function dateValueText(v: string | DateRangeValue): string {
  return typeof v === 'string' ? v : `${v.start}${RANGE_ARROW}${v.end}`
}

/**
 * BR-92 (v3.7): a typed DATE cell — one date (parseDateInput), or two dates joined by `→` / `->` / `–` / `—` / ` - `
 * → a range (reversed dates are put in order). Empty → null; anything unparsable → 'invalid'.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- ISODate is a string alias; 'invalid' is the sentinel of parseDateInput.
export function parseDateCellInput(raw: string, today: ISODate): ISODate | DateRangeValue | null | 'invalid' {
  const parts = asciiDigits(raw).trim().split(RANGE_SPLIT_RE)
  if (parts.length === 1) return parseDateInput(raw, today)
  if (parts.length !== 2) return 'invalid'
  const a = parseDateInput(parts[0]!, today)
  const b = parseDateInput(parts[1]!, today)
  if (a === null || a === 'invalid' || b === null || b === 'invalid') return 'invalid'
  return { start: minISO(a, b), end: maxISO(a, b) }
}

/** Calendar move (BR-97 v3.7): the range shifted by `days`, length kept. */
export function shiftDateRange(r: DateRangeValue, days: number): DateRangeValue {
  return { start: addDays(r.start, days), end: addDays(r.end, days) }
}

/** Calendar edge resize (BR-97 v3.7): one side moved to `to`, clamped so that `start ≤ end`. */
export function resizeDateRange(r: DateRangeValue, edge: 'start' | 'end', to: ISODate): DateRangeValue {
  return edge === 'start'
    ? { start: minISO(to, r.end), end: r.end }
    : { start: r.start, end: maxISO(to, r.start) }
}
