import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  clampAndSpill,
  distribute,
  isWholeWeek,
  planRange,
  planWeek,
  spreadWeek,
  weekPlanTotal,
  type DayCtx,
  type DayWarning,
  type Days7,
  type RangeWeek,
  type WeekChange,
  type WeekPlan,
} from './allocation'
import { addDays, addWeeks, daysOfWeek } from './dates'

// ---------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------

const MON_FRI: Days7 = [100, 100, 100, 100, 100, 0, 0]
const ZERO7: Days7 = [0, 0, 0, 0, 0, 0, 0]
const NO_LEAVE = [false, false, false, false, false, false, false]

function ctxOf(dayCaps: Days7, schedule: Days7 = MON_FRI, week = '2026-11-09', timeOff = NO_LEAVE): DayCtx {
  return { week, dayCaps, schedule, timeOff }
}
const NORMAL = ctxOf(MON_FRI)

const NULL_PLAN: WeekPlan = { resolution: null }
const W = (weekCd: number): WeekPlan => ({ resolution: 'WEEK', weekCd })
const D = (...days: number[]): WeekPlan => ({ resolution: 'DAY', days })
const wk = (cd: number | null): WeekChange => ({ granularity: 'WEEK', cd })
const dy = (dayIndex: number, cd: number | null): WeekChange => ({ granularity: 'DAY', dayIndex, cd })
const sevenDayChanges = (s: Days7): WeekChange[] => s.map((cd, i) => dy(i, cd === 0 ? null : cd))
const spilled: DayWarning = { code: 'SPILLED_OVER_DAY_LIMIT' }
const nonWorking = (dayIndex: number): DayWarning => ({ code: 'WORK_ON_NON_WORKING_DAY', dayIndex })
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/** Every Monday from weekStart(start) to weekStart(end), all with Mon–Fri 100 capacity unless overridden. */
function rangeWeeks(
  firstMonday: string,
  count: number,
  over: Record<string, Partial<Pick<RangeWeek, 'current'>> & { caps?: Days7; schedule?: Days7 }> = {},
): RangeWeek[] {
  return Array.from({ length: count }, (_, i) => {
    const week = addWeeks(firstMonday, i)
    const o = over[week] ?? {}
    return { week, ctx: ctxOf(o.caps ?? MON_FRI, o.schedule ?? MON_FRI, week), current: o.current ?? NULL_PLAN }
  })
}

// ---------------------------------------------------------------------------------------------------------------
// distribute (BR-21, PLAN §3.6)
// ---------------------------------------------------------------------------------------------------------------

describe('distribute — exact largest remainder', () => {
  it.each([
    [50, [10, 40, 100], [4, 13, 33]], // PLAN §3.6 counterexample to the SPEC float tie-break
    [320, [40, 25, 67, 60], [67, 42, 111, 100]], // r6b E12
    [100, [25, 75, 100, 100], [9, 25, 33, 33]], // r8 G11
    [250, [100, 100, 100, 100, 100, 0, 0], [50, 50, 50, 50, 50, 0, 0]],
    [250, [100, 100, 100, 100, 0, 0, 0], [63, 63, 62, 62, 0, 0, 0]],
    [5, [0, 0], [0, 0]],
    [0, [1, 2, 3], [0, 0, 0]],
    [7, [], []],
    [1, [1, 1, 1], [1, 0, 0]],
  ] as const)('distribute(%i, %j) = %j', (t, w, expected) => {
    expect(distribute(t, w)).toEqual(expected)
  })

  it('rejects negative / non-integer totals and weights', () => {
    expect(() => distribute(-1, [1])).toThrow(RangeError)
    expect(() => distribute(1.5, [1])).toThrow(RangeError)
    expect(() => distribute(10, [1, -1])).toThrow(RangeError)
    expect(() => distribute(10, [0.5, 1])).toThrow(RangeError)
    expect(() => distribute(Number.MAX_SAFE_INTEGER, [2, 1])).toThrow(RangeError) // t·w overflow
  })

  const arbWeights = fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 })
  const arbTotal = fc.integer({ min: 0, max: 100_000 })

  it('property: Σ = t whenever Σw > 0 (SPEC §5.3 invariant)', () => {
    fc.assert(
      fc.property(arbTotal, arbWeights, (t, w) => {
        const r = distribute(t, w)
        expect(r).toHaveLength(w.length)
        expect(r.every((x) => Number.isSafeInteger(x) && x >= 0)).toBe(true)
        expect(sum(r)).toBe(sum(w) > 0 ? t : 0)
      }),
      { numRuns: 2000 },
    )
  })

  it('property: each value is within 1 of t·w/Σw (floor or floor + 1)', () => {
    fc.assert(
      fc.property(arbTotal, arbWeights, (t, w) => {
        const sw = sum(w)
        fc.pre(sw > 0)
        distribute(t, w).forEach((x, i) => {
          const exactNum = t * w[i]! // compare x·Σw with t·w (integers, no float)
          expect(x * sw).toBeGreaterThan(exactNum - sw)
          expect(x * sw).toBeLessThan(exactNum + sw)
        })
      }),
      { numRuns: 2000 },
    )
  })

  it('property: equal weights → the earlier index gets ≥ the later', () => {
    fc.assert(
      fc.property(arbTotal, arbWeights, (t, w) => {
        const r = distribute(t, w)
        for (let i = 0; i < w.length; i++)
          for (let j = i + 1; j < w.length; j++) if (w[i] === w[j]) expect(r[i]!).toBeGreaterThanOrEqual(r[j]!)
      }),
      { numRuns: 1000 },
    )
  })
})

// ---------------------------------------------------------------------------------------------------------------
// spreadWeek (BR-21, BR-21a)
// ---------------------------------------------------------------------------------------------------------------

describe('spreadWeek (BR-21, BR-21a)', () => {
  it.each([
    [250, MON_FRI, MON_FRI, [50, 50, 50, 50, 50, 0, 0], null], // AC-804
    [250, [100, 100, 100, 100, 0, 0, 0], MON_FRI, [63, 63, 62, 62, 0, 0, 0], null], // F2 Peter/Ivy
    [500, [100, 100, 100, 100, 0, 0, 0], MON_FRI, [125, 125, 125, 125, 0, 0, 0], null], // F2 Jack/Mint
    [375, [100, 100, 100, 100, 0, 0, 0], MON_FRI, [94, 94, 94, 93, 0, 0, 0], null], // F2 Cindy
    [500, [0, 0, 100, 100, 100, 0, 0], MON_FRI, [0, 0, 167, 167, 166, 0, 0], null], // F3 Peter
    [250, [0, 0, 0, 100, 100, 0, 0], MON_FRI, [0, 0, 0, 125, 125, 0, 0], null], // F4 Cindy
    [250, ZERO7, MON_FRI, [50, 50, 50, 50, 50, 0, 0], 'SCHEDULE'],
    [250, ZERO7, ZERO7, [50, 50, 50, 50, 50, 0, 0], 'WEEKDAYS'],
    [250, ZERO7, [100, 0, 100, 0, 100, 0, 0], [84, 0, 83, 0, 83, 0, 0], 'SCHEDULE'],
    [0, MON_FRI, MON_FRI, ZERO7, null],
    [0, ZERO7, ZERO7, ZERO7, null],
    [700, MON_FRI, MON_FRI, [140, 140, 140, 140, 140, 0, 0], null], // never clamps (display values)
  ] as const)('spreadWeek(%i, caps %j, schedule %j) = %j (%s)', (weekCd, caps, schedule, days, fallback) => {
    expect(spreadWeek(weekCd, ctxOf(caps, schedule))).toEqual({ days, fallback })
  })

  it('rejects a context that is not 7 days long', () => {
    expect(() => spreadWeek(100, ctxOf([100, 100]))).toThrow(RangeError)
  })

  it('property: Σ days = weekCd (displayed day sum = week total, SPEC §5.3)', () => {
    const arbDay = fc.constantFrom(0, 25, 50, 75, 100)
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 700 }),
        fc.array(arbDay, { minLength: 7, maxLength: 7 }),
        fc.array(arbDay, { minLength: 7, maxLength: 7 }),
        (weekCd, a, b) => {
          const schedule = a.map((x, i) => Math.max(x, b[i]!))
          const caps = a.map((x, i) => Math.min(x, b[i]!))
          expect(sum(spreadWeek(weekCd, ctxOf(caps, schedule)).days)).toBe(weekCd)
        },
      ),
    )
  })
})

// ---------------------------------------------------------------------------------------------------------------
// clampAndSpill (X65 tiers)
// ---------------------------------------------------------------------------------------------------------------

describe('clampAndSpill (X65)', () => {
  it('[160,160,80,0…] caps Mon–Fri → [100,100,100,100,0,0,0], spilled', () => {
    expect(clampAndSpill([160, 160, 80, 0, 0, 0, 0], new Set(), NORMAL)).toEqual({
      ok: true,
      days: [100, 100, 100, 100, 0, 0, 0],
      spilled: true,
      warnings: [],
    })
  })

  it('F2 Jack: [100,125,125,125,0,0,0] Mon fixed, Fri cap 0 (tier 2) → Fri 75', () => {
    expect(
      clampAndSpill([100, 125, 125, 125, 0, 0, 0], new Set([0]), ctxOf([100, 100, 100, 100, 0, 0, 0])),
    ).toEqual({ ok: true, days: [100, 100, 100, 100, 75, 0, 0], spilled: true, warnings: [] })
  })

  it('[700,0,…] caps Mon–Fri → 100 × 7 (Sat, Sun tier 3)', () => {
    expect(clampAndSpill([700, 0, 0, 0, 0, 0, 0], new Set(), NORMAL)).toEqual({
      ok: true,
      days: [100, 100, 100, 100, 100, 100, 100],
      spilled: true,
      warnings: [],
    })
  })

  it('[700,0,…] with Tue fixed → UNREPRESENTABLE', () => {
    expect(clampAndSpill([700, 0, 0, 0, 0, 0, 0], new Set([1]), NORMAL)).toEqual({
      ok: false,
      reason: 'UNREPRESENTABLE',
    })
  })

  it('already ≤ 100 → unchanged, spilled false', () => {
    expect(clampAndSpill([50, 100, 0, 25, 75, 0, 0], new Set(), NORMAL)).toEqual({
      ok: true,
      days: [50, 100, 0, 25, 75, 0, 0],
      spilled: false,
      warnings: [],
    })
  })

  it('M7 F3: derived [0,0,167,167,166] with Wed fixed 50 → tier 2 Mon 100 then Tue 33', () => {
    expect(
      clampAndSpill([0, 0, 50, 167, 166, 0, 0], new Set([2]), ctxOf([0, 0, 100, 100, 100, 0, 0])),
    ).toEqual({ ok: true, days: [100, 33, 50, 100, 100, 0, 0], spilled: true, warnings: [] })
  })

  it('a custom hard cap (700 per WEEK value)', () => {
    expect(clampAndSpill([800, 0, 0, 0, 0, 0, 0], new Set(), NORMAL, 700)).toEqual({
      ok: true,
      days: [700, 100, 0, 0, 0, 0, 0],
      spilled: true,
      warnings: [],
    })
  })

  it('rejects a value array whose length differs from the context', () => {
    expect(() => clampAndSpill([1, 2, 3], new Set(), NORMAL)).toThrow(RangeError)
  })

  it('property: ok → Σ preserved, values in [0, hardCap], fixed unchanged; spilled iff something changed', () => {
    const arbDay = fc.constantFrom(0, 25, 50, 75, 100)
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 7, maxLength: 7 }),
        fc.array(arbDay, { minLength: 7, maxLength: 7 }),
        fc.array(arbDay, { minLength: 7, maxLength: 7 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { maxLength: 4 }),
        (raw, a, b, fixedIdx) => {
          const fixed = new Set(fixedIdx)
          const values = raw.map((v, i) => (fixed.has(i) ? Math.min(v, 100) : v))
          const ctx = ctxOf(
            a.map((x, i) => Math.min(x, b[i]!)),
            a.map((x, i) => Math.max(x, b[i]!)),
          )
          const r = clampAndSpill(values, fixed, ctx)
          // every non-fixed day can take up to 100 (tier 3 = the rest), so ok ⇔ the free days can hold their sum
          const room = 100 * (7 - fixed.size)
          const needed = values.reduce((acc, v, i) => (fixed.has(i) ? acc : acc + v), 0)
          expect(r.ok).toBe(needed <= room)
          if (!r.ok) return
          expect(sum(r.days)).toBe(sum(values))
          expect(r.days.every((v) => v >= 0 && v <= 100)).toBe(true)
          for (const i of fixed) expect(r.days[i]).toBe(values[i])
          expect(r.spilled).toBe(r.days.some((v, i) => v !== values[i]))
        },
      ),
      { numRuns: 2000 },
    )
  })
})

// ---------------------------------------------------------------------------------------------------------------
// planWeek — M6 subset (M6-D4, M6-D34)
// ---------------------------------------------------------------------------------------------------------------

describe('planWeek (M6 rows, M7 rules)', () => {
  const DAYW = D(50, 50, 100, 50, 50, 0, 0) // Σ 300

  it.each<[string, WeekPlan, WeekChange[], 'SCALE' | 'COLLAPSE' | undefined, ReturnType<typeof planWeek>]>([
    ['null + WEEK 250', NULL_PLAN, [wk(250)], undefined, { kind: 'ok', next: W(250), changed: true, warnings: [] }],
    ['WEEK 250 + WEEK null', W(250), [wk(null)], undefined, { kind: 'ok', next: NULL_PLAN, changed: true, warnings: [] }],
    ['WEEK 250 + WEEK 0', W(250), [wk(0)], undefined, { kind: 'ok', next: NULL_PLAN, changed: true, warnings: [] }],
    ['WEEK 250 + WEEK 250', W(250), [wk(250)], undefined, { kind: 'ok', next: W(250), changed: false, warnings: [] }],
    ['WEEK 250 + WEEK 725', W(250), [wk(725)], undefined, { kind: 'invalid', reason: 'MAX' }],
    ['DAY + WEEK 400', DAYW, [wk(400)], undefined, { kind: 'needsChoice' }],
    ['DAY + WEEK 400 SCALE (M7 BR-24)', DAYW, [wk(400)], 'SCALE', { kind: 'ok', next: D(100, 67, 100, 67, 66, 0, 0), changed: true, warnings: [spilled] }],
    ['DAY + WEEK 400 COLLAPSE', DAYW, [wk(400)], 'COLLAPSE', { kind: 'ok', next: W(400), changed: true, warnings: [] }],
    ['DAY + WEEK 300 (= Σ)', DAYW, [wk(300)], undefined, { kind: 'ok', next: DAYW, changed: false, warnings: [] }],
    ['DAY + WEEK 300 COLLAPSE (BR-23)', DAYW, [wk(300)], 'COLLAPSE', { kind: 'ok', next: W(300), changed: true, warnings: [] }],
    ['DAY + WEEK null', DAYW, [wk(null)], undefined, { kind: 'ok', next: NULL_PLAN, changed: true, warnings: [] }],
    [
      'WEEK 250 + DAY Mon..Sun = 100,100,50,null×4 (undo replay)',
      W(250),
      [dy(0, 100), dy(1, 100), dy(2, 50), dy(3, null), dy(4, null), dy(5, null), dy(6, null)],
      undefined,
      { kind: 'ok', next: D(100, 100, 50, 0, 0, 0, 0), changed: true, warnings: [] },
    ],
    ['WEEK 250 + DAY Wed 100 (M7 BR-22)', W(250), [dy(2, 100)], undefined, { kind: 'ok', next: D(50, 50, 100, 50, 50, 0, 0), changed: true, warnings: [] }],
    ['null + DAY Mon 50', NULL_PLAN, [dy(0, 50)], undefined, { kind: 'ok', next: D(50, 0, 0, 0, 0, 0, 0), changed: true, warnings: [] }],
    ['DAY [50,0…] + DAY Mon null', D(50, 0, 0, 0, 0, 0, 0), [dy(0, null)], undefined, { kind: 'ok', next: NULL_PLAN, changed: true, warnings: [] }],
    ['DAY + DAY Mon 125', DAYW, [dy(0, 125)], undefined, { kind: 'invalid', reason: 'MAX', dayIndex: 0 }],
    ['DAY + DAY Tue -25', DAYW, [dy(1, -25)], undefined, { kind: 'invalid', reason: 'NEGATIVE', dayIndex: 1 }],
    ['WEEK + WEEK -25', W(250), [wk(-25)], undefined, { kind: 'invalid', reason: 'NEGATIVE' }],
    ['WEEK 250 + WEEK 300 + DAY Mon 50', W(250), [wk(300), dy(0, 50)], undefined, { kind: 'invalid', reason: 'MIXED_WEEK_AND_DAY' }],
    ['empty changes', DAYW, [], undefined, { kind: 'ok', next: DAYW, changed: false, warnings: [] }],
    ['WEEK last wins', W(100), [wk(200), wk(300)], undefined, { kind: 'ok', next: W(300), changed: true, warnings: [] }],
    ['DAY last wins', DAYW, [dy(0, 100), dy(0, 25)], undefined, { kind: 'ok', next: D(25, 50, 100, 50, 50, 0, 0), changed: true, warnings: [] }],
    ['DAY same values → unchanged', DAYW, [dy(2, 100)], undefined, { kind: 'ok', next: DAYW, changed: false, warnings: [] }],
    ['null + WEEK null (no-op)', NULL_PLAN, [wk(null)], undefined, { kind: 'ok', next: NULL_PLAN, changed: false, warnings: [] }],
  ])('%s', (_name, current, changes, choice, expected) => {
    expect(planWeek(current, changes, NORMAL, choice)).toEqual(expected)
  })

  it('null, caps 0×7 + WEEK 250 → ok WEEK 250 + WEEK_NO_CAPACITY', () => {
    expect(planWeek(NULL_PLAN, [wk(250)], ctxOf(ZERO7))).toEqual({
      kind: 'ok',
      next: W(250),
      changed: true,
      warnings: [{ code: 'WEEK_NO_CAPACITY' }],
    })
  })

  it('COLLAPSE into a cap-0 week also warns WEEK_NO_CAPACITY', () => {
    expect(planWeek(DAYW, [wk(300)], ctxOf(ZERO7), 'COLLAPSE')).toEqual({
      kind: 'ok',
      next: W(300),
      changed: true,
      warnings: [{ code: 'WEEK_NO_CAPACITY' }],
    })
  })

  it('a degenerate current plan (WEEK 0 / DAY all zeros) is treated as no plan', () => {
    expect(planWeek(W(0), [wk(null)], NORMAL)).toEqual({ kind: 'ok', next: NULL_PLAN, changed: false, warnings: [] })
    expect(planWeek(D(...ZERO7), [], NORMAL)).toEqual({ kind: 'ok', next: NULL_PLAN, changed: false, warnings: [] })
    expect(planWeek(D(...ZERO7), [wk(100)], NORMAL)).toEqual({ kind: 'ok', next: W(100), changed: true, warnings: [] })
  })

  it('rejects malformed changes (programmer errors)', () => {
    expect(() => planWeek(NULL_PLAN, [dy(7, 50)], NORMAL)).toThrow(RangeError)
    expect(() => planWeek(NULL_PLAN, [wk(12.5)], NORMAL)).toThrow(RangeError)
  })

  describe('weekPlanTotal', () => {
    it.each<[WeekPlan, number]>([
      [NULL_PLAN, 0],
      [W(375), 375],
      [DAYW, 300],
    ])('weekPlanTotal(%j) = %i', (p, t) => {
      expect(weekPlanTotal(p)).toBe(t)
    })
  })

  // Snapshot round trip: whenever M6 answers ok, it equals M7's full rules (DAY ×7, WEEK on null/WEEK, COLLAPSE).
  const arbDays: fc.Arbitrary<number[]> = fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 7, maxLength: 7 })
  const arbPlan: fc.Arbitrary<WeekPlan> = fc.oneof(
    fc.constant(NULL_PLAN),
    fc.integer({ min: 1, max: 700 }).map(W),
    arbDays.filter((d) => sum(d) > 0).map((d) => D(...d)),
  )

  it('property: planWeek(p, sevenDayChanges(s)) → s (or null)', () => {
    fc.assert(
      fc.property(arbPlan, arbDays, (p, s) => {
        const r = planWeek(p, sevenDayChanges(s), NORMAL)
        expect(r.kind).toBe('ok')
        if (r.kind !== 'ok') return
        expect(r.next).toEqual(sum(s) === 0 ? NULL_PLAN : D(...s))
        expect(r.changed).toBe(JSON.stringify(r.next) !== JSON.stringify(p))
      }),
    )
  })

  it("property: planWeek(p, [WEEK s], ctx, 'COLLAPSE') → WEEK s", () => {
    fc.assert(
      fc.property(arbPlan, fc.integer({ min: 1, max: 700 }), (p, s) => {
        expect(planWeek(p, [wk(s)], NORMAL, 'COLLAPSE')).toMatchObject({ kind: 'ok', next: W(s) })
      }),
    )
  })

  it('property: needsChoice only for a WEEK ≠ Σ change on a DAY week; every ok day ≤ 100', () => {
    const arbChange: fc.Arbitrary<WeekChange> = fc.oneof(
      fc.option(fc.integer({ min: 0, max: 700 })).map(wk),
      fc.tuple(fc.integer({ min: 0, max: 6 }), fc.option(fc.integer({ min: 0, max: 100 }))).map(([i, cd]) => dy(i, cd)),
    )
    fc.assert(
      fc.property(arbPlan, fc.array(arbChange, { maxLength: 8 }), fc.constantFrom(undefined, 'SCALE' as const), (p, cs, choice) => {
        const r = planWeek(p, cs, NORMAL, choice)
        if (r.kind === 'needsChoice') {
          expect(p.resolution).toBe('DAY')
          expect(cs.every((c) => c.granularity === 'WEEK')).toBe(true)
        }
        if (r.kind === 'ok' && r.next.resolution === 'DAY') {
          expect(r.next.days.every((d) => d >= 0 && d <= 100)).toBe(true)
          expect(sum(r.next.days)).toBeGreaterThan(0)
        }
        if (r.kind === 'ok' && r.next.resolution === 'WEEK') expect(r.next.weekCd).toBeGreaterThan(0)
      }),
      { numRuns: 2000 },
    )
  })
})

// ---------------------------------------------------------------------------------------------------------------
// planRange — BR-25 (M6-D6)
// ---------------------------------------------------------------------------------------------------------------

describe('isWholeWeek', () => {
  it.each([
    ['2026-11-16', MON_FRI, '2026-11-16', '2026-11-20', true],
    ['2026-11-16', MON_FRI, '2026-11-14', '2026-11-22', true],
    ['2026-11-16', MON_FRI, '2026-11-17', '2026-11-20', false],
    ['2026-11-16', MON_FRI, '2026-11-16', '2026-11-19', false],
    ['2026-11-16', ZERO7, '2026-11-16', '2026-11-20', false], // no scheduled day → all 7 needed
    ['2026-11-16', ZERO7, '2026-11-16', '2026-11-22', true],
    ['2026-11-16', [100, 0, 100, 0, 100, 0, 0], '2026-11-16', '2026-11-20', true], // part-timer Mon/Wed/Fri
    ['2026-11-16', [100, 0, 100, 0, 100, 0, 0], '2026-11-17', '2026-11-20', false],
  ] as const)('isWholeWeek(%s, %j, %s..%s) = %s', (week, schedule, start, end, expected) => {
    expect(isWholeWeek(week, schedule, start, end)).toBe(expected)
  })
})

describe('planRange (BR-25, M6-D6)', () => {
  it('r8 §6.8: Ivy 1000 cd over 2026-11-11..11-24 → DAY Wed–Fri · WEEK 500 · DAY Mon–Tue', () => {
    const r = planRange(1000, '2026-11-11', '2026-11-24', rangeWeeks('2026-11-09', 3))
    expect(r).toEqual({
      ok: true,
      fallback: null,
      capacityCd: 1000,
      overCapacityCd: 0,
      weeks: [
        { week: '2026-11-09', kind: 'BOUNDARY', next: D(0, 0, 100, 100, 100, 0, 0), inRangeCapCd: 300, changed: true, warnings: [] },
        { week: '2026-11-16', kind: 'WHOLE', next: W(500), inRangeCapCd: 500, changed: true, warnings: [] },
        { week: '2026-11-23', kind: 'BOUNDARY', next: D(100, 100, 0, 0, 0, 0, 0), inRangeCapCd: 200, changed: true, warnings: [] },
      ],
    })
  })

  it('500 over 11-11..11-24 → DAY 50 ×3 · WEEK 250 · DAY 50 ×2', () => {
    const r = planRange(500, '2026-11-11', '2026-11-24', rangeWeeks('2026-11-09', 3))
    expect(r.ok && r.weeks.map((w) => w.next)).toEqual([D(0, 0, 50, 50, 50, 0, 0), W(250), D(50, 50, 0, 0, 0, 0, 0)])
  })

  it('200 over 11-11..11-13 → DAY [0,0,67,67,66,0,0]', () => {
    const r = planRange(200, '2026-11-11', '2026-11-13', rangeWeeks('2026-11-09', 1))
    expect(r.ok && r.weeks[0]).toMatchObject({ kind: 'BOUNDARY', next: D(0, 0, 67, 67, 66, 0, 0), warnings: [] })
  })

  it('r8 G3: 400 over 11-11..11-13 → UNREPRESENTABLE week 2026-11-09', () => {
    expect(planRange(400, '2026-11-11', '2026-11-13', rangeWeeks('2026-11-09', 1))).toEqual({
      ok: false,
      reason: 'UNREPRESENTABLE',
      week: '2026-11-09',
    })
  })

  it('400 over 11-11..11-15 (Sat/Sun in range) → spill to Sat + SPILLED + NON_WORKING@5', () => {
    const r = planRange(400, '2026-11-11', '2026-11-15', rangeWeeks('2026-11-09', 1))
    expect(r).toMatchObject({ ok: true, capacityCd: 300, overCapacityCd: 100 })
    expect(r.ok && r.weeks[0]).toEqual({
      week: '2026-11-09',
      kind: 'BOUNDARY',
      next: D(0, 0, 100, 100, 100, 100, 0),
      inRangeCapCd: 300,
      changed: true,
      warnings: [spilled, nonWorking(5)],
    })
  })

  it('500 over 11-16..11-20, current WEEK 250 → WHOLE WEEK 500, changed', () => {
    const r = planRange(500, '2026-11-16', '2026-11-20', rangeWeeks('2026-11-16', 1, { '2026-11-16': { current: W(250) } }))
    expect(r.ok && r.weeks).toEqual([
      { week: '2026-11-16', kind: 'WHOLE', next: W(500), inRangeCapCd: 500, changed: true, warnings: [] },
    ])
  })

  it('same total as the current plan → changed false (not rewritten)', () => {
    const r = planRange(250, '2026-11-16', '2026-11-20', rangeWeeks('2026-11-16', 1, { '2026-11-16': { current: W(250) } }))
    expect(r.ok && r.weeks[0]!.changed).toBe(false)
  })

  it('N = 0 over 11-16..11-20, current WEEK 250 → WHOLE null (clears)', () => {
    const r = planRange(0, '2026-11-16', '2026-11-20', rangeWeeks('2026-11-16', 1, { '2026-11-16': { current: W(250) } }))
    expect(r.ok && r.weeks[0]).toMatchObject({ kind: 'WHOLE', next: NULL_PLAN, changed: true })
  })

  it('N = 0 on a boundary week: in-range days → 0, outside kept', () => {
    const r = planRange(0, '2026-11-11', '2026-11-13', rangeWeeks('2026-11-09', 1, { '2026-11-09': { current: W(500) } }))
    expect(r.ok && r.weeks[0]).toMatchObject({ kind: 'BOUNDARY', next: D(100, 100, 0, 0, 0, 0, 0), changed: true })
  })

  it('150 over 11-11..11-13, current WEEK 500 → Mon/Tue from the split kept', () => {
    const r = planRange(150, '2026-11-11', '2026-11-13', rangeWeeks('2026-11-09', 1, { '2026-11-09': { current: W(500) } }))
    expect(r.ok && r.weeks[0]!.next).toEqual(D(100, 100, 50, 50, 50, 0, 0))
  })

  it('200 over 11-10..11-13, current DAY [100,0,…] → [100,50,50,50,50,0,0]', () => {
    const r = planRange(200, '2026-11-10', '2026-11-13', rangeWeeks('2026-11-09', 1, { '2026-11-09': { current: D(100, 0, 0, 0, 0, 0, 0) } }))
    expect(r.ok && r.weeks[0]!.next).toEqual(D(100, 50, 50, 50, 50, 0, 0))
  })

  it('S2.5: Ivy UAT WEEK 250 in 09-28, 100 over 09-30..10-02 → DAY [50,50,34,33,33,0,0]', () => {
    const r = planRange(100, '2026-09-30', '2026-10-02', rangeWeeks('2026-09-28', 1, { '2026-09-28': { current: W(250) } }))
    expect(r.ok && r.weeks[0]!.next).toEqual(D(50, 50, 34, 33, 33, 0, 0))
  })

  describe('F3 Peter, 200 over 10-05..10-06 (both days on leave, caps 0)', () => {
    const F3 = [0, 0, 100, 100, 100, 0, 0]

    it('fallback SCHEDULE; in-range days 100/100 + NON_WORKING@0,1; out-of-range = current split', () => {
      const r = planRange(200, '2026-10-05', '2026-10-06', rangeWeeks('2026-10-05', 1, { '2026-10-05': { caps: F3, current: W(300) } }))
      expect(r).toEqual({
        ok: true,
        fallback: 'SCHEDULE',
        capacityCd: 0,
        overCapacityCd: 200,
        weeks: [
          {
            week: '2026-10-05',
            kind: 'BOUNDARY',
            next: D(100, 100, 100, 100, 100, 0, 0),
            inRangeCapCd: 0,
            changed: true,
            warnings: [nonWorking(0), nonWorking(1)],
          },
        ],
      })
    })

    it("golden WEEK 500: the out-of-range split (167/167/166) is clamp-and-spilled among out-of-range days only", () => {
      const r = planRange(200, '2026-10-05', '2026-10-06', rangeWeeks('2026-10-05', 1, { '2026-10-05': { caps: F3, current: W(500) } }))
      expect(r.ok && r.weeks[0]).toMatchObject({
        next: D(100, 100, 100, 100, 100, 100, 100),
        warnings: [spilled, nonWorking(0), nonWorking(1), nonWorking(5), nonWorking(6)],
      })
    })
  })

  it('fallback WEEKDAYS: nobody scheduled → Mon–Fri of the range equal', () => {
    const r = planRange(300, '2026-11-16', '2026-11-22', rangeWeeks('2026-11-16', 1, { '2026-11-16': { caps: ZERO7, schedule: ZERO7 } }))
    expect(r).toMatchObject({ ok: true, fallback: 'WEEKDAYS', capacityCd: 0, overCapacityCd: 300 })
    expect(r.ok && r.weeks[0]).toMatchObject({ kind: 'WHOLE', next: W(300), warnings: [{ code: 'WEEK_NO_CAPACITY' }] })
  })

  it('fallback ALL_DAYS: a weekend-only range with no capacity → both days equal', () => {
    const r = planRange(150, '2026-11-14', '2026-11-15', rangeWeeks('2026-11-09', 1))
    expect(r).toMatchObject({ ok: true, fallback: 'ALL_DAYS' })
    expect(r.ok && r.weeks[0]).toMatchObject({
      kind: 'BOUNDARY',
      next: D(0, 0, 0, 0, 0, 75, 75),
      warnings: [nonWorking(5), nonWorking(6)],
    })
  })

  it('a holiday Friday inside an otherwise covered week → still WHOLE (holidays ignored)', () => {
    const r = planRange(400, '2026-11-16', '2026-11-20', rangeWeeks('2026-11-16', 1, { '2026-11-16': { caps: [100, 100, 100, 100, 0, 0, 0] } }))
    expect(r.ok && r.weeks[0]).toMatchObject({ kind: 'WHOLE', next: W(400), inRangeCapCd: 400 })
  })

  it('37 100 over 1 week → UNREPRESENTABLE', () => {
    expect(planRange(37_100, '2026-11-16', '2026-11-22', rangeWeeks('2026-11-16', 1))).toEqual({
      ok: false,
      reason: 'UNREPRESENTABLE',
      week: '2026-11-16',
    })
  })

  it('a WHOLE week whose DAY plan has work on an out-of-range day is planned as BOUNDARY (that day is kept)', () => {
    const r = planRange(500, '2026-11-16', '2026-11-20', rangeWeeks('2026-11-16', 1, { '2026-11-16': { current: D(0, 0, 0, 0, 0, 50, 0) } }))
    expect(r.ok && r.weeks[0]).toMatchObject({ kind: 'BOUNDARY', next: D(100, 100, 100, 100, 100, 50, 0) })
  })

  it('a single-day range', () => {
    const r = planRange(75, '2026-11-18', '2026-11-18', rangeWeeks('2026-11-16', 1))
    expect(r.ok && r.weeks[0]).toMatchObject({ kind: 'BOUNDARY', next: D(0, 0, 75, 0, 0, 0, 0), inRangeCapCd: 100 })
  })

  it('rejects inconsistent input (RangeError)', () => {
    expect(() => planRange(100, '2026-11-20', '2026-11-16', rangeWeeks('2026-11-16', 1))).toThrow(RangeError)
    expect(() => planRange(100, '2026-11-16', '2026-11-24', rangeWeeks('2026-11-16', 1))).toThrow(RangeError)
    expect(() => planRange(100, '2026-11-16', '2026-11-20', rangeWeeks('2026-11-09', 2))).toThrow(RangeError)
    expect(() => planRange(-1, '2026-11-16', '2026-11-20', rangeWeeks('2026-11-16', 1))).toThrow(RangeError)
  })

  // Properties ------------------------------------------------------------------------------------------------
  const arbDay = fc.constantFrom(0, 25, 50, 75, 100)
  const arbCtxPair = fc
    .tuple(fc.array(arbDay, { minLength: 7, maxLength: 7 }), fc.array(arbDay, { minLength: 7, maxLength: 7 }))
    .map(([a, b]) => ({ caps: a.map((x, i) => Math.min(x, b[i]!)), schedule: a.map((x, i) => Math.max(x, b[i]!)) }))
  const arbCurrent: fc.Arbitrary<WeekPlan> = fc.oneof(
    fc.constant(NULL_PLAN),
    fc.integer({ min: 1, max: 700 }).map(W),
    fc
      .array(fc.integer({ min: 0, max: 100 }), { minLength: 7, maxLength: 7 })
      .filter((d) => sum(d) > 0)
      .map((d) => D(...d)),
  )
  const arbScenario = fc
    .record({
      startOffset: fc.integer({ min: 0, max: 6 }),
      length: fc.integer({ min: 1, max: 25 }),
      totalCd: fc.integer({ min: 0, max: 3000 }),
      weeks: fc.array(fc.record({ ctx: arbCtxPair, current: arbCurrent }), { minLength: 5, maxLength: 5 }),
    })
    .map(({ startOffset, length, totalCd, weeks }) => {
      const first = '2026-11-16'
      const start = addDays(first, startOffset)
      const end = addDays(start, length - 1)
      const n = Math.floor((startOffset + length - 1) / 7) + 1
      const rw: RangeWeek[] = weeks.slice(0, n).map((w, i) => {
        const week = addWeeks(first, i)
        return { week, ctx: ctxOf(w.ctx.caps, w.ctx.schedule, week), current: w.current }
      })
      return { start, end, totalCd, rw }
    })

  /** Σ of the current plan's days outside [start, end] (WEEK → its BR-21 split). */
  function outsideSum(w: RangeWeek, start: string, end: string): number {
    const base = w.current.resolution === null ? ZERO7 : w.current.resolution === 'DAY' ? w.current.days : spreadWeek(w.current.weekCd, w.ctx).days
    return daysOfWeek(w.week).reduce((s, d, i) => (d < start || d > end ? s + base[i]! : s), 0)
  }

  it('property: Σ next = totalCd + Σ out-of-range parts; DAY ≤ 100; WEEK ≤ 700; DAY weeks keep out-of-range days', () => {
    fc.assert(
      fc.property(arbScenario, ({ start, end, totalCd, rw }) => {
        const r = planRange(totalCd, start, end, rw)
        if (!r.ok) return
        expect(r.weeks.map((w) => w.week)).toEqual(rw.map((w) => w.week))
        const nextSum = sum(r.weeks.map((w) => weekPlanTotal(w.next)))
        expect(nextSum).toBe(totalCd + sum(rw.map((w) => outsideSum(w, start, end))))
        r.weeks.forEach((w, i) => {
          if (w.next.resolution === 'DAY') expect(w.next.days.every((d) => d >= 0 && d <= 100)).toBe(true)
          if (w.next.resolution === 'WEEK') expect(w.next.weekCd).toBeLessThanOrEqual(700)
          const cur = rw[i]!.current
          if (w.kind === 'BOUNDARY' && cur.resolution === 'DAY') {
            const nextDays = w.next.resolution === 'DAY' ? w.next.days : ZERO7
            daysOfWeek(w.week).forEach((d, j) => {
              if (d < start || d > end) expect(nextDays[j]).toBe(cur.days[j])
            })
          }
          expect(w.changed).toBe(JSON.stringify(w.next) !== JSON.stringify(cur))
        })
        expect(r.overCapacityCd).toBe(Math.max(0, totalCd - r.capacityCd))
      }),
      { numRuns: 1500 },
    )
  })
})
