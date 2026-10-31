// src/domain/capacity.ts — capacity engine (SPEC §5.2 BR-10…BR-13, §5.6 BR-41 `standard`, FR-906 impact; X64, M5-D5).
// Pure, integer centi-days only (BR-01). Dates are ISODate strings; arithmetic goes through dates.ts.
import {
  compareISO,
  daysOfWeek,
  eachDay,
  isoWeekday,
  toEpochDay,
  weekRange,
  weekStart,
  addDays,
} from './dates'
import type { Cd, HalfDay, ISODate, Schedule, TimeOffSpan, Weekday } from './types'

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7]

/** Leave fraction of one day: full day (null) = 100 cd, ครึ่งวันเช้า/บ่าย = 50 cd. */
export function timeOffFractionCd(half: HalfDay | null): 50 | 100 {
  return half === null ? 100 : 50
}

/** Reduces a leave entry (DB row / DTO) to what capacity needs. */
export function toTimeOffSpan(e: {
  startDate: ISODate
  endDate: ISODate
  half: HalfDay | null
}): TimeOffSpan {
  return { startDate: e.startDate, endDate: e.endDate, fractionCd: timeOffFractionCd(e.half) }
}

/** BR-41 standard: schedule only — ignores holidays, leave and deactivation (X64). */
export function standardDayCd(schedule: Schedule, d: ISODate): Cd {
  return schedule[isoWeekday(d)] ?? 0
}

/** BR-41 standard for a whole week: Σ of the schedule over weekdays 1..7. */
export function standardWeekCd(schedule: Schedule): Cd {
  let sum = 0
  for (const wd of WEEKDAYS) sum += schedule[wd] ?? 0
  return sum
}

/** BR-10 + BR-12 + BR-13: schedule → 0 on a holiday → minus leave → never negative; 0 from `deactivatedOn` on. */
export function dayCapacityCd(
  schedule: Schedule,
  holidays: ReadonlySet<ISODate>,
  timeOff: readonly TimeOffSpan[],
  d: ISODate,
  deactivatedOn?: ISODate | null,
): Cd {
  if (deactivatedOn && compareISO(d, deactivatedOn) >= 0) return 0 // BR-13, inclusive
  const base = schedule[isoWeekday(d)] ?? 0
  if (base === 0 || holidays.has(d)) return 0 // BR-10 / BR-12: a holiday wins, leave is not deducted twice
  let off = 0
  for (const t of timeOff) if (t.startDate <= d && d <= t.endDate) off += t.fractionCd // ISO strings sort lexicographically
  return Math.max(0, base - off)
}

/** BR-11: Σ dayCapacityCd over the 7 days of the week that starts on Monday `ws` (RangeError otherwise). */
export function weekCapacityCd(
  schedule: Schedule,
  holidays: ReadonlySet<ISODate>,
  timeOff: readonly TimeOffSpan[],
  ws: ISODate,
  deactivatedOn?: ISODate | null,
): Cd {
  if (isoWeekday(ws) !== 1) throw new RangeError(`Week start must be a Monday, got ${JSON.stringify(ws)}`)
  let sum = 0
  for (const d of daysOfWeek(ws)) sum += dayCapacityCd(schedule, holidays, timeOff, d, deactivatedOn)
  return sum
}

/** Everything capacity of one person depends on (loaded by services/capacity.ts). */
export interface CapacityProfile {
  schedule: Schedule
  holidays: ReadonlySet<ISODate>
  timeOff: readonly TimeOffSpan[]
  deactivatedOn: ISODate | null
}

export interface PeriodCapacityCd {
  capacityCd: Cd
  standardCd: Cd
}

/** Every day d with from ≤ d < toExclusive → { capacityCd (BR-10…13), standardCd (BR-41) }, keys in date order. */
export function capacityByDay(
  p: CapacityProfile,
  from: ISODate,
  toExclusive: ISODate,
): Record<ISODate, PeriodCapacityCd> {
  const out: Record<ISODate, PeriodCapacityCd> = {}
  for (const d of eachDay(from, addDays(toExclusive, -1))) {
    out[d] = {
      capacityCd: dayCapacityCd(p.schedule, p.holidays, p.timeOff, d, p.deactivatedOn),
      standardCd: standardDayCd(p.schedule, d),
    }
  }
  return out
}

/** Keyed by Monday: every week from the one containing `from` while its Monday is < toExclusive. */
export function capacityByWeek(
  p: CapacityProfile,
  from: ISODate,
  toExclusive: ISODate,
): Record<ISODate, PeriodCapacityCd> {
  const out: Record<ISODate, PeriodCapacityCd> = {}
  const standardCd = standardWeekCd(p.schedule)
  for (const ws of weekRange(weekStart(from), toExclusive)) {
    out[ws] = {
      capacityCd: weekCapacityCd(p.schedule, p.holidays, p.timeOff, ws, p.deactivatedOn),
      standardCd,
    }
  }
  return out
}

/** Mondays of every week touched by at least one range, deduplicated and ascending; [] for [].
 *  (Refines the plan's "weekStart(min start) … weekStart(max end)": weeks between two distant ranges are not
 *  listed — their capacity cannot change — so an update's list stays ≤ 2 × 53 weeks.) RangeError if end < start. */
export function affectedWeeks(ranges: readonly { startDate: ISODate; endDate: ISODate }[]): ISODate[] {
  const byEpoch = new Map<number, ISODate>()
  for (const r of ranges) {
    if (compareISO(r.endDate, r.startDate) < 0) {
      throw new RangeError(
        `Range end ${JSON.stringify(r.endDate)} is before start ${JSON.stringify(r.startDate)}`,
      )
    }
    for (const ws of weekRange(weekStart(r.startDate), addDays(r.endDate, 1))) byEpoch.set(toEpochDay(ws), ws)
  }
  return [...byEpoch.entries()].sort((a, b) => a[0] - b[0]).map(([, ws]) => ws)
}

/** FR-906 (M5-D5): per week, capacity with the `before` vs `after` leave sets (same schedule/holidays/deactivation).
 *  Output order = `weeks` order. */
export function weekCapacityImpact(
  p: Omit<CapacityProfile, 'timeOff'>,
  before: readonly TimeOffSpan[],
  after: readonly TimeOffSpan[],
  weeks: readonly ISODate[],
): { weekStart: ISODate; beforeCd: Cd; afterCd: Cd }[] {
  return weeks.map((ws) => ({
    weekStart: ws,
    beforeCd: weekCapacityCd(p.schedule, p.holidays, before, ws, p.deactivatedOn),
    afterCd: weekCapacityCd(p.schedule, p.holidays, after, ws, p.deactivatedOn),
  }))
}
