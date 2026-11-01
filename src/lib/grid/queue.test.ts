import { beforeEach, describe, expect, it } from 'vitest'
import { coalesce, toItems, type CellWrite } from './queue'
import { bumpConflictEpoch, conflictEpoch, knownVersion, rememberVersion, resetVersions } from './versions'

const w = (taskAssignmentId: string, period: string, cd: number | null): CellWrite => ({
  taskAssignmentId,
  granularity: 'WEEK',
  period,
  cd,
})

describe('coalesce', () => {
  it('last write wins per (assignment, granularity, period), first position kept', () => {
    const out = coalesce(
      [w('a', '2026-09-28', 100), w('b', '2026-09-28', 200)],
      [w('a', '2026-09-28', 300), w('a', '2026-10-05', 0)],
    )
    expect(out).toEqual([w('a', '2026-09-28', 300), w('b', '2026-09-28', 200), w('a', '2026-10-05', null)])
  })
  it('keeps WEEK and DAY writes of the same date apart', () => {
    const out = coalesce([], [w('a', '2026-09-28', 100), { ...w('a', '2026-09-28', 50), granularity: 'DAY' }])
    expect(out).toHaveLength(2)
  })
})

describe('toItems + versions (M6-D14)', () => {
  beforeEach(() => resetVersions())

  it('groups per assignment sorted by id with changes in order', () => {
    const items = toItems(
      [w('b', '2026-09-28', 100), w('a', '2026-10-05', null), w('b', '2026-10-05', 200)],
      knownVersion,
    )
    expect(items).toEqual([
      {
        taskAssignmentId: 'a',
        baseVersion: 1,
        changes: [{ granularity: 'WEEK', period: '2026-10-05', cd: null }],
      },
      {
        taskAssignmentId: 'b',
        baseVersion: 1,
        changes: [
          { granularity: 'WEEK', period: '2026-09-28', cd: 100 },
          { granularity: 'WEEK', period: '2026-10-05', cd: 200 },
        ],
      },
    ])
  })

  it('reads versions lazily at build time', () => {
    rememberVersion('a', 3)
    expect(toItems([w('a', '2026-09-28', 100)], knownVersion)[0]?.baseVersion).toBe(3)
  })

  it('rememberVersion keeps the max', () => {
    rememberVersion('a', 5)
    rememberVersion('a', 2)
    expect(knownVersion('a')).toBe(5)
  })

  it('conflict epochs start at 0 and bump', () => {
    expect(conflictEpoch('a')).toBe(0)
    bumpConflictEpoch('a')
    expect(conflictEpoch('a')).toBe(1)
  })
})
