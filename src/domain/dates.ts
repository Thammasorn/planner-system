// src/domain/dates.ts — plan dates (SPEC §5.1 BR-04…BR-06, PLAN §3.6, X01).
// Plan dates are ISODate strings 'YYYY-MM-DD'. All arithmetic is integer epoch-day math
// (Howard Hinnant's days-from-civil / civil-from-days, proleptic Gregorian calendar).
// The only use of JS Date is todayBangkok(), which turns an instant into a Bangkok calendar date.
import type { ISODate, Weekday } from './types'

export type { ISODate, Weekday }

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Epoch day of 0000-01-01 and 9999-12-31 — the range fromEpochDay can format with four year digits. */
const MIN_EPOCH_DAY = -719_528
const MAX_EPOCH_DAY = 2_932_896

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31
}

/** Parses and validates; returns [year, month, day] or null. */
function parse(s: string): [number, number, number] | null {
  const m = ISO_RE.exec(s)
  if (!m) return null
  const y = Number.parseInt(m[1]!, 10)
  const mo = Number.parseInt(m[2]!, 10)
  const d = Number.parseInt(m[3]!, 10)
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null
  return [y, mo, d]
}

function invalid(s: unknown): RangeError {
  return new RangeError(`Invalid ISODate: ${JSON.stringify(s)}`)
}

function assertInteger(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${what} must be a safe integer, got ${n}`)
}

/** 'YYYY-MM-DD' with a real month and a day that exists in that month (Gregorian leap rule). */
export function isISODate(s: string): s is ISODate {
  return parse(s) !== null
}

/** Days since 1970-01-01 (negative before). Throws RangeError on invalid input. */
export function toEpochDay(d: ISODate): number {
  const p = parse(d)
  if (!p) throw invalid(d)
  const [yy, m, day] = p
  const y = m <= 2 ? yy - 1 : yy
  const era = Math.floor(y / 400)
  const yoe = y - era * 400 // [0, 399]
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + day - 1 // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy // [0, 146096]
  return era * 146_097 + doe - 719_468
}

/** Inverse of toEpochDay; years 0000–9999 only (RangeError otherwise). */
export function fromEpochDay(n: number): ISODate {
  assertInteger(n, 'Epoch day')
  if (n < MIN_EPOCH_DAY || n > MAX_EPOCH_DAY) throw new RangeError(`Epoch day out of range: ${n}`)
  const z = n + 719_468
  const era = Math.floor(z / 146_097)
  const doe = z - era * 146_097 // [0, 146096]
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  ) // [0, 399]
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)) // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153) // [0, 11]
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1 // [1, 31]
  const m = mp < 10 ? mp + 3 : mp - 9 // [1, 12]
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function addDays(d: ISODate, n: number): ISODate {
  assertInteger(n, 'Day offset')
  return fromEpochDay(toEpochDay(d) + n)
}

export function addWeeks(d: ISODate, n: number): ISODate {
  assertInteger(n, 'Week offset')
  return addDays(d, n * 7)
}

/** `to − from` in days. */
export function diffDays(from: ISODate, to: ISODate): number {
  return toEpochDay(to) - toEpochDay(from)
}

export function compareISO(a: ISODate, b: ISODate): -1 | 0 | 1 {
  const diff = toEpochDay(a) - toEpochDay(b)
  return diff < 0 ? -1 : diff > 0 ? 1 : 0
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return compareISO(a, b) <= 0 ? a : b
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return compareISO(a, b) >= 0 ? a : b
}

function weekdayOfEpochDay(e: number): Weekday {
  // 1970-01-01 was a Thursday (4).
  return (((((e + 3) % 7) + 7) % 7) + 1) as Weekday
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(d: ISODate): Weekday {
  return weekdayOfEpochDay(toEpochDay(d))
}

/** BR-05: the Monday on or before d. */
export function weekStart(d: ISODate): ISODate {
  const e = toEpochDay(d)
  return fromEpochDay(e - (weekdayOfEpochDay(e) - 1))
}

/** The 7 days Monday…Sunday of the week containing ws (M1-D18). */
export function daysOfWeek(ws: ISODate): ISODate[] {
  const e = toEpochDay(weekStart(ws))
  return Array.from({ length: 7 }, (_, i) => fromEpochDay(e + i))
}

/** Every Monday m with from ≤ m < to (M1-D18). */
export function weekRange(from: ISODate, to: ISODate): ISODate[] {
  const f = toEpochDay(from)
  const t = toEpochDay(to)
  const wd = weekdayOfEpochDay(f)
  const out: ISODate[] = []
  for (let m = wd === 1 ? f : f + (8 - wd); m < t; m += 7) out.push(fromEpochDay(m))
  return out
}

/** Every day from `from` through `toInclusive`; empty when toInclusive < from. */
export function eachDay(from: ISODate, toInclusive: ISODate): ISODate[] {
  const f = toEpochDay(from)
  const t = toEpochDay(toInclusive)
  const out: ISODate[] = []
  for (let e = f; e <= t; e++) out.push(fromEpochDay(e))
  return out
}

const bangkok = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** BR-06: today's calendar date in Asia/Bangkok. The only place src/domain touches Date. */
export function todayBangkok(now: Date = new Date()): ISODate {
  return bangkok.format(now)
}
