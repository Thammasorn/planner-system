// plan/m07 S3.6 — optimistic day overlay (AC-804, BR-22, M7-D19).
import { describe, expect, it } from 'vitest'
import type { GridAssigneeRow, GridResponse, GridTaskRow } from '@/lib/contracts/grid'
import { applyServerResults, applyWritesOptimistically, rowTotalDeltas } from './cache-ops'
import { applyPlanToResponse } from './day-overlay'
import { gridResponse } from './fixtures.test.data'
import type { CellWrite } from './queue'

const ivyWeek = (o: { expand?: string[]; cell?: number | { days: Record<string, number> } } = {}) =>
  gridResponse({
    from: '2026-09-28',
    expand: o.expand ?? ['2026-09-28'],
    tasks: [
      { id: 't-uat', name: 'UAT', assignees: [{ taId: 'a-ivy', userId: 'ivy', cells: { '2026-09-28': o.cell ?? 250 } }] },
    ],
    people: { ivy: { name: 'Ivy' } },
  })
const row = (r: GridResponse) =>
  r.rows.find((x): x is GridAssigneeRow => x.kind === 'assignee' && x.taskAssignmentId === 'a-ivy')!
const task = (r: GridResponse) => r.rows.find((x): x is GridTaskRow => x.kind === 'task')!
const dayCds = (r: GridResponse) =>
  ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d) => row(r).cells[`D:${d}`])
const wed: CellWrite = { taskAssignmentId: 'a-ivy', granularity: 'DAY', period: '2026-09-30', cd: 100 }

describe('expanded WEEK week (fixture)', () => {
  it('derived 0.5 × 5', () => {
    expect(dayCds(ivyWeek()).map((c) => [c?.cd, c?.derived])).toEqual(Array(5).fill([50, true]))
  })
})

describe('applyPlanToResponse', () => {
  it('AC-804 overlay → W { 300, DAY }, D solid [50,50,100,50,50]', () => {
    const r = applyPlanToResponse(ivyWeek(), 'a-ivy', '2026-09-28', { resolution: 'DAY', days: [50, 50, 100, 50, 50, 0, 0] })
    expect(row(r).cells['W:2026-09-28']).toMatchObject({ cd: 300, resolution: 'DAY' })
    expect(dayCds(r).map((c) => [c?.cd, c?.derived])).toEqual([
      [50, false],
      [50, false],
      [100, false],
      [50, false],
      [50, false],
    ])
    expect(task(r).totals['W:2026-09-28']).toEqual({ total: 300, committed: 300 })
    expect(task(r).totals['D:2026-09-30']).toEqual({ total: 100, committed: 100 })
  })
  it('unknown assignment → same object', () => {
    const r0 = ivyWeek()
    expect(applyPlanToResponse(r0, 'nope', '2026-09-28', { resolution: null })).toBe(r0)
  })
})

describe('applyWritesOptimistically — day path', () => {
  it('AC-804: Wed = 1.0 on WEEK 250 → week 3.0, other days solid (BR-22)', () => {
    const r = applyWritesOptimistically(ivyWeek(), [wed])
    expect(row(r).cells['W:2026-09-28']?.cd).toBe(300)
    expect(dayCds(r).map((c) => c?.cd)).toEqual([50, 50, 100, 50, 50])
    expect(dayCds(r).every((c) => c?.derived === false)).toBe(true)
    expect(row(r).rowTotal.total).toBe(300)
  })
  it('the same on a collapsed week: only the W cell (no D periods in the chunk)', () => {
    const r = applyWritesOptimistically(ivyWeek({ expand: [] }), [wed])
    expect(row(r).cells['W:2026-09-28']).toMatchObject({ cd: 300, resolution: 'DAY' })
    expect(row(r).cells['D:2026-09-30']).toBeUndefined()
  })
  it('a WEEK write on a DAY week without a choice changes nothing (BR-24 decides); SCALE / COLLAPSE apply', () => {
    const r0 = ivyWeek({ cell: { days: { '2026-09-28': 50, '2026-09-29': 50, '2026-09-30': 100, '2026-10-01': 50, '2026-10-02': 50 } } })
    const w: CellWrite = { taskAssignmentId: 'a-ivy', granularity: 'WEEK', period: '2026-09-28', cd: 200 }
    expect(row(applyWritesOptimistically(r0, [w])).cells['W:2026-09-28']?.cd).toBe(300)
    const scaled = applyWritesOptimistically(r0, [w], undefined, 'SCALE')
    expect(dayCds(scaled).map((c) => c?.cd)).toEqual([34, 33, 67, 33, 33])
    const collapsed = applyWritesOptimistically(r0, [w], undefined, 'COLLAPSE')
    expect(row(collapsed).cells['W:2026-09-28']).toMatchObject({ cd: 200, resolution: 'WEEK' })
    expect(dayCds(collapsed).map((c) => c?.derived)).toEqual(Array(5).fill(true))
    expect(rowTotalDeltas([r0], [w], 'COLLAPSE').get('a-ivy')).toEqual({ total: -100, committed: -100 })
  })
  it('mixed granularities apply in runs (day edit, then the รวม total with COLLAPSE)', () => {
    const w: CellWrite = { taskAssignmentId: 'a-ivy', granularity: 'WEEK', period: '2026-09-28', cd: 400 }
    const r = applyWritesOptimistically(ivyWeek(), [wed, w], undefined, 'COLLAPSE')
    expect(row(r).cells['W:2026-09-28']).toMatchObject({ cd: 400, resolution: 'WEEK' })
  })
})

describe('applyServerResults — D cells of expanded weeks', () => {
  it('server weeks patch W and D cells', () => {
    const r = applyServerResults(ivyWeek(), {
      results: [
        {
          taskAssignmentId: 'a-ivy',
          version: 2,
          weeks: { '2026-09-28': { cd: 300, resolution: 'DAY', days: { '2026-09-28': 100, '2026-09-29': 100, '2026-09-30': 100 } } },
          rowTotal: { total: 300, committed: 300 },
        },
      ],
      warnings: [],
    })
    expect(dayCds(r).map((c) => c?.cd)).toEqual([100, 100, 100, undefined, undefined])
    expect(row(r).version).toBe(2)
  })
})
