import { describe, expect, it } from 'vitest'
import { planDaySpan, rowDaySpan, workdays, type PlanRow } from './plan-span'
import type { Schedule } from './types'

const MON_FRI: Schedule = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 }
/** Tue–Sat, half days on Saturday — a non-standard schedule */
const TUE_SAT: Schedule = { 2: 100, 3: 100, 4: 100, 5: 100, 6: 50 }

const week = (w: string, cd: number): PlanRow => ({ granularity: 'WEEK', weekStart: w, periodStart: w, cd })
const day = (d: string, w: string, cd: number): PlanRow => ({
  granularity: 'DAY',
  weekStart: w,
  periodStart: d,
  cd,
})

describe('workdays', () => {
  it('lists the weekdays with cd > 0, ascending', () => {
    expect(workdays(MON_FRI)).toEqual([1, 2, 3, 4, 5])
    expect(workdays(TUE_SAT)).toEqual([2, 3, 4, 5, 6])
    expect(workdays({ 7: 100, 3: 50, 1: 0 })).toEqual([3, 7])
  })
  it('an empty (or all-zero) schedule falls back to Mon–Fri', () => {
    expect(workdays({})).toEqual([1, 2, 3, 4, 5])
    expect(workdays({ 1: 0, 6: 0 })).toEqual([1, 2, 3, 4, 5])
  })
})

describe('rowDaySpan', () => {
  it('WEEK row = first … last working day of that week per the schedule', () => {
    expect(rowDaySpan(week('2026-11-02', 250), MON_FRI)).toEqual({ start: '2026-11-02', end: '2026-11-06' })
    expect(rowDaySpan(week('2026-11-02', 250), TUE_SAT)).toEqual({ start: '2026-11-03', end: '2026-11-07' })
    expect(rowDaySpan(week('2026-11-02', 100), { 7: 100 })).toEqual({
      start: '2026-11-08',
      end: '2026-11-08',
    })
  })
  it('DAY row = its own date (even on a non-working day)', () => {
    expect(rowDaySpan(day('2026-11-04', '2026-11-02', 50), MON_FRI)).toEqual({
      start: '2026-11-04',
      end: '2026-11-04',
    })
    expect(rowDaySpan(day('2026-11-08', '2026-11-02', 50), MON_FRI)).toEqual({
      start: '2026-11-08',
      end: '2026-11-08',
    })
  })
  it('a row without load (cd ≤ 0) covers nothing', () => {
    expect(rowDaySpan(week('2026-11-02', 0), MON_FRI)).toBeNull()
    expect(rowDaySpan(day('2026-11-04', '2026-11-02', 0), MON_FRI)).toBeNull()
  })
})

describe('planDaySpan', () => {
  it('no assignees / no rows / only zero rows → null', () => {
    expect(planDaySpan([])).toBeNull()
    expect(planDaySpan([{ schedule: MON_FRI, rows: [] }])).toBeNull()
    expect(planDaySpan([{ schedule: MON_FRI, rows: [week('2026-11-02', 0)] }])).toBeNull()
  })

  it('golden UAT (Ivy, WEEK 14/9 … 5/10, Mon–Fri) → 14/9 … 9/10', () => {
    const rows = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].map((w) => week(w, 250))
    expect(planDaySpan([{ schedule: MON_FRI, rows }])).toEqual({ start: '2026-09-14', end: '2026-10-09' })
  })

  it('WEEK/DAY mint: DAY edges are real dates, WEEK edges follow the schedule; row order does not matter', () => {
    const rows = [
      day('2026-11-19', '2026-11-16', 100), // Thu of the last week
      week('2026-11-09', 500),
      day('2026-11-04', '2026-11-02', 50), // Wed of the first week
      day('2026-11-17', '2026-11-16', 100),
    ]
    expect(planDaySpan([{ schedule: MON_FRI, rows }])).toEqual({ start: '2026-11-04', end: '2026-11-19' })
  })

  it('first/last week as WEEK rows of a Tue–Sat person → Tuesday … Saturday', () => {
    const rows = [week('2026-11-02', 300), week('2026-11-16', 300)]
    expect(planDaySpan([{ schedule: TUE_SAT, rows }])).toEqual({ start: '2026-11-03', end: '2026-11-21' })
  })

  it('one span over every assignee, each with their own schedule', () => {
    const cindy = { schedule: MON_FRI, rows: [week('2026-11-09', 250)] }
    const ivy = { schedule: TUE_SAT, rows: [week('2026-11-02', 250), day('2026-11-25', '2026-11-23', 100)] }
    expect(planDaySpan([cindy, ivy])).toEqual({ start: '2026-11-03', end: '2026-11-25' })
    expect(planDaySpan([ivy, cindy])).toEqual({ start: '2026-11-03', end: '2026-11-25' })
  })

  it('zero rows at the edges are ignored', () => {
    const rows = [week('2026-10-26', 0), week('2026-11-02', 100), day('2026-11-13', '2026-11-09', 0)]
    expect(planDaySpan([{ schedule: MON_FRI, rows }])).toEqual({ start: '2026-11-02', end: '2026-11-06' })
  })
})
