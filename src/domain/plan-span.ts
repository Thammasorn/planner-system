// src/domain/plan-span.ts — the day span of a task's planned load (SPEC FR-812 v3.6, BR-103a): first → last day with
// load over every live assignee. Pure; integer cd; dates are ISODate strings (dates.ts), never JS Date.
// WEEK rows cover the working days of their week per the assignee's schedule (BR-41 `standard`: holidays and leave are
// ignored); DAY rows cover their own date. Only the edge weeks matter, so callers may pass just those rows.
import { addDays, maxISO, minISO, weekStart } from './dates'
import type { Cd, Granularity, ISODate, Schedule, Weekday } from './types'

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7]
/** A person without schedule rows (or with only zero days) is read as Mon–Fri. */
export const DEFAULT_WORKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5]

export interface PlanRow {
  granularity: Granularity
  /** Monday of the row's week */
  weekStart: ISODate
  /** WEEK: = weekStart · DAY: the date */
  periodStart: ISODate
  cd: Cd
}

export interface DaySpan {
  start: ISODate
  end: ISODate
}

/** Weekdays with cd > 0, ascending; none → Mon–Fri. */
export function workdays(schedule: Schedule): Weekday[] {
  const out = WEEKDAYS.filter((d) => (schedule[d] ?? 0) > 0)
  return out.length > 0 ? out : [...DEFAULT_WORKDAYS]
}

/** The days one row covers: WEEK → first … last working day of its week; DAY → its date; no load → null. */
export function rowDaySpan(row: PlanRow, schedule: Schedule): DaySpan | null {
  if (row.cd <= 0) return null
  if (row.granularity === 'DAY') return { start: row.periodStart, end: row.periodStart }
  const days = workdays(schedule)
  const monday = weekStart(row.weekStart)
  return { start: addDays(monday, days[0]! - 1), end: addDays(monday, days.at(-1)! - 1) }
}

/** First → last day with load over every assignee (each with their own schedule); null without any load. */
export function planDaySpan(
  assignees: readonly { schedule: Schedule; rows: readonly PlanRow[] }[],
): DaySpan | null {
  let out: DaySpan | null = null
  for (const a of assignees) {
    for (const r of a.rows) {
      const s = rowDaySpan(r, a.schedule)
      if (!s) continue
      out = out ? { start: minISO(out.start, s.start), end: maxISO(out.end, s.end) } : s
    }
  }
  return out
}
