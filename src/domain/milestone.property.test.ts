import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, addWeeks, isoWeekday, weekStart } from './dates'
import {
  DUE_SOON_DAYS,
  dateInWeekKeepingWeekday,
  isLateForMilestone,
  lateReasons,
  milestoneLateness,
  milestoneProgress,
  milestoneStatus,
  type LateFacts,
} from './milestone'

const TODAY = '2026-09-30'
const offset = fc.integer({ min: -400, max: 400 })
const maybeOffset = fc.option(offset, { nil: null })
const factsArb = fc.record({
  completed: fc.boolean(),
  due: maybeOffset,
  week: fc.option(fc.integer({ min: -60, max: 60 }), { nil: null }),
  day: maybeOffset,
})
const MILESTONE = '2026-10-23'

function toFacts(r: { completed: boolean; due: number | null; week: number | null; day: number | null }): LateFacts {
  return {
    completed: r.completed,
    dueDate: r.due === null ? null : addDays(MILESTONE, r.due),
    lastWeekStart: r.week === null ? null : addWeeks(weekStart(MILESTONE), r.week),
    lastDayDate: r.day === null ? null : addDays(MILESTONE, r.day),
  }
}

describe('BR-70 milestoneStatus properties', () => {
  it('not completed: DUE_SOON ⇔ 0 ≤ offset ≤ 7; OVERDUE ⇔ offset < 0', () => {
    fc.assert(
      fc.property(offset, (o) => {
        const s = milestoneStatus({ date: addDays(TODAY, o), completedOn: null }, TODAY)
        expect(s === 'DUE_SOON').toBe(o >= 0 && o <= DUE_SOON_DAYS)
        expect(s === 'OVERDUE').toBe(o < 0)
        expect(s === 'UPCOMING').toBe(o > DUE_SOON_DAYS)
      }),
    )
  })
  it('completed ⇒ DONE whatever the dates', () => {
    fc.assert(
      fc.property(offset, offset, (o, c) => {
        expect(milestoneStatus({ date: addDays(TODAY, o), completedOn: addDays(TODAY, c) }, TODAY)).toBe('DONE')
      }),
    )
  })
})

describe('BR-71 properties', () => {
  it('completed ⇒ never late; otherwise late ⇔ some fact is after the milestone date', () => {
    fc.assert(
      fc.property(factsArb, (r) => {
        const f = toFacts(r)
        const late = isLateForMilestone(MILESTONE, f)
        const weekAfter = r.week !== null && r.week > 0 // the milestone's own week (0) never counts
        const expected = !r.completed && ((r.due ?? 0) > 0 || (r.day ?? 0) > 0 || weekAfter)
        expect(late).toBe(expected)
        expect(lateReasons(MILESTONE, f).length > 0).toBe(late)
      }),
    )
  })
  it('lateTaskCount counts late tasks; late ⇔ count ≥ 1', () => {
    fc.assert(
      fc.property(fc.array(factsArb, { maxLength: 20 }), (rs) => {
        const fs = rs.map(toFacts)
        const res = milestoneLateness(MILESTONE, fs)
        const n = fs.filter((f) => isLateForMilestone(MILESTONE, f)).length
        expect(res).toEqual({ late: n > 0, lateTaskCount: n })
        expect(Number.isInteger(res.lateTaskCount)).toBe(true)
      }),
    )
  })
  it('progress: 0 ≤ done ≤ total = length', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 50 }), (bs) => {
        const p = milestoneProgress(bs.map((completed) => ({ completed })))
        expect(p.total).toBe(bs.length)
        expect(p.done).toBe(bs.filter(Boolean).length)
      }),
    )
  })
})

describe('FR-707 dateInWeekKeepingWeekday properties', () => {
  it('keeps the weekday and lands in the target week', () => {
    fc.assert(
      fc.property(offset, fc.integer({ min: -200, max: 200 }), (o, w) => {
        const date = addDays(TODAY, o)
        const target = addWeeks(weekStart(TODAY), w)
        const res = dateInWeekKeepingWeekday(date, target)
        expect(isoWeekday(res)).toBe(isoWeekday(date))
        expect(weekStart(res)).toBe(target)
      }),
    )
  })
})
