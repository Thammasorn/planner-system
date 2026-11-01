// plan/m07 S3.9 — day-level undo through complete week snapshots (§7.5, AC-805, M7-D18). undo.ts is M6's, unchanged.
import { describe, expect, it } from 'vitest'
import { planWeek, type DayCtx, type WeekChange } from '@/domain/allocation'
import { diffDays } from '@/domain/dates'
import type { Change } from '@/lib/contracts/grid'
import { snapshotOf, snapshotToChanges } from './undo'

const ctx: DayCtx = {
  week: '2026-09-28',
  dayCaps: [100, 100, 100, 100, 100, 0, 0],
  schedule: [100, 100, 100, 100, 100, 0, 0],
  timeOff: [false, false, false, false, false, false, false],
}
const toWeekChanges = (cs: Change[]): WeekChange[] =>
  cs.map((c) =>
    c.granularity === 'WEEK'
      ? { granularity: 'WEEK', cd: c.cd }
      : { granularity: 'DAY', dayIndex: diffDays('2026-09-28', c.period), cd: c.cd },
  )

describe('DAY snapshots replay exactly', () => {
  const snap = snapshotOf(
    { cd: 250, resolution: 'DAY', derived: false, days: { '2026-09-28': 100, '2026-09-29': 100, '2026-09-30': 50 } },
    'a-ivy',
    '2026-09-28',
  )
  it('→ 7 DAY changes with nulls for the empty days', () => {
    const cs = snapshotToChanges(snap)
    expect(cs).toHaveLength(7)
    expect(cs.map((c) => c.cd)).toEqual([100, 100, 50, null, null, null, null])
    expect(cs.every((c) => c.granularity === 'DAY')).toBe(true)
  })
  it('applied to WEEK 250 (after a COLLAPSE) → [100,100,50,0,0,0,0], not 350', () => {
    const r = planWeek({ resolution: 'WEEK', weekCd: 250 }, toWeekChanges(snapshotToChanges(snap)), ctx, 'COLLAPSE')
    expect(r).toMatchObject({ kind: 'ok', next: { resolution: 'DAY', days: [100, 100, 50, 0, 0, 0, 0] } })
  })
})

describe('WEEK snapshots', () => {
  it("snapshotOf(cell, ivyUat, '2026-09-28') → [{ WEEK, 250 }]", () => {
    const s = snapshotOf({ cd: 250, resolution: 'WEEK', derived: false }, 'a-ivy-uat', '2026-09-28')
    expect(snapshotToChanges(s)).toEqual([{ granularity: 'WEEK', period: '2026-09-28', cd: 250 }])
  })
  it('AC-804 undo: DAY [50,50,100,50,50] + WEEK 250 with COLLAPSE → WEEK 250, never needsChoice', () => {
    const r = planWeek(
      { resolution: 'DAY', days: [50, 50, 100, 50, 50, 0, 0] },
      [{ granularity: 'WEEK', cd: 250 }],
      ctx,
      'COLLAPSE',
    )
    expect(r).toMatchObject({ kind: 'ok', next: { resolution: 'WEEK', weekCd: 250 } })
  })
})
