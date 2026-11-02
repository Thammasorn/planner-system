import { describe, expect, it } from 'vitest'
import { countReadOnlySum, planCapacityKey, planClear, planTyped, splitSkipped, type TargetCell } from './apply'

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
  it("M7 (X27): '3' over 4 week targets incl. one DAY week → 4 writes (the DAY week goes through BR-24)", () => {
    const day = { cell: { cd: 300, resolution: 'DAY' as const, derived: false, days: { '2026-10-12': 300 } } }
    const targets = CRM.slice(0, 4).map((w, i) => t(w, i === 1 ? day : {}))
    const r = planTyped('3', targets, 'DAYS')
    expect(r.writes).toHaveLength(4)
    expect(r.writes.every((w) => w.granularity === 'WEEK' && w.cd === 300)).toBe(true)
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
  it('skips read-only targets', () => {
    const r = planCapacityKey('f', [t(CRM[0]!, { editability: 'noEdit' }), t(CRM[1]!, { editability: 'archived' })])
    expect(r.writes).toEqual([])
    expect(r.skippedReadOnly).toBe(2)
  })
})

describe('planClear', () => {
  it('writes null for editable non-empty targets only', () => {
    const r = planClear([
      t(CRM[0]!, { cd: 250 }),
      t(CRM[1]!),
      t(CRM[2]!, { cd: 100, editability: 'archived' }),
    ])
    expect(r.writes).toEqual([{ taskAssignmentId: 'cindy', granularity: 'WEEK', period: CRM[0], cd: null }])
    expect(r.skippedReadOnly).toBe(1)
  })
})

describe('M7 day targets (S3.6)', () => {
  const day = (date: string, o: Partial<TargetCell> & { cd?: number } = {}) =>
    t('2026-09-28', { granularity: 'DAY', date, capCd: 100, ...o })
  it("'1' on D 2026-09-30 → { DAY, 2026-09-30, 100 }", () => {
    expect(planTyped('1', [day('2026-09-30')], 'DAYS').writes).toEqual([
      { taskAssignmentId: 'cindy', granularity: 'DAY', period: '2026-09-30', cd: 100 },
    ])
  })
  it('รวม target → WEEK on the Monday', () => {
    expect(planTyped('3', [t('2026-09-28', { granularity: 'WEEK' })], 'DAYS').writes[0]).toEqual({
      taskAssignmentId: 'cindy',
      granularity: 'WEEK',
      period: '2026-09-28',
      cd: 300,
    })
  })
  it('Delete on a derived day → { DAY, cd: null }', () => {
    const derived = { cell: { cd: 50, resolution: 'WEEK' as const, derived: true } }
    expect(planClear([day('2026-09-29', derived)]).writes).toEqual([
      { taskAssignmentId: 'cindy', granularity: 'DAY', period: '2026-09-29', cd: null },
    ])
  })
  it("'1.25' on a single day → invalid MAX (editor stays open), dayMax", () => {
    const r = planTyped('1.25', [day('2026-09-30')], 'DAYS')
    expect(r.writes).toEqual([])
    expect(r.invalid).toEqual({ kind: 'invalid', reason: 'MAX' })
    expect(r.dayMax).toBe(true)
  })
  it("'2' over a day + a week target → the week is written, the day rejected", () => {
    const r = planTyped('2', [day('2026-09-30'), t('2026-10-05')], 'DAYS')
    expect(r.invalid).toBeNull()
    expect(r.writes.map((w) => [w.granularity, w.cd])).toEqual([['WEEK', 200]])
    expect(r.rejectedDayMax).toBe(1)
  })
  it('f / h use the day capacity; cap-0 days skipped', () => {
    const r = planCapacityKey('h', [day('2026-09-28', { capCd: 75 }), day('2026-09-29', { capCd: 0 })])
    expect(r.writes.map((w) => w.cd)).toEqual([50])
    expect(r.skippedNoCapacity).toBe(1)
    expect(planCapacityKey('f', [day('2026-09-28', { capCd: 50 })]).writes[0]?.cd).toBe(50)
  })
})

describe('countReadOnlySum / splitSkipped (FR-817, M7.1-D6)', () => {
  const t = (editability: TargetCell['editability']): TargetCell => ({
    rowKey: 't:x',
    taskAssignmentId: null,
    week: '2026-09-28',
    editability,
    capCd: 0,
  })
  it('counts only summed read-only targets', () => {
    expect(countReadOnlySum([t('readOnlySum'), t('ok'), null, t('readOnlyRow'), t('readOnlySum')])).toBe(2)
    expect(countReadOnlySum([])).toBe(0)
  })
  it('splits the skipped count into summed and other read-only cells', () => {
    expect(splitSkipped(5, 2)).toEqual([2, 3])
    expect(splitSkipped(1, 3)).toEqual([1, 0])
    expect(splitSkipped(0, 0)).toEqual([0, 0])
  })
})
