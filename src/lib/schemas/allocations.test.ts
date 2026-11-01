import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { planAssignmentRangeSchema, saveAllocationsSchema } from './allocations'

const ta = '7d1b0c3a-2f4e-4b6a-9c8d-1e2f3a4b5c6d'
const tb = '0b6c1b5e-6a51-4c4b-9e1a-2f0a8d7c3b21'

type Parse = { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }

/** Every issue of a failing parse as `path: message`. */
function issues(r: Parse) {
  expect(r.success).toBe(false)
  return r.error!.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

const save = (changes: unknown[], extra: Record<string, unknown> = {}) =>
  saveAllocationsSchema.safeParse({
    items: [{ taskAssignmentId: ta, baseVersion: 1, changes }],
    clientOpId: 'op-1',
    ...extra,
  })

describe('saveAllocationsSchema (§7.4, X65, BR-26)', () => {
  it('accepts WEEK on a Monday, DAY on any day, cd null (delete)', () => {
    const r = save([
      { granularity: 'WEEK', period: '2026-09-28', cd: 300 },
      { granularity: 'DAY', period: '2026-10-01', cd: 50 },
      { granularity: 'WEEK', period: '2026-10-05', cd: null },
    ])
    expect(r.success).toBe(true)
  })

  it('WEEK period not on a Monday → weekNotMonday at items.0.changes.0.period', () => {
    expect(issues(save([{ granularity: 'WEEK', period: '2026-09-29', cd: 100 }]))).toEqual([
      { path: 'items.0.changes.0.period', message: th.grid.errors.weekNotMonday },
    ])
  })

  it('WEEK cd 701 → error; WEEK 700 ok; DAY cd 101 → maxDay; negative or fractional cd → error', () => {
    expect(save([{ granularity: 'WEEK', period: '2026-09-28', cd: 701 }]).success).toBe(false)
    expect(save([{ granularity: 'WEEK', period: '2026-09-28', cd: 700 }]).success).toBe(true)
    expect(issues(save([{ granularity: 'DAY', period: '2026-09-29', cd: 101 }]))).toEqual([
      { path: 'items.0.changes.0.cd', message: th.grid.errors.maxDay },
    ])
    expect(save([{ granularity: 'DAY', period: '2026-09-29', cd: 100 }]).success).toBe(true)
    expect(save([{ granularity: 'WEEK', period: '2026-09-28', cd: -25 }]).success).toBe(false)
    expect(save([{ granularity: 'WEEK', period: '2026-09-28', cd: 12.5 }]).success).toBe(false)
  })

  it('invalid dates and empty change lists are rejected', () => {
    expect(save([{ granularity: 'WEEK', period: '2026-02-30', cd: 100 }]).success).toBe(false)
    expect(save([]).success).toBe(false)
  })

  it('duplicate assignment ids in items → invalidBatch', () => {
    const change = { granularity: 'WEEK', period: '2026-09-28', cd: 100 }
    const r = saveAllocationsSchema.safeParse({
      items: [
        { taskAssignmentId: ta, baseVersion: 1, changes: [change] },
        { taskAssignmentId: ta, baseVersion: 1, changes: [change] },
      ],
      clientOpId: 'op-1',
    })
    expect(issues(r)).toEqual([{ path: 'items', message: th.grid.errors.invalidBatch }])
    const ok = saveAllocationsSchema.safeParse({
      items: [
        { taskAssignmentId: ta, baseVersion: 1, changes: [change] },
        { taskAssignmentId: tb, baseVersion: 3, changes: [change] },
      ],
      clientOpId: 'op-1',
    })
    expect(ok.success).toBe(true)
  })

  it("onDayWeekConflict: SCALE / COLLAPSE ok, 'EXPAND' → error (r5 C11)", () => {
    const c = [{ granularity: 'WEEK', period: '2026-09-28', cd: 100 }]
    expect(save(c, { onDayWeekConflict: 'COLLAPSE' }).success).toBe(true)
    expect(save(c, { onDayWeekConflict: 'SCALE' }).success).toBe(true)
    expect(save(c, { onDayWeekConflict: 'EXPAND' }).success).toBe(false)
  })

  it('baseVersion ≥ 1, uuid ids, clientOpId 1..64 chars', () => {
    const c = [{ granularity: 'WEEK', period: '2026-09-28', cd: 100 }]
    expect(
      saveAllocationsSchema.safeParse({
        items: [{ taskAssignmentId: ta, baseVersion: 0, changes: c }],
        clientOpId: 'x',
      }).success,
    ).toBe(false)
    expect(
      saveAllocationsSchema.safeParse({
        items: [{ taskAssignmentId: 'x', baseVersion: 1, changes: c }],
        clientOpId: 'x',
      }).success,
    ).toBe(false)
    expect(save(c, { clientOpId: '' }).success).toBe(false)
    expect(save(c, { clientOpId: 'x'.repeat(65) }).success).toBe(false)
  })
})

describe('planAssignmentRangeSchema (FR-612, BR-25, M6-D6)', () => {
  const base = {
    taskAssignmentId: ta,
    baseVersion: 1,
    totalCd: 1000,
    start: '2026-11-11',
    end: '2026-11-24',
    dryRun: false,
    clientOpId: 'op-1',
  }

  it('accepts an apply and a dryRun with baseVersion null', () => {
    expect(planAssignmentRangeSchema.safeParse(base).success).toBe(true)
    expect(planAssignmentRangeSchema.safeParse({ ...base, dryRun: true, baseVersion: null }).success).toBe(
      true,
    )
  })

  it('end < start → endBeforeStart; start = end ok', () => {
    expect(issues(planAssignmentRangeSchema.safeParse({ ...base, end: '2026-11-10' }))).toEqual([
      { path: 'end', message: th.plan.errors.endBeforeStart },
    ])
    expect(planAssignmentRangeSchema.safeParse({ ...base, end: base.start }).success).toBe(true)
  })

  it('371 days ok; 372-day range → rangeTooLong', () => {
    expect(
      planAssignmentRangeSchema.safeParse({ ...base, start: '2026-01-01', end: '2027-01-06' }).success,
    ).toBe(true)
    expect(
      issues(planAssignmentRangeSchema.safeParse({ ...base, start: '2026-01-01', end: '2027-01-07' })),
    ).toEqual([{ path: 'end', message: th.plan.errors.rangeTooLong }])
  })

  it('apply with baseVersion null → error', () => {
    expect(issues(planAssignmentRangeSchema.safeParse({ ...base, baseVersion: null }))).toEqual([
      { path: 'baseVersion', message: th.grid.errors.invalidBatch },
    ])
  })

  it('totalCd 0..37 100 integers', () => {
    expect(planAssignmentRangeSchema.safeParse({ ...base, totalCd: 0 }).success).toBe(true)
    expect(planAssignmentRangeSchema.safeParse({ ...base, totalCd: 37_100 }).success).toBe(true)
    expect(planAssignmentRangeSchema.safeParse({ ...base, totalCd: 37_101 }).success).toBe(false)
    expect(planAssignmentRangeSchema.safeParse({ ...base, totalCd: -1 }).success).toBe(false)
    expect(planAssignmentRangeSchema.safeParse({ ...base, totalCd: 1.5 }).success).toBe(false)
  })

  it('a malformed date fails without crashing the range refinement', () => {
    expect(planAssignmentRangeSchema.safeParse({ ...base, start: 'nope' }).success).toBe(false)
  })
})
