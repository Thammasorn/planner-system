// src/domain/allocation.ts — week ↔ day allocation rules (SPEC §5.3 BR-20…BR-27, X27, X65, M6-D4/D6). Pure.
// Integer centi-days only (BR-01); ratios go through the exact largest-remainder `distribute`.
// Names marked ★ are reused by M7 (plan/m07-daily-resolution.md §5.S1) — keep signatures and semantics.
import { addDays, compareISO, daysOfWeek, weekRange, weekStart } from './dates'
import type { Cd, ISODate } from './types'

// ---------------------------------------------------------------------------------------------------------------
// Types ★
// ---------------------------------------------------------------------------------------------------------------

/** Index 0 = Monday … 6 = Sunday, length 7. */
export type Days7 = readonly Cd[]
/** Per-day context of one person's week: capacity after holidays/leave (BR-10), schedule (BR-21a), leave flags. */
export interface DayCtx {
  week: ISODate
  dayCaps: Days7
  schedule: Days7
  timeOff: readonly boolean[]
}
export type DayWarningCode =
  | 'WORK_ON_NON_WORKING_DAY'
  | 'SPILLED_OVER_DAY_LIMIT'
  | 'WEEK_NO_CAPACITY'
  | 'ALLOCATED_ON_TIME_OFF'
export interface DayWarning {
  code: DayWarningCode
  dayIndex?: number
}
export type StepResult =
  | { ok: true; days: Cd[]; spilled: boolean; warnings: DayWarning[] }
  | { ok: false; reason: 'UNREPRESENTABLE' }
/** BR-24 dialog choice (SCALE is M7; M6 treats it like no choice). */
export type OnDayWeekChoice = 'SCALE' | 'COLLAPSE'
/** One (assignment, week): no plan, one WEEK row, or DAY rows (Σ > 0). */
export type WeekPlan = { resolution: null } | { resolution: 'WEEK'; weekCd: Cd } | { resolution: 'DAY'; days: Days7 }
export type WeekChange = { granularity: 'WEEK'; cd: Cd | null } | { granularity: 'DAY'; dayIndex: number; cd: Cd | null }
export type PlanWeekResult =
  | { kind: 'ok'; next: WeekPlan; changed: boolean; warnings: DayWarning[] }
  | { kind: 'needsChoice' } // BR-24: the service answers NEEDS_CHOICE (M7-D3)
  | { kind: 'invalid'; reason: 'MAX' | 'NEGATIVE' | 'MIXED_WEEK_AND_DAY' | 'UNREPRESENTABLE'; dayIndex?: number }

/** BR-26 maxima. */
const WEEK_MAX_CD = 700
const DAY_MAX_CD = 100
const DAYS_PER_WEEK = 7
const NULL_PLAN: WeekPlan = Object.freeze({ resolution: null })

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

function sum(xs: readonly number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}

function zeros(): Cd[] {
  return [0, 0, 0, 0, 0, 0, 0]
}

function assertNonNegativeInt(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} must be a non-negative integer, got ${n}`)
}

function assertDays7(xs: readonly unknown[], what: string): void {
  if (xs.length !== DAYS_PER_WEEK) throw new RangeError(`${what} must hold 7 days, got ${xs.length}`)
}

function assertCtx(ctx: DayCtx): void {
  assertDays7(ctx.dayCaps, 'dayCaps')
  assertDays7(ctx.schedule, 'schedule')
}

/** DAY with Σ 0 → null; WEEK 0 → null. */
function normalize(p: WeekPlan): WeekPlan {
  if (p.resolution === 'WEEK') return p.weekCd === 0 ? NULL_PLAN : p
  if (p.resolution === 'DAY') return sum(p.days) === 0 ? NULL_PLAN : p
  return NULL_PLAN
}

function dayPlan(days: Cd[]): WeekPlan {
  return sum(days) === 0 ? NULL_PLAN : { resolution: 'DAY', days }
}

function weekPlan(weekCd: Cd): WeekPlan {
  return weekCd === 0 ? NULL_PLAN : { resolution: 'WEEK', weekCd }
}

function samePlan(a: WeekPlan, b: WeekPlan): boolean {
  if (a.resolution === 'WEEK' && b.resolution === 'WEEK') return a.weekCd === b.weekCd
  if (a.resolution === 'DAY' && b.resolution === 'DAY') return a.days.every((d, i) => d === b.days[i])
  return a.resolution === b.resolution
}

function weekNoCapacity(weekCd: Cd, ctx: DayCtx): DayWarning[] {
  return weekCd > 0 && sum(ctx.dayCaps) === 0 ? [{ code: 'WEEK_NO_CAPACITY' }] : []
}

/** The days a plan stands for: DAY as is, WEEK by the BR-21 split, null → zeros. */
function planDays(p: WeekPlan, ctx: DayCtx): Cd[] {
  if (p.resolution === 'DAY') return [...p.days]
  if (p.resolution === 'WEEK') return spreadWeek(p.weekCd, ctx).days
  return zeros()
}

// ---------------------------------------------------------------------------------------------------------------
// ★ Primitives (BR-21, BR-21a, X65)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Exact largest remainder (PLAN §3.6, r6b M6-03): q = ⌊t·w / Σw⌋, r = (t·w) mod Σw; the leftover units go by
 * r descending, then index ascending. Σw = 0 → zeros. Never uses float division.
 */
export function distribute(totalCd: Cd, weights: readonly number[]): Cd[] {
  assertNonNegativeInt(totalCd, 'totalCd')
  for (const w of weights) assertNonNegativeInt(w, 'weight')
  const sw = sum(weights)
  if (sw === 0) return weights.map(() => 0)
  const q: Cd[] = []
  const r: number[] = []
  for (const w of weights) {
    const p = totalCd * w
    if (!Number.isSafeInteger(p)) throw new RangeError(`totalCd × weight overflows: ${totalCd} × ${w}`)
    const rem = p % sw
    q.push((p - rem) / sw)
    r.push(rem)
  }
  const order = weights.map((_, i) => i).sort((a, b) => r[b]! - r[a]! || a - b)
  let left = totalCd - sum(q)
  for (const i of order) {
    if (left === 0) break
    q[i]! += 1
    left -= 1
  }
  return q
}

/** BR-21 + BR-21a fallback chain (M7-D9): dayCaps → schedule ('SCHEDULE') → Mon–Fri equal ('WEEKDAYS'). Never clamps. */
export function spreadWeek(weekCd: Cd, ctx: DayCtx): { days: Cd[]; fallback: null | 'SCHEDULE' | 'WEEKDAYS' } {
  assertCtx(ctx)
  assertNonNegativeInt(weekCd, 'weekCd')
  if (weekCd === 0) return { days: zeros(), fallback: null }
  if (sum(ctx.dayCaps) > 0) return { days: distribute(weekCd, ctx.dayCaps), fallback: null }
  if (sum(ctx.schedule) > 0) return { days: distribute(weekCd, ctx.schedule), fallback: 'SCHEDULE' }
  return { days: distribute(weekCd, [1, 1, 1, 1, 1, 0, 0]), fallback: 'WEEKDAYS' }
}

/**
 * X65 tiers: (1) dayCaps[i] > 0 with room, (2) schedule[i] > 0 && dayCaps[i] = 0, (3) the rest; earliest index
 * first in a tier; `fixed` indexes never change (assumed ≤ hardCap); excess left → { ok: false }.
 * spilled = any value changed. Warnings are added by callers.
 */
export function clampAndSpill(
  values: readonly Cd[],
  fixed: ReadonlySet<number>,
  ctx: DayCtx,
  hardCap: Cd = DAY_MAX_CD,
): StepResult {
  assertCtx(ctx)
  assertDays7(values, 'values')
  const out = [...values]
  let excess = 0
  for (let i = 0; i < DAYS_PER_WEEK; i++) {
    if (!fixed.has(i) && out[i]! > hardCap) {
      excess += out[i]! - hardCap
      out[i] = hardCap
    }
  }
  const tiers: ((i: number) => boolean)[] = [
    (i) => ctx.dayCaps[i]! > 0,
    (i) => ctx.dayCaps[i] === 0 && ctx.schedule[i]! > 0,
    (i) => ctx.dayCaps[i] === 0 && ctx.schedule[i] === 0,
  ]
  for (const inTier of tiers) {
    for (let i = 0; i < DAYS_PER_WEEK && excess > 0; i++) {
      if (fixed.has(i) || !inTier(i)) continue
      const add = Math.min(hardCap - out[i]!, excess)
      if (add > 0) {
        out[i]! += add
        excess -= add
      }
    }
  }
  if (excess > 0) return { ok: false, reason: 'UNREPRESENTABLE' }
  return { ok: true, days: out, spilled: out.some((v, i) => v !== values[i]), warnings: [] }
}

// ---------------------------------------------------------------------------------------------------------------
// M7 day-level steps (BR-22, BR-23, BR-24 SCALE, M7-D7/D8)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Warnings of a stored DAY week (S1.4): SPILLED_OVER_DAY_LIMIT once when `spilled`, then WORK_ON_NON_WORKING_DAY
 * for every day with work and dayCaps 0, then ALLOCATED_ON_TIME_OFF for every day with work on leave (M7-D15).
 */
export function dayWarnings(days: readonly Cd[], ctx: DayCtx, spilled: boolean): DayWarning[] {
  assertCtx(ctx)
  assertDays7(days, 'days')
  const out: DayWarning[] = spilled ? [{ code: 'SPILLED_OVER_DAY_LIMIT' }] : []
  days.forEach((v, i) => {
    if (v > 0 && ctx.dayCaps[i] === 0) out.push({ code: 'WORK_ON_NON_WORKING_DAY', dayIndex: i })
  })
  days.forEach((v, i) => {
    if (v > 0 && ctx.timeOff[i] === true) out.push({ code: 'ALLOCATED_ON_TIME_OFF', dayIndex: i })
  })
  return out
}

function withWarnings(r: StepResult, ctx: DayCtx): StepResult {
  return r.ok ? { ...r, warnings: dayWarnings(r.days, ctx, r.spilled) } : r
}

/**
 * BR-22 (M7-D8): the BR-21 split of `weekCd`, with the edited days fixed to their values (always materialises,
 * even when a value equals the derived one); the rest is clamped at 100 and spilled in X65 order (M7-D7).
 */
export function materializeWithEdits(weekCd: Cd, edits: ReadonlyMap<number, Cd>, ctx: DayCtx): StepResult {
  const values = spreadWeek(weekCd, ctx).days
  for (const [i, cd] of edits) {
    if (!(Number.isSafeInteger(i) && i >= 0 && i < DAYS_PER_WEEK)) throw new RangeError(`dayIndex must be 0..6, got ${i}`)
    assertNonNegativeInt(cd, 'edit cd')
    if (cd > DAY_MAX_CD) throw new RangeError(`edit cd must be ≤ ${DAY_MAX_CD}, got ${cd}`)
    values[i] = cd
  }
  return withWarnings(clampAndSpill(values, new Set(edits.keys()), ctx), ctx)
}

/** BR-24 SCALE: largest remainder of `newTotal` by the current days, then clamp-and-spill (nothing fixed). */
export function scaleDays(days: readonly Cd[], newTotal: Cd, ctx: DayCtx): StepResult {
  assertDays7(days, 'days')
  return withWarnings(clampAndSpill(distribute(newTotal, days), new Set(), ctx), ctx)
}

/** BR-23: the WEEK total of a DAY week. */
export function collapseDays(days: readonly Cd[]): Cd {
  return sum(days)
}

/** What the grid shows for one week (SPEC §5.3 invariant 3): WEEK → BR-21 split (derived, never clamped). */
export function displayDays(
  plan: WeekPlan,
  ctx: DayCtx,
): { days: Cd[]; derived: boolean; fallback: null | 'SCHEDULE' | 'WEEKDAYS' } {
  if (plan.resolution === 'WEEK') return { ...spreadWeek(plan.weekCd, ctx), derived: true }
  if (plan.resolution === 'DAY') return { days: [...plan.days], derived: false, fallback: null }
  return { days: zeros(), derived: false, fallback: null }
}

// ---------------------------------------------------------------------------------------------------------------
// ★ planWeek — the per-(item, week) table (M6-D4, M7 S1.8)
// ---------------------------------------------------------------------------------------------------------------

export function weekPlanTotal(plan: WeekPlan): Cd {
  if (plan.resolution === 'WEEK') return plan.weekCd
  if (plan.resolution === 'DAY') return sum(plan.days)
  return 0
}

function assertChange(c: WeekChange): void {
  if (c.cd !== null && !Number.isSafeInteger(c.cd)) throw new RangeError(`change cd must be an integer, got ${c.cd}`)
  if (c.granularity === 'DAY' && !(Number.isSafeInteger(c.dayIndex) && c.dayIndex >= 0 && c.dayIndex < DAYS_PER_WEEK))
    throw new RangeError(`dayIndex must be 0..6, got ${c.dayIndex}`)
}

function ok(current: WeekPlan, next: WeekPlan, warnings: DayWarning[] = []): PlanWeekResult {
  return { kind: 'ok', next, changed: !samePlan(current, next), warnings }
}

/**
 * Applies one item's changes to one week (M6-D4, completed by M7 S1.8). Rules in order:
 * 1. empty → unchanged; WEEK + DAY → MIXED_WEEK_AND_DAY; cd < 0 → NEGATIVE; WEEK > 700 / DAY > 100 → MAX.
 * 2. WEEK (last wins, null → 0): null/WEEK → WEEK x; DAY → 0 clears (M7-D5), COLLAPSE → WEEK x (before the Σ
 *    no-op: BR-23, M7-D2), x = Σ days → unchanged (M7-D5), SCALE → scaleDays (BR-24), otherwise needsChoice.
 * 3. DAY (per day, last wins, null → 0): null/DAY → set days (+ dayWarnings); WEEK → materializeWithEdits (BR-22;
 *    a full 7-day snapshot fixes every day, so it replays exactly). Clamp failure → UNREPRESENTABLE.
 */
export function planWeek(
  current: WeekPlan,
  changes: readonly WeekChange[],
  ctx: DayCtx,
  choice?: OnDayWeekChoice,
): PlanWeekResult {
  assertCtx(ctx)
  for (const c of changes) assertChange(c)
  const cur = normalize(current)
  if (changes.length === 0) return ok(cur, cur)
  const hasWeek = changes.some((c) => c.granularity === 'WEEK')
  if (hasWeek && changes.some((c) => c.granularity === 'DAY')) return { kind: 'invalid', reason: 'MIXED_WEEK_AND_DAY' }
  for (const c of changes) {
    if (c.cd !== null && c.cd < 0)
      return c.granularity === 'DAY'
        ? { kind: 'invalid', reason: 'NEGATIVE', dayIndex: c.dayIndex }
        : { kind: 'invalid', reason: 'NEGATIVE' }
  }
  for (const c of changes) {
    if (c.granularity === 'WEEK' && c.cd !== null && c.cd > WEEK_MAX_CD) return { kind: 'invalid', reason: 'MAX' }
    if (c.granularity === 'DAY' && c.cd !== null && c.cd > DAY_MAX_CD)
      return { kind: 'invalid', reason: 'MAX', dayIndex: c.dayIndex }
  }

  if (hasWeek) {
    const x = changes[changes.length - 1]!.cd ?? 0
    if (cur.resolution !== 'DAY') return ok(cur, weekPlan(x), weekNoCapacity(x, ctx))
    if (x === 0) return ok(cur, NULL_PLAN)
    if (choice === 'COLLAPSE') return ok(cur, weekPlan(x), weekNoCapacity(x, ctx))
    if (x === sum(cur.days)) return ok(cur, cur)
    if (choice === 'SCALE') return fromStep(cur, scaleDays(cur.days, x, ctx))
    return { kind: 'needsChoice' }
  }

  const edits = new Map<number, Cd>()
  const dayChanges = changes.filter((c): c is Extract<WeekChange, { granularity: 'DAY' }> => c.granularity === 'DAY')
  for (const c of dayChanges) edits.set(c.dayIndex, c.cd ?? 0)
  if (cur.resolution === 'WEEK') return fromStep(cur, materializeWithEdits(cur.weekCd, edits, ctx))
  const days = cur.resolution === 'DAY' ? [...cur.days] : zeros()
  for (const [i, cd] of edits) days[i] = cd
  return ok(cur, dayPlan(days), dayWarnings(days, ctx, false))
}

function fromStep(cur: WeekPlan, r: StepResult): PlanWeekResult {
  if (!r.ok) return { kind: 'invalid', reason: r.reason }
  return ok(cur, dayPlan(r.days), r.warnings)
}

// ---------------------------------------------------------------------------------------------------------------
// planRange — BR-25 "วางแผน N วัน ในช่วง [start, end]" (FR-612, M6-D6)
// ---------------------------------------------------------------------------------------------------------------

export interface RangeWeek {
  week: ISODate
  ctx: DayCtx
  current: WeekPlan
}
export type PlanRangeDomainResult =
  | {
      ok: true
      fallback: null | 'SCHEDULE' | 'WEEKDAYS' | 'ALL_DAYS'
      capacityCd: Cd
      overCapacityCd: Cd
      weeks: {
        week: ISODate
        kind: 'WHOLE' | 'BOUNDARY'
        next: WeekPlan
        inRangeCapCd: Cd
        changed: boolean
        warnings: DayWarning[]
      }[]
    }
  | { ok: false; reason: 'UNREPRESENTABLE'; week: ISODate }

function inRange(d: ISODate, start: ISODate, end: ISODate): boolean {
  return compareISO(start, d) <= 0 && compareISO(d, end) <= 0
}

/**
 * M6-D6: a week is WHOLE when [start, end] covers every day of it whose schedule > 0 (holidays and leave are
 * ignored); a week with no scheduled day is whole only when all 7 days are in range.
 */
export function isWholeWeek(week: ISODate, schedule: Days7, start: ISODate, end: ISODate): boolean {
  assertDays7(schedule, 'schedule')
  const days = daysOfWeek(week)
  const scheduled = days.filter((_, i) => schedule[i]! > 0)
  return (scheduled.length > 0 ? scheduled : days).every((d) => inRange(d, start, end))
}

/**
 * BR-25 with M6-D6 (DEVIATION): N is distributed over the in-range days by dayCaps (largest remainder), falling back
 * to schedule → Mon–Fri of the range → every in-range day. WHOLE weeks become one WEEK row (Σ of their days);
 * BOUNDARY weeks become DAY rows where only in-range days are replaced: the out-of-range part of the current plan
 * (WEEK → its BR-21 split) is clamp-and-spilled among out-of-range days, the new in-range part among in-range days.
 * A day > 100 or a WEEK > 700 that cannot be spilled → UNREPRESENTABLE for that week.
 * A WHOLE week whose current DAY plan has work on an out-of-range day is planned as BOUNDARY, so that day is kept.
 * @param weeks every Monday from weekStart(start) to weekStart(end), in order (RangeError otherwise).
 */
export function planRange(
  totalCd: Cd,
  start: ISODate,
  end: ISODate,
  weeks: readonly RangeWeek[],
): PlanRangeDomainResult {
  assertNonNegativeInt(totalCd, 'totalCd')
  if (compareISO(start, end) > 0) throw new RangeError(`start ${start} is after end ${end}`)
  const expected = weekRange(weekStart(start), addDays(weekStart(end), 7))
  if (weeks.length !== expected.length || weeks.some((w, i) => w.week !== expected[i]))
    throw new RangeError(`weeks must be every Monday from ${expected[0]} to ${expected[expected.length - 1]}`)
  for (const w of weeks) assertCtx(w.ctx)

  // In-range days D, in order, as (week index, day index).
  const slots: { wi: number; di: number }[] = []
  const inSets = weeks.map((w, wi) => {
    const set = new Set<number>()
    daysOfWeek(w.week).forEach((d, di) => {
      if (inRange(d, start, end)) {
        set.add(di)
        slots.push({ wi, di })
      }
    })
    return set
  })

  const caps = slots.map(({ wi, di }) => weeks[wi]!.ctx.dayCaps[di]!)
  const capacityCd = sum(caps)
  let fallback: null | 'SCHEDULE' | 'WEEKDAYS' | 'ALL_DAYS' = null
  let weights = caps
  if (capacityCd === 0) {
    fallback = 'SCHEDULE'
    weights = slots.map(({ wi, di }) => weeks[wi]!.ctx.schedule[di]!)
    if (sum(weights) === 0) {
      fallback = 'WEEKDAYS'
      weights = slots.map(({ di }) => (di < 5 ? 1 : 0))
      if (sum(weights) === 0) {
        fallback = 'ALL_DAYS'
        weights = slots.map(() => 1)
      }
    }
  }
  const dist = distribute(totalCd, weights)
  const inside = weeks.map(() => zeros())
  slots.forEach(({ wi, di }, k) => {
    inside[wi]![di] = dist[k]!
  })

  const out: Extract<PlanRangeDomainResult, { ok: true }>['weeks'] = []
  for (const [wi, w] of weeks.entries()) {
    const { ctx } = w
    const inSet = inSets[wi]!
    const cur = normalize(w.current)
    const inRangeCapCd = sum([...inSet].map((i) => ctx.dayCaps[i]!))
    const keepsOutsideDays = cur.resolution === 'DAY' && cur.days.some((d, i) => d > 0 && !inSet.has(i))
    const whole = isWholeWeek(w.week, ctx.schedule, start, end) && !keepsOutsideDays

    if (whole) {
      const weekCd = sum(inside[wi]!)
      if (weekCd > WEEK_MAX_CD) return { ok: false, reason: 'UNREPRESENTABLE', week: w.week }
      const next = weekPlan(weekCd)
      out.push({ week: w.week, kind: 'WHOLE', next, inRangeCapCd, changed: !samePlan(cur, next), warnings: weekNoCapacity(weekCd, ctx) })
      continue
    }

    const outSet = new Set([0, 1, 2, 3, 4, 5, 6].filter((i) => !inSet.has(i)))
    const outsidePart = clampAndSpill(
      planDays(cur, ctx).map((v, i) => (inSet.has(i) ? 0 : v)),
      inSet,
      ctx,
    )
    const insidePart = clampAndSpill(inside[wi]!, outSet, ctx)
    if (!outsidePart.ok || !insidePart.ok) return { ok: false, reason: 'UNREPRESENTABLE', week: w.week }
    const days = outsidePart.days.map((v, i) => v + insidePart.days[i]!)
    const warnings: DayWarning[] = outsidePart.spilled || insidePart.spilled ? [{ code: 'SPILLED_OVER_DAY_LIMIT' }] : []
    days.forEach((v, i) => {
      if (v > 0 && ctx.dayCaps[i] === 0) warnings.push({ code: 'WORK_ON_NON_WORKING_DAY', dayIndex: i })
    })
    const next = dayPlan(days)
    out.push({ week: w.week, kind: 'BOUNDARY', next, inRangeCapCd, changed: !samePlan(cur, next), warnings })
  }

  return { ok: true, fallback, capacityCd, overCapacityCd: Math.max(0, totalCd - capacityCd), weeks: out }
}
