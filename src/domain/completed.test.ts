import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { completedWeekOf, countsTowardLoad, futureLoad, releasedLoad } from './completed'
import { addWeeks } from './dates'

// Golden rows (docs/reference/golden-fixtures.json, r8 §6.3), WEEK cd per Monday.
const ROLLOUT = [
  { weekStart: '2026-11-30', cd: 250 },
  { weekStart: '2026-12-07', cd: 375 },
  { weekStart: '2026-12-14', cd: 500 },
  { weekStart: '2026-12-21', cd: 500 },
  { weekStart: '2026-12-28', cd: 250 },
]
const UAT = [
  { weekStart: '2026-09-14', cd: 250 },
  { weekStart: '2026-09-21', cd: 250 },
  { weekStart: '2026-09-28', cd: 250 },
  { weekStart: '2026-10-05', cd: 125 },
]
const CINDY_POS = [
  { weekStart: '2026-08-31', cd: 500 },
  { weekStart: '2026-09-07', cd: 500 },
  { weekStart: '2026-09-14', cd: 375 },
  { weekStart: '2026-09-21', cd: 250 },
  { weekStart: '2026-09-28', cd: 250 },
]
const open = <T extends { weekStart: string; cd: number }>(rows: T[]) => rows.map((r) => ({ ...r, completedWeek: null }))

describe('completedWeekOf (BR-50)', () => {
  it.each([
    ['2026-10-04', '2026-09-28'],
    ['2027-01-01', '2026-12-28'],
    ['2026-09-28', '2026-09-28'],
  ] as const)('completedWeekOf(%s) = %s', (d, ws) => {
    expect(completedWeekOf(d)).toBe(ws)
  })

  it('null (open task) → null', () => {
    expect(completedWeekOf(null)).toBeNull()
  })
})

describe('countsTowardLoad (BR-50, BR-51)', () => {
  it.each([
    ['2026-09-21', '2026-09-28', true], // week before completed_week
    ['2026-09-28', '2026-09-28', true], // the completed week itself
    ['2026-10-05', '2026-09-28', false], // after
    ['2027-01-04', '2026-12-28', false], // across the year boundary
  ] as const)('countsTowardLoad(%s, %s) = %s', (w, cw, expected) => {
    expect(countsTowardLoad(w, cw)).toBe(expected)
  })

  it('BR-51: an open (or uncompleted) task counts in every week', () => {
    expect(countsTowardLoad('2026-10-05', null)).toBe(true)
    expect(countsTowardLoad('2030-01-07', null)).toBe(true)
  })

  it('rejects invalid dates', () => {
    expect(() => countsTowardLoad('2026-13-01', null)).toThrow(RangeError)
  })
})

describe('releasedLoad (BR-52)', () => {
  it('Rollout สาขา completed in week 09-28 → 18.75 days over 5 weeks', () => {
    expect(releasedLoad(ROLLOUT, '2026-09-28')).toEqual({ cd: 1875, weeks: 5 })
  })

  it('UAT completed in week 09-28 → 1.25 days in 1 week', () => {
    expect(releasedLoad(UAT, '2026-09-28')).toEqual({ cd: 125, weeks: 1 })
  })

  it('Cindy POS (ends 09-28) → null (nothing in the future)', () => {
    expect(releasedLoad(CINDY_POS, '2026-09-28')).toBeNull()
    expect(releasedLoad([], '2026-09-28')).toBeNull()
  })

  it('two assignments in the same week count once for N', () => {
    const rows = [
      { weekStart: '2026-10-05', cd: 250 },
      { weekStart: '2026-10-05', cd: 125 },
      { weekStart: '2026-10-12', cd: 100 },
    ]
    expect(releasedLoad(rows, '2026-09-28')).toEqual({ cd: 475, weeks: 2 })
  })

  it('rows that sum to 0 → null', () => {
    expect(releasedLoad([{ weekStart: '2026-10-05', cd: 0 }], '2026-09-28')).toBeNull()
  })
})

describe('futureLoad (FR-406)', () => {
  it('POS rows at 2026-09-28 → 2 500 (r8 §6.3: current week included)', () => {
    expect(futureLoad([...open(CINDY_POS), ...open(UAT), ...open(ROLLOUT)], '2026-09-28')).toBe(2500)
  })

  it("a completed task's later rows are excluded (BR-50)", () => {
    const rollout = ROLLOUT.map((r) => ({ ...r, completedWeek: '2026-09-28' }))
    expect(futureLoad([...open(CINDY_POS), ...open(UAT), ...rollout], '2026-09-28')).toBe(625)
  })

  it('a completed week that is still ≥ fromWeek counts', () => {
    expect(futureLoad([{ weekStart: '2026-10-05', cd: 300, completedWeek: '2026-10-05' }], '2026-09-28')).toBe(300)
  })

  it('no rows → 0', () => {
    expect(futureLoad([], '2026-09-28')).toBe(0)
  })
})

describe('completed properties', () => {
  const arbWeek = fc.integer({ min: -60, max: 60 }).map((n) => addWeeks('2026-09-28', n))
  const arbRow = fc.record({ weekStart: arbWeek, cd: fc.integer({ min: 0, max: 700 }) })

  it('released + still counted = everything (BR-51: completing never loses plans)', () => {
    fc.assert(
      fc.property(fc.array(arbRow, { maxLength: 30 }), arbWeek, (rows, cw) => {
        const all = rows.reduce((s, r) => s + r.cd, 0)
        const counted = rows.filter((r) => countsTowardLoad(r.weekStart, cw)).reduce((s, r) => s + r.cd, 0)
        expect(counted + (releasedLoad(rows, cw)?.cd ?? 0)).toBe(all)
      }),
    )
  })

  it('released weeks ≤ distinct future weeks and every result is an integer', () => {
    fc.assert(
      fc.property(fc.array(arbRow, { maxLength: 30 }), arbWeek, (rows, cw) => {
        const r = releasedLoad(rows, cw)
        if (r === null) return
        expect(Number.isSafeInteger(r.cd) && r.cd > 0).toBe(true)
        expect(r.weeks).toBe(new Set(rows.filter((x) => x.weekStart > cw && x.cd > 0).map((x) => x.weekStart)).size)
      }),
    )
  })
})
