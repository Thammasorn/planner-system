import { describe, expect, it } from 'vitest'
import type { AssigneeCell } from '@/lib/contracts/grid'
import type { CellWrite } from './queue'
import {
  gestureSnapshots,
  isStale,
  snapshotFromState,
  snapshotOf,
  snapshotToChanges,
  snapshotWrites,
  type WeekSnapshot,
} from './undo'

describe('week snapshots (§7.5, M6-D13)', () => {
  it('WEEK snapshot → one WEEK change', () => {
    const s = snapshotOf({ cd: 250, resolution: 'WEEK', derived: false }, 'ivy', '2026-09-28')
    expect(snapshotToChanges(s)).toEqual([{ granularity: 'WEEK', period: '2026-09-28', cd: 250 }])
  })

  it('DAY snapshot → 7 DAY changes with nulls for empty days', () => {
    const s = snapshotFromState(
      { cd: 300, resolution: 'DAY', days: { '2026-11-11': 100, '2026-11-12': 100, '2026-11-13': 100 } },
      'ivy',
      '2026-11-09',
    )
    expect(Object.keys(s.days)).toHaveLength(7)
    expect(snapshotToChanges(s)).toEqual([
      { granularity: 'DAY', period: '2026-11-09', cd: null },
      { granularity: 'DAY', period: '2026-11-10', cd: null },
      { granularity: 'DAY', period: '2026-11-11', cd: 100 },
      { granularity: 'DAY', period: '2026-11-12', cd: 100 },
      { granularity: 'DAY', period: '2026-11-13', cd: 100 },
      { granularity: 'DAY', period: '2026-11-14', cd: null },
      { granularity: 'DAY', period: '2026-11-15', cd: null },
    ])
  })

  it('empty → WEEK null', () => {
    expect(snapshotToChanges(snapshotOf(undefined, 'ivy', '2026-09-28'))).toEqual([
      { granularity: 'WEEK', period: '2026-09-28', cd: null },
    ])
    expect(snapshotFromState({ cd: 0, resolution: null }, 'ivy', '2026-09-28').resolution).toBeNull()
  })

  it('gestureSnapshots records before (cache) and after (writes) per (assignment, week)', () => {
    const cells = new Map<string, AssigneeCell>([
      ['cindy|2026-08-31', { cd: 500, resolution: 'WEEK', derived: false }],
    ])
    const writes: CellWrite[] = [
      { taskAssignmentId: 'cindy', granularity: 'WEEK', period: '2026-08-31', cd: 100 },
      { taskAssignmentId: 'cindy', granularity: 'WEEK', period: '2026-09-07', cd: 200 },
    ]
    const g = gestureSnapshots(writes, (id, w) => cells.get(`${id}|${w}`))
    expect(g.before.map((s) => [s.week, s.weekCd, s.resolution])).toEqual([
      ['2026-08-31', 500, 'WEEK'],
      ['2026-09-07', 0, null],
    ])
    expect(g.after.map((s) => [s.week, s.weekCd])).toEqual([
      ['2026-08-31', 100],
      ['2026-09-07', 200],
    ])
  })

  it('three edits A, B, C → three undos send C, B, A', () => {
    const cells = new Map<string, number>([
      ['2026-08-31', 500],
      ['2026-09-07', 500],
      ['2026-09-14', 375],
    ])
    const stack: { before: WeekSnapshot[] }[] = []
    for (const [week, cd] of [
      ['2026-08-31', 100],
      ['2026-09-07', 200],
      ['2026-09-14', 300],
    ] as const) {
      const g = gestureSnapshots(
        [{ taskAssignmentId: 'cindy', granularity: 'WEEK', period: week, cd }],
        (_id, w) => {
          const v = cells.get(w) ?? 0
          return v ? { cd: v, resolution: 'WEEK', derived: false } : undefined
        },
      )
      cells.set(week, cd)
      stack.push(g)
    }
    const sent: CellWrite[][] = []
    while (stack.length > 0) sent.push(stack.pop()!.before.flatMap(snapshotWrites))
    expect(sent.map((s) => [s[0]?.period, s[0]?.cd])).toEqual([
      ['2026-09-14', 375],
      ['2026-09-07', 500],
      ['2026-08-31', 500],
    ])
  })

  it('isStale compares conflict epochs', () => {
    const e = { epochs: new Map([['cindy', 0]]) }
    expect(isStale(e, () => 0)).toBe(false)
    expect(isStale(e, () => 1)).toBe(true)
  })
})
