import { describe, expect, it } from 'vitest'
import type { GridAssigneeRow, GridResponse, GridTaskRow } from '@/lib/contracts/grid'
import {
  applyConflicts,
  applyServerResults,
  applyWritesOptimistically,
  cachedCell,
  nextCell,
  rowTotalDeltas,
} from './cache-ops'
import { gridResponse, posChunks, POS_PEOPLE, type FxTask } from './fixtures.test.data'
import type { CellWrite } from './queue'

const assignee = (r: GridResponse, id: string) =>
  r.rows.find((x): x is GridAssigneeRow => x.kind === 'assignee' && x.taskAssignmentId === id)!
const task = (r: GridResponse, id: string) =>
  r.rows.find((x): x is GridTaskRow => x.kind === 'task' && x.id === id)!
const week = (taskAssignmentId: string, period: string, cd: number | null): CellWrite => ({
  taskAssignmentId,
  granularity: 'WEEK',
  period,
  cd,
})

describe('applyWritesOptimistically', () => {
  const [a] = posChunks()

  it('sets cd with resolution WEEK and updates the task total', () => {
    const r = applyWritesOptimistically(a, [week('a-cindy-pos', '2026-10-05', 300)])
    expect(assignee(r, 'a-cindy-pos').cells['W:2026-10-05']).toEqual({
      cd: 300,
      resolution: 'WEEK',
      derived: false,
    })
    expect(task(r, 't-pos').totals['W:2026-10-05']).toEqual({ total: 300, committed: 300 })
    expect(assignee(r, 'a-cindy-pos').rowTotal).toEqual({ total: 2175, committed: 2175 })
    expect(a).not.toBe(r)
    expect(assignee(a, 'a-cindy-pos').cells['W:2026-10-05']).toBeUndefined() // input untouched
  })

  it('null removes the cell and the total', () => {
    const r = applyWritesOptimistically(a, [week('a-cindy-pos', '2026-08-31', null)])
    expect(assignee(r, 'a-cindy-pos').cells['W:2026-08-31']).toBeUndefined()
    expect(task(r, 't-pos').totals['W:2026-08-31']).toBeUndefined()
  })

  it('ignores weeks outside the chunk and unknown assignments', () => {
    expect(
      applyWritesOptimistically(a, [week('a-cindy-pos', '2027-03-01', 100), week('nope', '2026-09-28', 1)]),
    ).toBe(a)
  })

  it('uses shared deltas so every chunk moves rowTotal the same way', () => {
    const [c1, c2] = posChunks()
    const writes = [week('a-cindy-pos', '2026-08-31', 100)]
    const d = rowTotalDeltas([c1, c2], writes)
    expect(d.get('a-cindy-pos')).toEqual({ total: -400, committed: -400 })
    const r2 = applyWritesOptimistically(c2, writes, d)
    expect(assignee(r2, 'a-cindy-pos').rowTotal.total).toBe(1475)
    expect(assignee(r2, 'a-cindy-pos').cells['W:2026-08-31']).toBeUndefined()
  })

  it('parent totals = Σ of all children after a write', () => {
    const tree: FxTask[] = [
      { id: 'p', name: 'p', assignees: [] },
      {
        id: 'c1',
        name: 'c1',
        parentId: 'p',
        depth: 1,
        assignees: [{ taId: 'x1', userId: 'cindy', cells: { '2026-09-28': 100 } }],
      },
      {
        id: 'c2',
        name: 'c2',
        parentId: 'p',
        depth: 1,
        assignees: [{ taId: 'x2', userId: 'ivy', cells: { '2026-09-28': 200 } }],
      },
    ]
    const r0 = gridResponse({ from: '2026-09-28', tasks: tree, people: POS_PEOPLE })
    const r = applyWritesOptimistically(r0, [week('x1', '2026-09-28', 150)])
    expect(task(r, 'p').totals['W:2026-09-28']).toEqual({ total: 350, committed: 350 })
  })

  it('DAY writes replace the days of a week (snapshot replay)', () => {
    const c = nextCell({ cd: 250, resolution: 'WEEK', derived: false }, [
      { taskAssignmentId: 'a', granularity: 'DAY', period: '2026-11-11', cd: 100 },
      { taskAssignmentId: 'a', granularity: 'DAY', period: '2026-11-12', cd: 50 },
      { taskAssignmentId: 'a', granularity: 'DAY', period: '2026-11-09', cd: null },
    ])
    expect(c).toEqual({
      cd: 150,
      resolution: 'DAY',
      derived: false,
      days: { '2026-11-11': 100, '2026-11-12': 50 },
    })
  })
})

describe('applyServerResults / applyConflicts', () => {
  const [a, b] = posChunks()
  const ok = {
    results: [
      {
        taskAssignmentId: 'a-ivy-uat',
        version: 4,
        weeks: {
          '2026-10-05': { cd: 0, resolution: null },
          '2026-11-09': {
            cd: 200,
            resolution: 'DAY' as const,
            days: { '2026-11-11': 100, '2026-11-12': 100 },
          },
        },
        rowTotal: { total: 950, committed: 950 },
      },
    ],
    warnings: [],
  }

  it('replaces cells, version and rowTotal; totals recomputed', () => {
    const r = applyServerResults(a, ok)
    expect(assignee(r, 'a-ivy-uat').cells['W:2026-10-05']).toBeUndefined()
    expect(assignee(r, 'a-ivy-uat').version).toBe(4)
    expect(assignee(r, 'a-ivy-uat').rowTotal).toEqual({ total: 950, committed: 950 })
    expect(task(r, 't-uat').totals['W:2026-10-05']).toBeUndefined()
    const r2 = applyServerResults(b, ok)
    expect(assignee(r2, 'a-ivy-uat').cells['W:2026-11-09']).toEqual({
      cd: 200,
      resolution: 'DAY',
      derived: false,
      days: { '2026-11-11': 100, '2026-11-12': 100 },
    })
    expect(assignee(r2, 'a-ivy-uat').version).toBe(4)
  })

  it('a conflict restores the server weeks', () => {
    const optimistic = applyWritesOptimistically(a, [week('a-ivy-uat', '2026-09-14', 500)])
    const r = applyConflicts(optimistic, [
      {
        taskAssignmentId: 'a-ivy-uat',
        version: 2,
        weeks: { '2026-09-14': { cd: 100, resolution: 'WEEK' } },
        rowTotal: { total: 725, committed: 725 },
      },
    ])
    expect(assignee(r, 'a-ivy-uat').cells['W:2026-09-14']?.cd).toBe(100)
    expect(assignee(r, 'a-ivy-uat').version).toBe(2)
    expect(cachedCell([undefined, r], 'a-ivy-uat', '2026-09-14')?.cd).toBe(100)
  })
})
