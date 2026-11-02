import { describe, expect, it } from 'vitest'
import {
  DUE_SOON_DAYS,
  LATE_LOOKAHEAD_DAYS,
  compareMilestones,
  dateInWeekKeepingWeekday,
  isLateForMilestone,
  lateReasons,
  milestoneLateness,
  milestoneProgress,
  milestoneStatus,
  type LateFacts,
} from './milestone'
import type { ISODate, LateReason, MilestoneStatus } from './types'

const facts = (f: Partial<LateFacts> = {}): LateFacts => ({
  completed: false,
  dueDate: null,
  lastWeekStart: null,
  lastDayDate: null,
  ...f,
})

describe('constants', () => {
  it('DUE_SOON_DAYS = 7 (BR-70) and LATE_LOOKAHEAD_DAYS = 1096 (X66, 3 years)', () => {
    expect(DUE_SOON_DAYS).toBe(7)
    expect(LATE_LOOKAHEAD_DAYS).toBe(1096)
  })
})

describe('BR-70 milestoneStatus', () => {
  const rows: [ISODate, ISODate | null, ISODate, MilestoneStatus, string][] = [
    ['2026-09-01', '2026-09-29', '2026-09-30', 'DONE', 'DONE beats OVERDUE'],
    ['2026-12-21', '2026-09-30', '2026-09-30', 'DONE', 'DONE before the date'],
    ['2026-09-29', null, '2026-09-30', 'OVERDUE', 'yesterday'],
    ['2026-09-30', null, '2026-09-30', 'DUE_SOON', 'today = date (SPEC §11.1)'],
    ['2026-10-07', null, '2026-09-30', 'DUE_SOON', '+7'],
    ['2026-10-08', null, '2026-09-30', 'UPCOMING', '+8'],
    ['2026-10-02', null, '2026-09-30', 'DUE_SOON', 'A.2 UAT sign-off'],
    ['2026-10-09', null, '2026-09-30', 'UPCOMING', 'A.2 Design freeze, +9'],
    ['2027-01-04', null, '2026-12-28', 'DUE_SOON', 'year boundary'],
    ['2026-01-01', null, '2026-12-31', 'OVERDUE', 'a year ago'],
  ]
  for (const [date, completedOn, today, expected, why] of rows) {
    it(`${date} completedOn=${completedOn} today=${today} → ${expected} (${why})`, () => {
      expect(milestoneStatus({ date, completedOn }, today)).toBe(expected)
    })
  }
})

describe('BR-71 lateReasons / isLateForMilestone', () => {
  const later = facts({ lastWeekStart: '2026-10-26', lastDayDate: '2026-10-24', dueDate: '2026-10-24' })
  const rows: [ISODate, LateFacts, LateReason[], string][] = [
    ['2026-10-23', facts({ lastWeekStart: '2026-10-26' }), ['WEEK_PLAN'], 'AC-702 week 26 ต.ค.'],
    ['2026-10-23', facts({ lastWeekStart: '2026-10-19' }), [], 'WEEK row in the milestone week (X66)'],
    ['2026-10-19', facts({ lastWeekStart: '2026-10-19' }), [], 'Monday milestone, not >'],
    ['2026-10-23', facts({ lastDayDate: '2026-10-24' }), ['DAY_PLAN'], 'Saturday, same week'],
    ['2026-10-23', facts({ lastDayDate: '2026-10-23' }), [], 'DAY on the milestone date'],
    ['2026-10-23', facts({ dueDate: '2026-10-24' }), ['DUE_DATE'], 'due the day after'],
    ['2026-10-23', facts({ dueDate: '2026-10-23' }), [], 'due on the milestone date'],
    ['2026-10-23', { ...later, completed: true }, [], 'completed (ยังไม่เสร็จ)'],
    ['2026-10-23', later, ['WEEK_PLAN', 'DAY_PLAN', 'DUE_DATE'], 'all three, fixed order'],
    ['2026-10-02', facts({ lastWeekStart: '2026-10-05' }), ['WEEK_PLAN'], 'A.2 UAT sign-off'],
    ['2026-11-06', facts({ lastWeekStart: '2026-11-02' }), [], 'ย้ายข้อมูลลูกค้า ends in the milestone week'],
    ['2026-10-23', facts({ lastWeekStart: '2026-10-19' }), [], 'DW ย้าย pipeline (r8 §4.9)'],
    ['2026-10-23', facts(), [], 'no plans, no due date'],
    ['2026-10-23', facts({ dueDate: '2026-10-01', lastDayDate: '2026-10-20' }), [], 'everything earlier'],
  ]
  for (const [date, f, expected, why] of rows) {
    it(`${date} ${JSON.stringify(f)} → [${expected.join(', ')}] (${why})`, () => {
      expect(lateReasons(date, f)).toEqual(expected)
      expect(isLateForMilestone(date, f)).toBe(expected.length > 0)
    })
  }
})

describe('BR-71 milestoneLateness', () => {
  const late = facts({ dueDate: '2026-10-30' })
  const notLate = facts({ lastWeekStart: '2026-10-19' })
  it('[late, notLate, late] → { late: true, lateTaskCount: 2 }', () => {
    expect(milestoneLateness('2026-10-23', [late, notLate, late])).toEqual({ late: true, lateTaskCount: 2 })
  })
  it('[] → { late: false, lateTaskCount: 0 }', () => {
    expect(milestoneLateness('2026-10-23', [])).toEqual({ late: false, lateTaskCount: 0 })
  })
  it('only on-time tasks → not late', () => {
    expect(milestoneLateness('2026-10-23', [notLate, facts()])).toEqual({ late: false, lateTaskCount: 0 })
  })
})

describe('FR-703 milestoneProgress', () => {
  it('4 of 7 completed → { done: 4, total: 7 } (เสร็จ 4/7 งาน)', () => {
    const tasks = [true, false, true, false, true, false, true].map((completed) => ({ completed }))
    expect(milestoneProgress(tasks)).toEqual({ done: 4, total: 7 })
  })
  it('[] → { done: 0, total: 0 }', () => {
    expect(milestoneProgress([])).toEqual({ done: 0, total: 0 })
  })
})

describe('FR-707 dateInWeekKeepingWeekday', () => {
  const rows: [ISODate, ISODate, ISODate, string][] = [
    ['2026-10-23', '2026-10-26', '2026-10-30', 'Friday, next week'],
    ['2026-10-23', '2026-10-12', '2026-10-16', 'Friday, previous weeks'],
    ['2026-10-25', '2026-11-02', '2026-11-08', 'Sunday'],
    ['2026-12-31', '2027-01-04', '2027-01-07', 'year boundary'],
    ['2026-10-19', '2026-10-19', '2026-10-19', 'same week, Monday'],
  ]
  for (const [date, target, expected, why] of rows) {
    it(`(${date}, ${target}) → ${expected} (${why})`, () => {
      expect(dateInWeekKeepingWeekday(date, target)).toBe(expected)
    })
  }
  it('target not a Monday → RangeError', () => {
    expect(() => dateInWeekKeepingWeekday('2026-10-23', '2026-10-27')).toThrow(RangeError)
  })
})

describe('compareMilestones', () => {
  it('sorts by date, then id in byte order → z, a, b', () => {
    const list = [
      { date: '2026-10-23', id: 'b' },
      { date: '2026-10-02', id: 'z' },
      { date: '2026-10-23', id: 'a' },
    ]
    expect([...list].sort(compareMilestones).map((m) => m.id)).toEqual(['z', 'a', 'b'])
  })
  it('uses byte order for ids (uppercase before lowercase), 0 for equal', () => {
    expect(compareMilestones({ date: '2026-10-23', id: 'B' }, { date: '2026-10-23', id: 'a' })).toBeLessThan(0)
    expect(compareMilestones({ date: '2026-10-23', id: 'a' }, { date: '2026-10-23', id: 'a' })).toBe(0)
    expect(compareMilestones({ date: '2026-10-24', id: 'a' }, { date: '2026-10-23', id: 'z' })).toBeGreaterThan(0)
  })
})
