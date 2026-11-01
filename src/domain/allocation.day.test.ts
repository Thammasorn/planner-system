// M7 day-level rules (SPEC §5.3 BR-21…BR-24, X65, M7-D2/D5/D7/D8/D9) — plan/m07 §5.S1.2–S1.9 tables, one it per row.
import { describe, expect, it } from 'vitest'
import {
  collapseDays,
  dayWarnings,
  displayDays,
  materializeWithEdits,
  planWeek,
  scaleDays,
  spreadWeek,
  weekPlanTotal,
  type DayCtx,
  type DayWarning,
  type Days7,
  type OnDayWeekChoice,
  type PlanWeekResult,
  type WeekChange,
  type WeekPlan,
} from './allocation'

const MON_FRI: Days7 = [100, 100, 100, 100, 100, 0, 0]
const ZERO7: Days7 = [0, 0, 0, 0, 0, 0, 0]
const NO_LEAVE = [false, false, false, false, false, false, false]

function ctxOf(dayCaps: Days7, schedule: Days7 = MON_FRI, timeOff: readonly boolean[] = NO_LEAVE): DayCtx {
  return { week: '2026-09-28', dayCaps, schedule, timeOff }
}
const NORMAL = ctxOf(MON_FRI)
/** Golden F2: Friday holiday. */
const F2 = ctxOf([100, 100, 100, 100, 0, 0, 0])
/** Golden F3 Peter: Mon/Tue on leave. */
const F3 = ctxOf([0, 0, 100, 100, 100, 0, 0], MON_FRI, [true, true, false, false, false, false, false])
/** Golden F4 Cindy: Mon–Wed lost. */
const F4 = ctxOf([0, 0, 0, 100, 100, 0, 0])

const NULL_PLAN: WeekPlan = { resolution: null }
const W = (weekCd: number): WeekPlan => ({ resolution: 'WEEK', weekCd })
const D = (...days: number[]): WeekPlan => ({ resolution: 'DAY', days })
const wk = (cd: number | null): WeekChange => ({ granularity: 'WEEK', cd })
const dy = (dayIndex: number, cd: number | null): WeekChange => ({ granularity: 'DAY', dayIndex, cd })
const SPILLED: DayWarning = { code: 'SPILLED_OVER_DAY_LIMIT' }
const NW = (dayIndex: number): DayWarning => ({ code: 'WORK_ON_NON_WORKING_DAY', dayIndex })
const TO = (dayIndex: number): DayWarning => ({ code: 'ALLOCATED_ON_TIME_OFF', dayIndex })
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const edits = (o: Record<number, number>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]))

// ---------------------------------------------------------------------------------------------------------------
describe('spreadWeek — rows absent from M6 (S1.2)', () => {
  it.each<[string, number, DayCtx, number[], null | 'SCHEDULE' | 'WEEKDAYS']>([
    ['250, Mon–Fri (AC-804)', 250, NORMAL, [50, 50, 50, 50, 50, 0, 0], null],
    ['250, F2 Peter/Ivy', 250, F2, [63, 63, 62, 62, 0, 0, 0], null],
    ['500, F2 Jack/Mint', 500, F2, [125, 125, 125, 125, 0, 0, 0], null],
    ['375, F2 Cindy', 375, F2, [94, 94, 94, 93, 0, 0, 0], null],
    ['500, F3 Peter', 500, F3, [0, 0, 167, 167, 166, 0, 0], null],
    ['250, F4 Cindy', 250, F4, [0, 0, 0, 125, 125, 0, 0], null],
    ['250, caps 0×7, schedule Mon–Fri', 250, ctxOf(ZERO7), [50, 50, 50, 50, 50, 0, 0], 'SCHEDULE'],
    ['250, caps 0×7, schedule 0×7', 250, ctxOf(ZERO7, ZERO7), [50, 50, 50, 50, 50, 0, 0], 'WEEKDAYS'],
    ['250, caps 0×7, schedule M/W/F', 250, ctxOf(ZERO7, [100, 0, 100, 0, 100, 0, 0]), [84, 0, 83, 0, 83, 0, 0], 'SCHEDULE'],
    ['0, any', 0, F3, [0, 0, 0, 0, 0, 0, 0], null],
  ])('%s', (_n, weekCd, ctx, days, fallback) => {
    expect(spreadWeek(weekCd, ctx)).toEqual({ days, fallback })
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('dayWarnings (S1.4)', () => {
  it('F2 Jack result → [SPILLED, NON_WORKING@4]', () => {
    expect(dayWarnings([100, 100, 100, 100, 75, 0, 0], F2, true)).toEqual([SPILLED, NW(4)])
  })
  it('half-day leave day (cap 50, timeOff) with 100 → TIME_OFF only', () => {
    const ctx = ctxOf([100, 50, 100, 100, 100, 0, 0], MON_FRI, [false, true, false, false, false, false, false])
    expect(dayWarnings([0, 100, 0, 0, 0, 0, 0], ctx, false)).toEqual([TO(1)])
  })
  it('full-day leave with work → NON_WORKING and TIME_OFF; zero days never warn', () => {
    expect(dayWarnings([100, 0, 50, 0, 0, 0, 0], F3, false)).toEqual([NW(0), TO(0)])
  })
  it('nothing to report → []', () => {
    expect(dayWarnings([50, 50, 50, 50, 50, 0, 0], NORMAL, false)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('materializeWithEdits (BR-22, M7-D7/D8) (S1.5)', () => {
  it.each<[string, number, Map<number, number>, DayCtx, number[], DayWarning[], number]>([
    ['AC-804: 250, Wed→100', 250, edits({ 2: 100 }), NORMAL, [50, 50, 100, 50, 50, 0, 0], [], 300],
    ['250, Wed→50 (still materialised, E4)', 250, edits({ 2: 50 }), NORMAL, [50, 50, 50, 50, 50, 0, 0], [], 250],
    ['250, Mon→0', 250, edits({ 0: 0 }), NORMAL, [0, 50, 50, 50, 50, 0, 0], [], 200],
    ['F2 Jack: 500, Mon→100', 500, edits({ 0: 100 }), F2, [100, 100, 100, 100, 75, 0, 0], [SPILLED, NW(4)], 475],
    ['0, Wed→100', 0, edits({ 2: 100 }), NORMAL, [0, 0, 100, 0, 0, 0, 0], [], 100],
    [
      '250, Sat→50 (Sat cap 0)',
      250,
      edits({ 5: 50 }),
      NORMAL,
      [50, 50, 50, 50, 50, 50, 0],
      [NW(5)],
      300,
    ],
    [
      'F3: 500, Wed→50',
      500,
      edits({ 2: 50 }),
      F3,
      [100, 33, 50, 100, 100, 0, 0],
      [SPILLED, NW(0), NW(1), TO(0), TO(1)],
      383,
    ],
  ])('%s', (_n, weekCd, e, ctx, days, warnings, total) => {
    const r = materializeWithEdits(weekCd, e, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.days).toEqual(days)
    expect(r.warnings).toEqual(warnings)
    expect(r.spilled).toBe(warnings.includes(SPILLED))
    expect(sum(r.days)).toBe(total)
  })

  it('700, Tue→0, caps Mon only, schedule Mon only → UNREPRESENTABLE', () => {
    const only = [100, 0, 0, 0, 0, 0, 0]
    expect(materializeWithEdits(700, edits({ 1: 0 }), ctxOf(only, only))).toEqual({ ok: false, reason: 'UNREPRESENTABLE' })
  })

  it('rejects an edit outside 0..100 or an index outside 0..6 (programmer errors)', () => {
    expect(() => materializeWithEdits(250, edits({ 2: 125 }), NORMAL)).toThrow(RangeError)
    expect(() => materializeWithEdits(250, edits({ 7: 50 }), NORMAL)).toThrow(RangeError)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('scaleDays (BR-24 SCALE) (S1.6)', () => {
  it.each<[string, number[], number, DayCtx, number[], DayWarning[]]>([
    ['[50,50,100,50,50] → 200 (r8 §4.7)', [50, 50, 100, 50, 50, 0, 0], 200, NORMAL, [34, 33, 67, 33, 33, 0, 0], []],
    ['[100,50,50,50,50] → 200', [100, 50, 50, 50, 50, 0, 0], 200, NORMAL, [67, 34, 33, 33, 33, 0, 0], []],
    ['[50,50,100,50,50] → 400 spills', [50, 50, 100, 50, 50, 0, 0], 400, NORMAL, [100, 67, 100, 67, 66, 0, 0], [SPILLED]],
    ['[100,100,50] → 400 spills', [100, 100, 50, 0, 0, 0, 0], 400, NORMAL, [100, 100, 100, 100, 0, 0, 0], [SPILLED]],
    [
      '[100] → 700 spills to the weekend',
      [100, 0, 0, 0, 0, 0, 0],
      700,
      NORMAL,
      [100, 100, 100, 100, 100, 100, 100],
      [SPILLED, NW(5), NW(6)],
    ],
  ])('%s', (_n, days, total, ctx, expected, warnings) => {
    expect(scaleDays(days, total, ctx)).toEqual({ ok: true, days: expected, spilled: warnings.includes(SPILLED), warnings })
  })

  it('newTotal 0 → zeros', () => {
    expect(scaleDays([50, 50, 0, 0, 0, 0, 0], 0, NORMAL)).toEqual({ ok: true, days: [0, 0, 0, 0, 0, 0, 0], spilled: false, warnings: [] })
  })

  it('newTotal > 700 cannot be represented', () => {
    expect(scaleDays([100, 0, 0, 0, 0, 0, 0], 725, NORMAL)).toEqual({ ok: false, reason: 'UNREPRESENTABLE' })
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('collapseDays (BR-23) (S1.7)', () => {
  it.each<[number[], number]>([
    [[50, 50, 100, 50, 50, 0, 0], 300],
    [[100, 100, 100, 100, 100, 100, 100], 700],
  ])('collapseDays(%j) = %i', (days, total) => {
    expect(collapseDays(days)).toBe(total)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('displayDays + weekPlanTotal (S1.9)', () => {
  it('WEEK → BR-21 spread, derived', () => {
    expect(displayDays(W(250), NORMAL)).toEqual({ days: [50, 50, 50, 50, 50, 0, 0], derived: true, fallback: null })
    expect(displayDays(W(250), ctxOf(ZERO7))).toEqual({ days: [50, 50, 50, 50, 50, 0, 0], derived: true, fallback: 'SCHEDULE' })
    expect(displayDays(W(500), F3).days).toEqual([0, 0, 167, 167, 166, 0, 0]) // never clamped (M7-D8)
  })
  it('DAY → stored days, solid', () => {
    expect(displayDays(D(50, 50, 100, 50, 50, 0, 0), NORMAL)).toEqual({ days: [50, 50, 100, 50, 50, 0, 0], derived: false, fallback: null })
  })
  it('null → zeros', () => {
    expect(displayDays(NULL_PLAN, NORMAL)).toEqual({ days: [0, 0, 0, 0, 0, 0, 0], derived: false, fallback: null })
  })
  it.each<[WeekPlan, number]>([
    [NULL_PLAN, 0],
    [W(250), 250],
    [D(50, 50, 100, 50, 50, 0, 0), 300],
  ])('weekPlanTotal(%j) = %i', (p, t) => {
    expect(weekPlanTotal(p)).toBe(t)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('planWeek — M7 per-(item, week) table (S1.8)', () => {
  const DAYW = D(50, 50, 100, 50, 50, 0, 0)

  it.each<[string, WeekPlan, WeekChange[], OnDayWeekChoice | undefined, PlanWeekResult]>([
    ['null + WEEK 250', NULL_PLAN, [wk(250)], undefined, { kind: 'ok', next: W(250), changed: true, warnings: [] }],
    ['WEEK 250 + WEEK null', W(250), [wk(null)], undefined, { kind: 'ok', next: NULL_PLAN, changed: true, warnings: [] }],
    ['WEEK 250 + DAY Wed 100 (BR-22)', W(250), [dy(2, 100)], undefined, { kind: 'ok', next: DAYW, changed: true, warnings: [] }],
    ['DAY + WEEK 400', DAYW, [wk(400)], undefined, { kind: 'needsChoice' }],
    ['DAY + WEEK 400 SCALE', DAYW, [wk(400)], 'SCALE', { kind: 'ok', next: D(100, 67, 100, 67, 66, 0, 0), changed: true, warnings: [SPILLED] }],
    ['DAY + WEEK 400 COLLAPSE', DAYW, [wk(400)], 'COLLAPSE', { kind: 'ok', next: W(400), changed: true, warnings: [] }],
    ['DAY + WEEK 300 COLLAPSE (BR-23, M7-D2)', DAYW, [wk(300)], 'COLLAPSE', { kind: 'ok', next: W(300), changed: true, warnings: [] }],
    ['DAY + WEEK 300 SCALE (= Σ)', DAYW, [wk(300)], 'SCALE', { kind: 'ok', next: DAYW, changed: false, warnings: [] }],
    ['DAY + WEEK 300 (= Σ, M7-D5)', DAYW, [wk(300)], undefined, { kind: 'ok', next: DAYW, changed: false, warnings: [] }],
    ['DAY + WEEK null (no choice, M7-D5)', DAYW, [wk(null)], undefined, { kind: 'ok', next: NULL_PLAN, changed: true, warnings: [] }],
    [
      'DAY [100,100,50] + 7-day snapshot (replay)',
      D(100, 100, 50, 0, 0, 0, 0),
      [dy(0, 100), dy(1, 100), dy(2, 50), dy(3, null), dy(4, null), dy(5, null), dy(6, null)],
      undefined,
      { kind: 'ok', next: D(100, 100, 50, 0, 0, 0, 0), changed: false, warnings: [] },
    ],
    [
      'WEEK 250 + 7-day snapshot (exact undo after COLLAPSE)',
      W(250),
      [dy(0, 100), dy(1, 100), dy(2, 50), dy(3, null), dy(4, null), dy(5, null), dy(6, null)],
      undefined,
      { kind: 'ok', next: D(100, 100, 50, 0, 0, 0, 0), changed: true, warnings: [] },
    ],
    ['DAY [50] + DAY Mon null (E8)', D(50, 0, 0, 0, 0, 0, 0), [dy(0, null)], undefined, { kind: 'ok', next: NULL_PLAN, changed: true, warnings: [] }],
    ['DAY + DAY Mon 125', DAYW, [dy(0, 125)], undefined, { kind: 'invalid', reason: 'MAX', dayIndex: 0 }],
    ['WEEK 250 + WEEK 725', W(250), [wk(725)], undefined, { kind: 'invalid', reason: 'MAX' }],
    ['WEEK 250 + WEEK 300 + DAY Mon 50', W(250), [wk(300), dy(0, 50)], undefined, { kind: 'invalid', reason: 'MIXED_WEEK_AND_DAY' }],
  ])('%s', (_n, current, changes, choice, expected) => {
    expect(planWeek(current, changes, NORMAL, choice)).toEqual(expected)
  })

  it('cap-0 week + WEEK 250 → ok WEEK 250 + WEEK_NO_CAPACITY', () => {
    expect(planWeek(W(0), [wk(250)], ctxOf(ZERO7))).toEqual({
      kind: 'ok',
      next: W(250),
      changed: true,
      warnings: [{ code: 'WEEK_NO_CAPACITY' }],
    })
  })

  it('F2 Jack: WEEK 500 + DAY Mon 100 → spilled DAY + warnings', () => {
    expect(planWeek(W(500), [dy(0, 100)], F2)).toEqual({
      kind: 'ok',
      next: D(100, 100, 100, 100, 75, 0, 0),
      changed: true,
      warnings: [SPILLED, NW(4)],
    })
  })

  it('WEEK whose materialised days all become 0 → null', () => {
    expect(planWeek(W(250), [0, 1, 2, 3, 4].map((i) => dy(i, null)), NORMAL)).toEqual({
      kind: 'ok',
      next: NULL_PLAN,
      changed: true,
      warnings: [],
    })
  })

  it('WEEK + day edit that cannot be represented → invalid UNREPRESENTABLE', () => {
    const only = [100, 0, 0, 0, 0, 0, 0]
    expect(planWeek(W(700), [dy(1, 0)], ctxOf(only, only))).toEqual({ kind: 'invalid', reason: 'UNREPRESENTABLE' })
  })

  it('DAY day edits carry dayWarnings (time off, non-working)', () => {
    expect(planWeek(NULL_PLAN, [dy(0, 50)], F3)).toEqual({
      kind: 'ok',
      next: D(50, 0, 0, 0, 0, 0, 0),
      changed: true,
      warnings: [NW(0), TO(0)],
    })
  })

  it('SCALE on a cap-0 week spills to scheduled, then other days', () => {
    const r = planWeek(D(100, 0, 0, 0, 0, 0, 0), [wk(300)], ctxOf(ZERO7), 'SCALE')
    expect(r).toEqual({
      kind: 'ok',
      next: D(100, 100, 100, 0, 0, 0, 0),
      changed: true,
      warnings: [SPILLED, NW(0), NW(1), NW(2)],
    })
  })
})
