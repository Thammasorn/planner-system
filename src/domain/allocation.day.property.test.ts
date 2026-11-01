// SPEC §5.3 invariants + M7 day rules as fast-check properties (plan/m07 §5.S1.9, M7-D21: fc.assert only).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  clampAndSpill,
  collapseDays,
  displayDays,
  distribute,
  materializeWithEdits,
  planWeek,
  scaleDays,
  spreadWeek,
  weekPlanTotal,
  type DayCtx,
  type Days7,
  type OnDayWeekChoice,
  type WeekChange,
  type WeekPlan,
} from './allocation'

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const W = (weekCd: number): WeekPlan => ({ resolution: 'WEEK', weekCd })
const D = (days: number[]): WeekPlan => ({ resolution: 'DAY', days })
const NULL_PLAN: WeekPlan = { resolution: null }
const wk = (cd: number | null): WeekChange => ({ granularity: 'WEEK', cd })
const dy = (dayIndex: number, cd: number | null): WeekChange => ({ granularity: 'DAY', dayIndex, cd })
const sevenDayChanges = (s: Days7): WeekChange[] => s.map((cd, i) => dy(i, cd === 0 ? null : cd))

const arbCd = fc.integer({ min: 0, max: 700 })
const arbDay = fc.integer({ min: 0, max: 100 })
const arbDays = fc.array(arbDay, { minLength: 7, maxLength: 7 })
const arbFrac = fc.array(fc.constantFrom(0, 25, 50, 75, 100), { minLength: 7, maxLength: 7 })
/** schedule, then dayCaps[i] ≤ schedule[i] (leave/holidays only lower capacity). */
const arbCtx: fc.Arbitrary<DayCtx> = fc
  .tuple(arbFrac, arbFrac, fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }))
  .map(([schedule, caps, timeOff]) => ({
    week: '2026-09-28',
    schedule,
    dayCaps: caps.map((c, i) => Math.min(c, schedule[i]!)),
    timeOff,
  }))
const arbEdits: fc.Arbitrary<Map<number, number>> = fc
  .dictionary(fc.constantFrom('0', '1', '2', '3', '4', '5', '6'), arbDay)
  .map((o) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v])))
const arbPlan: fc.Arbitrary<WeekPlan> = fc.oneof(
  fc.constant(NULL_PLAN),
  fc.integer({ min: 1, max: 700 }).map(W),
  arbDays.filter((d) => sum(d) > 0).map(D),
)
const arbChange: fc.Arbitrary<WeekChange> = fc.oneof(
  fc.option(arbCd).map(wk),
  fc.tuple(fc.integer({ min: 0, max: 6 }), fc.option(arbDay)).map(([i, cd]) => dy(i, cd)),
)
const arbChoice: fc.Arbitrary<OnDayWeekChoice | undefined> = fc.constantFrom(undefined, 'SCALE' as const, 'COLLAPSE' as const)

function allDaysInRange(days: readonly number[]): boolean {
  return days.length === 7 && days.every((d) => Number.isSafeInteger(d) && d >= 0 && d <= 100)
}

describe('allocation day invariants (fast-check)', () => {
  it('P1 Σ distribute(t, w) === t whenever Σw > 0 (weights from the caps arbitrary)', () => {
    fc.assert(
      fc.property(arbCd, arbFrac, (t, w) => {
        fc.pre(sum(w) > 0)
        const r = distribute(t, w)
        expect(sum(r)).toBe(t)
        expect(r.every((x) => Number.isSafeInteger(x) && x >= 0)).toBe(true)
      }),
    )
  })

  it('P2 expand → collapse keeps the week total', () => {
    fc.assert(
      fc.property(arbCd, arbCtx, (w, ctx) => {
        const r = clampAndSpill(spreadWeek(w, ctx).days, new Set(), ctx)
        expect(r.ok).toBe(true)
        if (r.ok) expect(collapseDays(r.days)).toBe(w)
      }),
    )
  })

  it('P3 displayed day sum = week total for every resolution', () => {
    fc.assert(
      fc.property(arbPlan, arbCtx, (p, ctx) => {
        const shown = displayDays(p, ctx)
        expect(sum(shown.days)).toBe(weekPlanTotal(p))
        expect(shown.derived).toBe(p.resolution === 'WEEK')
      }),
    )
  })

  it('P4 + P5 materializeWithEdits: days in [0, 100]; Σ = W − Σ derived[edited] + Σ x', () => {
    fc.assert(
      fc.property(arbCd, arbEdits, arbCtx, (w, e, ctx) => {
        const r = materializeWithEdits(w, e, ctx)
        if (!r.ok) return
        expect(allDaysInRange(r.days)).toBe(true)
        const derived = spreadWeek(w, ctx).days
        let expected = w
        for (const [i, x] of e) expected += x - derived[i]!
        expect(sum(r.days)).toBe(expected)
        for (const [i, x] of e) expect(r.days[i]).toBe(x)
      }),
      { numRuns: 1000 },
    )
  })

  it('P4 + P6 scaleDays: days in [0, 100]; Σ = newTotal', () => {
    fc.assert(
      fc.property(arbDays, arbCd, arbCtx, (days, t, ctx) => {
        fc.pre(sum(days) > 0)
        const r = scaleDays(days, t, ctx)
        expect(r.ok).toBe(true) // ≤ 700 always fits in 7 × 100
        if (!r.ok) return
        expect(allDaysInRange(r.days)).toBe(true)
        expect(sum(r.days)).toBe(t)
      }),
    )
  })

  it('P4 planWeek: every ok DAY result has days in [0, 100] and Σ > 0; WEEK ≤ 700', () => {
    fc.assert(
      fc.property(arbPlan, fc.array(arbChange, { maxLength: 8 }), arbCtx, arbChoice, (p, cs, ctx, choice) => {
        const r = planWeek(p, cs, ctx, choice)
        if (r.kind !== 'ok') return
        if (r.next.resolution === 'DAY') {
          expect(allDaysInRange(r.next.days)).toBe(true)
          expect(sum(r.next.days)).toBeGreaterThan(0)
        }
        if (r.next.resolution === 'WEEK') {
          expect(r.next.weekCd).toBeGreaterThan(0)
          expect(r.next.weekCd).toBeLessThanOrEqual(700)
        }
      }),
      { numRuns: 2000 },
    )
  })

  it('P7 snapshot round trip: 7-day DAY snapshot → s (or null); WEEK snapshot + COLLAPSE → WEEK s', () => {
    fc.assert(
      fc.property(arbPlan, arbDays, arbCtx, (p, s, ctx) => {
        const r = planWeek(p, sevenDayChanges(s), ctx)
        expect(r).toMatchObject({ kind: 'ok', next: sum(s) === 0 ? NULL_PLAN : D(s) })
      }),
    )
    fc.assert(
      fc.property(arbPlan, fc.integer({ min: 1, max: 700 }), arbCtx, (p, s, ctx) => {
        expect(planWeek(p, [wk(s)], ctx, 'COLLAPSE')).toMatchObject({ kind: 'ok', next: W(s) })
      }),
    )
  })

  it('P8 needsChoice only without a choice on a DAY week', () => {
    fc.assert(
      fc.property(arbPlan, fc.array(arbChange, { maxLength: 8 }), arbCtx, arbChoice, (p, cs, ctx, choice) => {
        const r = planWeek(p, cs, ctx, choice)
        if (r.kind === 'needsChoice') {
          expect(choice).toBeUndefined()
          expect(p.resolution).toBe('DAY')
        }
      }),
      { numRuns: 2000 },
    )
  })
})
