import { describe, expect, it } from 'vitest'
import { planCapacityKey, planClear, planTyped, type TargetCell } from './apply'

const t = (week: string, o: Partial<TargetCell> & { cd?: number } = {}): TargetCell => {
  const { cd, ...rest } = o
  return {
    rowKey: 'a:cindy',
    taskAssignmentId: 'cindy',
    week,
    editability: 'ok',
    capCd: 500,
    ...(cd !== undefined ? { cell: { cd, resolution: 'WEEK' as const, derived: false } } : {}),
    ...rest,
  }
}
const CRM = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']

describe('planTyped (AC-801, M6-D10/D11)', () => {
  it("'3' over 6 Cindy CRM targets → 6 writes of 300", () => {
    const r = planTyped(
      '3',
      CRM.map((w) => t(w)),
      'DAYS',
    )
    expect(r.writes).toHaveLength(6)
    expect(r.writes.every((w) => w.cd === 300 && w.granularity === 'WEEK')).toBe(true)
    expect(r.writes.map((w) => w.period)).toEqual(CRM)
    expect(r.invalid).toBeNull()
  })
  it('one DAY target among 4 → 3 writes + skippedDayWeek 1', () => {
    const targets = CRM.slice(0, 4).map((w, i) => t(w, i === 1 ? { editability: 'dayWeek' } : {}))
    const r = planTyped('1', targets, 'DAYS')
    expect(r.writes).toHaveLength(3)
    expect(r.skippedDayWeek).toBe(1)
  })
  it('read-only rows are skipped and counted', () => {
    const r = planTyped(
      '1',
      [t(CRM[0]!, { editability: 'readOnlyRow', taskAssignmentId: null }), t(CRM[1]!)],
      'DAYS',
    )
    expect(r.writes).toHaveLength(1)
    expect(r.skippedReadOnly).toBe(1)
  })
  it("FRACTION '0.5' with caps [500, 400] → 250, 200", () => {
    const r = planTyped('0.5', [t(CRM[0]!), t(CRM[1]!, { capCd: 400 })], 'FRACTION')
    expect(r.writes.map((w) => w.cd)).toEqual([250, 200])
  })
  it("'7.5' → invalid MAX, no writes", () => {
    const r = planTyped('7.5', [t(CRM[0]!)], 'DAYS')
    expect(r.writes).toEqual([])
    expect(r.invalid).toEqual({ kind: 'invalid', reason: 'MAX' })
  })
  it("'' and '0' clear (null writes)", () => {
    expect(planTyped('', [t(CRM[0]!, { cd: 250 })], 'DAYS').writes[0]?.cd).toBeNull()
    expect(planTyped('0', [t(CRM[0]!, { cd: 250 })], 'DAYS').writes[0]?.cd).toBeNull()
  })
  it("typed 'f' behaves like the capacity key", () => {
    const r = planTyped('f', [t(CRM[0]!, { capCd: 300 }), t(CRM[1]!, { capCd: 0 })], 'DAYS')
    expect(r.writes.map((w) => w.cd)).toEqual([300])
    expect(r.skippedNoCapacity).toBe(1)
  })
})

describe('planCapacityKey (AC-802)', () => {
  it('f with capacities [300, 500, 0] → writes 300, 500 + skipped 1', () => {
    const r = planCapacityKey('f', [
      t(CRM[0]!, { capCd: 300 }),
      t(CRM[1]!, { capCd: 500 }),
      t(CRM[2]!, { capCd: 0 }),
    ])
    expect(r.writes.map((w) => w.cd)).toEqual([300, 500])
    expect(r.skippedNoCapacity).toBe(1)
  })
  it('h cap 300 → 150', () => {
    expect(planCapacityKey('h', [t(CRM[0]!, { capCd: 300 })]).writes[0]?.cd).toBe(150)
  })
  it('skips read-only and DAY weeks', () => {
    const r = planCapacityKey('f', [
      t(CRM[0]!, { editability: 'dayWeek' }),
      t(CRM[1]!, { editability: 'archived' }),
    ])
    expect(r.writes).toEqual([])
    expect(r.skippedDayWeek).toBe(1)
    expect(r.skippedReadOnly).toBe(1)
  })
})

describe('planClear', () => {
  it('writes null for editable non-empty targets only', () => {
    const r = planClear([
      t(CRM[0]!, { cd: 250 }),
      t(CRM[1]!),
      t(CRM[2]!, { cd: 100, editability: 'dayWeek' }),
    ])
    expect(r.writes).toEqual([{ taskAssignmentId: 'cindy', granularity: 'WEEK', period: CRM[0], cd: null }])
    expect(r.skippedDayWeek).toBe(1)
  })
})
