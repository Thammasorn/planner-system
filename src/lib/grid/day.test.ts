// Shared pure day model (M7-D1, M7-D9, M7-D10, M7-D19, M7-D27) — plan/m07 §5.S1.11, written test-first.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { weekPlanTotal, type DayCtx, type WeekPlan } from '@/domain/allocation'
import { daysOfWeek } from '@/domain/dates'
import type { ISODate, PeriodKey, Weekday } from '@/domain/types'
import type { AssigneeCell, DayLoadRow, GridPerson } from '@/lib/contracts/grid'
import {
  dayCellsFromPlan,
  dayCtxFor,
  dKey,
  spreadDayLoads,
  visibleDayDates,
  weekCellFromPlan,
  weekPlanFromCell,
  weekPlanFromState,
  weekStateFromPlan,
  wKey,
} from './day'

const WK = '2026-09-28'
const WK2 = '2026-10-05'
const MON_FRI: Weekday[] = [1, 2, 3, 4, 5]

function person(over: Partial<GridPerson> = {}): GridPerson {
  return { name: 'P', active: true, deactivatedOn: null, capacity: {}, standard: {}, timeOff: [], ...over }
}
/** D: keys of the given week's weekdays (Mon=0) with value cd. */
function dayKeys(week: ISODate, cd: number, idx: number[] = [0, 1, 2, 3, 4]): Partial<Record<PeriodKey, number>> {
  const days = daysOfWeek(week)
  return Object.fromEntries(idx.map((i) => [dKey(days[i]!), cd]))
}
const IVY = person({ name: 'Ivy', capacity: dayKeys(WK, 100), standard: dayKeys(WK, 100) })
const MON_FRI_CTX: DayCtx = {
  week: WK,
  dayCaps: [100, 100, 100, 100, 100, 0, 0],
  schedule: [100, 100, 100, 100, 100, 0, 0],
  timeOff: [false, false, false, false, false, false, false],
}

describe('keys', () => {
  it('wKey / dKey', () => {
    expect(wKey(WK)).toBe('W:2026-09-28')
    expect(dKey('2026-09-30')).toBe('D:2026-09-30')
  })
})

describe('dayCtxFor', () => {
  it('builds caps/schedule from D: keys (missing = 0)', () => {
    expect(dayCtxFor(IVY, WK)).toEqual(MON_FRI_CTX)
  })
  it('undefined person → zeros', () => {
    expect(dayCtxFor(undefined, WK)).toEqual({
      week: WK,
      dayCaps: [0, 0, 0, 0, 0, 0, 0],
      schedule: [0, 0, 0, 0, 0, 0, 0],
      timeOff: [false, false, false, false, false, false, false],
    })
  })
  it('timeOff flags every date a leave covers, half days included', () => {
    const p = person({
      timeOff: [
        { start: '2026-10-05', end: '2026-10-06', half: null, label: 'ลา' },
        { start: '2026-10-09', end: '2026-10-09', half: 'PM', label: 'ลา' },
        { start: '2026-09-01', end: '2026-09-02', half: null, label: 'ลา' },
      ],
    })
    expect(dayCtxFor(p, WK2).timeOff).toEqual([true, true, false, false, true, false, false])
  })
})

describe('plan ↔ cell / state', () => {
  it('weekPlanFromCell', () => {
    expect(weekPlanFromCell(undefined, WK)).toEqual({ resolution: null })
    expect(weekPlanFromCell({ cd: 250, resolution: 'WEEK', derived: false }, WK)).toEqual({ resolution: 'WEEK', weekCd: 250 })
    expect(weekPlanFromCell({ cd: 0, resolution: 'WEEK', derived: false }, WK)).toEqual({ resolution: null })
    expect(
      weekPlanFromCell(
        { cd: 150, resolution: 'DAY', derived: false, days: { '2026-09-28': 50, '2026-10-01': 100 } },
        WK,
      ),
    ).toEqual({ resolution: 'DAY', days: [50, 0, 0, 100, 0, 0, 0] })
    expect(weekPlanFromCell({ cd: 0, resolution: 'DAY', derived: false }, WK)).toEqual({ resolution: null })
  })

  it('weekPlanFromState / weekStateFromPlan round trip', () => {
    expect(weekPlanFromState(undefined, WK)).toEqual({ resolution: null })
    expect(weekPlanFromState({ cd: 0, resolution: null }, WK)).toEqual({ resolution: null })
    expect(weekPlanFromState({ cd: 250, resolution: 'WEEK' }, WK)).toEqual({ resolution: 'WEEK', weekCd: 250 })
    expect(weekPlanFromState({ cd: 150, resolution: 'DAY', days: { '2026-09-29': 150 } }, WK)).toEqual({
      resolution: 'DAY',
      days: [0, 150, 0, 0, 0, 0, 0],
    })
    expect(weekStateFromPlan({ resolution: null }, WK)).toEqual({ cd: 0, resolution: null })
    expect(weekStateFromPlan({ resolution: 'WEEK', weekCd: 250 }, WK)).toEqual({ cd: 250, resolution: 'WEEK' })
    expect(weekStateFromPlan({ resolution: 'DAY', days: [50, 0, 100, 0, 0, 0, 0] }, WK)).toEqual({
      cd: 150,
      resolution: 'DAY',
      days: { '2026-09-28': 50, '2026-09-30': 100 },
    })
    const plans: WeekPlan[] = [
      { resolution: null },
      { resolution: 'WEEK', weekCd: 375 },
      { resolution: 'DAY', days: [0, 25, 0, 0, 100, 0, 75] },
    ]
    for (const p of plans) expect(weekPlanFromState(weekStateFromPlan(p, WK), WK)).toEqual(p)
  })

  it('weekCellFromPlan: W: cell, fallback only for WEEK with week cap 0', () => {
    expect(weekCellFromPlan({ resolution: null }, WK, 500, 500)).toBeUndefined()
    expect(weekCellFromPlan({ resolution: 'WEEK', weekCd: 250 }, WK, 500, 500)).toEqual({
      cd: 250,
      resolution: 'WEEK',
      derived: false,
    })
    expect(weekCellFromPlan({ resolution: 'WEEK', weekCd: 500 }, WK, 0, 500)).toEqual({
      cd: 500,
      resolution: 'WEEK',
      derived: false,
      fallback: 'SCHEDULE',
    })
    expect(weekCellFromPlan({ resolution: 'WEEK', weekCd: 500 }, WK, 0, 0)).toMatchObject({ fallback: 'WEEKDAYS' })
    expect(weekCellFromPlan({ resolution: 'DAY', days: [50, 50, 100, 50, 50, 0, 0] }, WK, 0, 0)).toEqual({
      cd: 300,
      resolution: 'DAY',
      derived: false,
      days: { '2026-09-28': 50, '2026-09-29': 50, '2026-09-30': 100, '2026-10-01': 50, '2026-10-02': 50 },
    })
  })
})

describe('dayCellsFromPlan', () => {
  it('Ivy WEEK 250 → five dashed 0.5 cells (AC-804)', () => {
    const plan = weekPlanFromCell({ cd: 250, resolution: 'WEEK', derived: false }, WK)
    const expected: Record<string, AssigneeCell> = {}
    for (const d of daysOfWeek(WK).slice(0, 5)) expected[dKey(d)] = { cd: 50, resolution: 'WEEK', derived: true }
    expect(dayCellsFromPlan(plan, dayCtxFor(IVY, WK))).toEqual(expected)
  })

  it('DAY week → solid stored cells, Wed 1.0', () => {
    const plan = weekPlanFromCell(
      {
        cd: 300,
        resolution: 'DAY',
        derived: false,
        days: { '2026-09-28': 50, '2026-09-29': 50, '2026-09-30': 100, '2026-10-01': 50, '2026-10-02': 50 },
      },
      WK,
    )
    const cells = dayCellsFromPlan(plan, dayCtxFor(IVY, WK))
    expect(Object.keys(cells)).toHaveLength(5)
    expect(cells['D:2026-09-30']).toEqual({ cd: 100, resolution: 'DAY', derived: false })
    expect(Object.values(cells).every((c) => !c.derived)).toBe(true)
  })

  it('time off 10-05..06 + DAY Mon 100 → warn NON_WORKING + TIME_OFF', () => {
    const p = person({
      capacity: dayKeys(WK2, 100, [2, 3, 4]),
      standard: dayKeys(WK2, 100),
      timeOff: [{ start: '2026-10-05', end: '2026-10-06', half: null, label: '' }],
    })
    const cells = dayCellsFromPlan({ resolution: 'DAY', days: [100, 0, 0, 0, 0, 0, 0] }, dayCtxFor(p, WK2))
    expect(cells).toEqual({ 'D:2026-10-05': { cd: 100, resolution: 'DAY', derived: false, warn: ['NON_WORKING', 'TIME_OFF'] } })
  })

  it('derived cells on cap-0 days of a fallback week warn NON_WORKING', () => {
    const p = person({ standard: dayKeys(WK, 100) })
    const cells = dayCellsFromPlan({ resolution: 'WEEK', weekCd: 500 }, dayCtxFor(p, WK))
    expect(cells['D:2026-09-28']).toEqual({ cd: 100, resolution: 'WEEK', derived: true, warn: ['NON_WORKING'] })
  })

  it('null plan → no cells', () => {
    expect(dayCellsFromPlan({ resolution: null }, MON_FRI_CTX)).toEqual({})
  })

  it('property: Σ D: cell cd = weekPlanTotal(plan)', () => {
    const arbFrac = fc.array(fc.constantFrom(0, 25, 50, 75, 100), { minLength: 7, maxLength: 7 })
    const arbPlan: fc.Arbitrary<WeekPlan> = fc.oneof(
      fc.constant<WeekPlan>({ resolution: null }),
      fc.integer({ min: 1, max: 700 }).map((weekCd): WeekPlan => ({ resolution: 'WEEK', weekCd })),
      fc
        .array(fc.integer({ min: 0, max: 100 }), { minLength: 7, maxLength: 7 })
        .map((days): WeekPlan => ({ resolution: 'DAY', days })),
    )
    fc.assert(
      fc.property(arbPlan, arbFrac, arbFrac, (plan, caps, schedule) => {
        const ctx: DayCtx = { week: WK, dayCaps: caps, schedule, timeOff: MON_FRI_CTX.timeOff }
        const cells = dayCellsFromPlan(plan, ctx)
        expect(Object.values(cells).reduce((s, c) => s + c.cd, 0)).toBe(weekPlanTotal(plan))
        expect(Object.values(cells).every((c) => c.cd > 0)).toBe(true)
      }),
    )
  })
})

describe('visibleDayDates (M7-D10)', () => {
  const weekdays = (ds: Weekday[]) => new Set<Weekday>(ds)
  it('Mon–Fri always', () => {
    expect(visibleDayDates(WK, { scheduledWeekdays: weekdays(MON_FRI), dayRowDates: new Set() })).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
    expect(visibleDayDates(WK, { scheduledWeekdays: weekdays([]), dayRowDates: new Set() })).toHaveLength(5)
  })
  it('a DAY row on Sunday adds only Sunday', () => {
    const r = visibleDayDates(WK, { scheduledWeekdays: weekdays(MON_FRI), dayRowDates: new Set(['2026-10-04']) })
    expect(r).toHaveLength(6)
    expect(r.at(-1)).toBe('2026-10-04')
  })
  it('Saturday scheduled adds Saturday', () => {
    const r = visibleDayDates(WK, { scheduledWeekdays: weekdays([...MON_FRI, 6]), dayRowDates: new Set() })
    expect(r).toContain('2026-10-03')
    expect(r).toHaveLength(6)
  })
})

describe('spreadDayLoads (M7-D27)', () => {
  const row = (o: Partial<DayLoadRow>): DayLoadRow => ({
    userId: 'cindy',
    weekStart: WK2,
    granularity: 'WEEK',
    periodStart: WK2,
    totalCd: 0,
    committedCd: 0,
    ...o,
  })
  const monFri = (): DayCtx => ({ ...MON_FRI_CTX, week: WK2 })

  it('WEEK { 250, 0 } over Mon–Fri → five D: { 50, 0 } (Cindy CRM 10-05)', () => {
    const out = spreadDayLoads([row({ totalCd: 250 })], monFri)
    const loads = out.get('cindy')!
    expect(Object.keys(loads)).toHaveLength(5)
    for (const d of daysOfWeek(WK2).slice(0, 5)) expect(loads[dKey(d)]).toEqual({ total: 50, committed: 0 })
  })

  it('WEEK { 250, 125 } with caps Mon–Thu → Σ kept and committed ≤ total per day', () => {
    const ctx: DayCtx = { ...monFri(), dayCaps: [100, 100, 100, 100, 0, 0, 0] }
    const loads = spreadDayLoads([row({ totalCd: 250, committedCd: 125 })], () => ctx).get('cindy')!
    const vals = Object.values(loads)
    expect(vals.reduce((s, v) => s + v!.total, 0)).toBe(250)
    expect(vals.reduce((s, v) => s + v!.committed, 0)).toBe(125)
    expect(vals.every((v) => v!.committed <= v!.total)).toBe(true)
  })

  it('DAY row counts as stored and sums with WEEK spreads of other rows', () => {
    const out = spreadDayLoads(
      [
        row({ weekStart: '2026-11-09', granularity: 'DAY', periodStart: '2026-11-10', totalCd: 75, committedCd: 75 }),
        row({ userId: 'ivy', weekStart: '2026-11-09', granularity: 'DAY', periodStart: '2026-11-10', totalCd: 25 }),
        row({ userId: 'ivy', weekStart: '2026-11-09', granularity: 'WEEK', periodStart: '2026-11-09', totalCd: 500 }),
      ],
      (_u, week) => ({ ...MON_FRI_CTX, week }),
    )
    expect(out.get('cindy')).toEqual({ 'D:2026-11-10': { total: 75, committed: 75 } })
    expect(out.get('ivy')!['D:2026-11-10']).toEqual({ total: 125, committed: 0 })
  })

  it('zero rows are omitted', () => {
    expect(spreadDayLoads([row({ totalCd: 0 })], monFri).get('cindy') ?? {}).toEqual({})
  })

  it('property: per user/week Σ total and Σ committed kept; committed ≤ total per key', () => {
    const arbFrac = fc.array(fc.constantFrom(0, 25, 50, 75, 100), { minLength: 7, maxLength: 7 })
    const arbRow = fc
      .tuple(fc.constantFrom('a', 'b'), fc.constantFrom(WK, WK2), fc.boolean(), fc.integer({ min: 0, max: 6 }), fc.nat(700), fc.nat(700))
      .map(([userId, weekStart, isDay, di, a, b]): DayLoadRow => {
        const totalCd = isDay ? Math.min(Math.max(a, b), 100) : Math.max(a, b)
        const committedCd = Math.min(a, b, totalCd)
        return { userId, weekStart, granularity: isDay ? 'DAY' : 'WEEK', periodStart: isDay ? daysOfWeek(weekStart)[di]! : weekStart, totalCd, committedCd }
      })
    fc.assert(
      fc.property(fc.array(arbRow, { maxLength: 8 }), arbFrac, arbFrac, (rows, caps, schedule) => {
        const out = spreadDayLoads(rows, (_u, week) => ({ week, dayCaps: caps, schedule, timeOff: MON_FRI_CTX.timeOff }))
        for (const u of ['a', 'b']) {
          for (const w of [WK, WK2]) {
            const input = rows.filter((r) => r.userId === u && r.weekStart === w)
            const keys = new Set(daysOfWeek(w).map(dKey))
            const got = Object.entries(out.get(u) ?? {}).filter(([k]) => keys.has(k as PeriodKey))
            expect(got.reduce((s, [, v]) => s + v!.total, 0)).toBe(input.reduce((s, r) => s + r.totalCd, 0))
            expect(got.reduce((s, [, v]) => s + v!.committed, 0)).toBe(input.reduce((s, r) => s + r.committedCd, 0))
            for (const [, v] of got) {
              expect(v!.committed).toBeLessThanOrEqual(v!.total)
              expect(v!.total).toBeGreaterThan(0)
            }
          }
        }
      }),
    )
  })
})
