import { describe, expect, it } from 'vitest'
import type { GridRow } from '@/lib/contracts/grid'
import { fxMilestone, gridResponse, posChunks, POS_PEOPLE, POS_TASKS } from './fixtures.test.data'
import { mergeChunks } from './merge'
import { ivyResponse } from './person.test.data'

describe('mergeChunks (PLAN §3.10, C87)', () => {
  it('returns null without any chunk', () => {
    expect(mergeChunks([])).toBeNull()
    expect(mergeChunks([undefined, undefined])).toBeNull()
  })

  it('merges two adjacent chunks: one row per id, all 16 weeks, ordered periods, people from both', () => {
    const [a, b] = posChunks()
    const m = mergeChunks([a, b])!
    expect(m.rows.filter((r) => r.kind === 'task')).toHaveLength(3)
    expect(m.rows.filter((r) => r.kind === 'assignee')).toHaveLength(3)
    expect(m.periods).toHaveLength(16)
    expect(m.periods[0]?.key).toBe('W:2026-08-31')
    expect(m.periods[15]?.key).toBe('W:2026-12-14')
    expect(new Set(m.periods.map((p) => p.key)).size).toBe(16)
    expect(m.loadedWeeks.size).toBe(16)
    const cindy = m.cells.get('a:a-cindy-pos')!
    expect(cindy.get('W:2026-08-31')?.cd).toBe(500)
    const mint = m.cells.get('a:a-mint-rollout')!
    expect(mint.get('W:2026-12-14')?.cd).toBe(500)
    expect(m.people.cindy?.capacity['W:2026-08-31']).toBe(500)
    expect(m.people.cindy?.capacity['W:2026-12-14']).toBe(500)
  })

  it('is order-independent for cells and keeps timeline order of periods', () => {
    const [a, b] = posChunks()
    const m = mergeChunks([b, undefined, a])!
    expect(m.periods[0]?.key).toBe('W:2026-08-31')
    expect(m.cells.get('a:a-cindy-pos')?.get('W:2026-09-14')?.cd).toBe(375)
  })

  it('unions rows that only one chunk has (inserted after their predecessor)', () => {
    const extra = [
      ...POS_TASKS.slice(0, 1),
      { id: 't-new', name: 'ใหม่', assignees: [] },
      ...POS_TASKS.slice(1),
    ]
    const a = gridResponse({ from: '2026-08-31', tasks: POS_TASKS, people: POS_PEOPLE })
    const b = gridResponse({ from: '2026-10-26', tasks: extra, people: POS_PEOPLE })
    const m = mergeChunks([b, a])!
    const ids = m.rows.map((r) =>
      r.kind === 'task' ? r.id : r.kind === 'assignee' ? r.taskAssignmentId : r.kind,
    )
    expect(ids).toEqual(['t-pos', 'a-cindy-pos', 't-new', 't-uat', 'a-ivy-uat', 't-rollout', 'a-mint-rollout'])
  })

  it('maps holidays by date', () => {
    const a = gridResponse({
      from: '2026-08-31',
      tasks: [],
      people: {},
      holidays: [{ date: '2026-10-13', name: 'วันนวมินทรมหาราช' }],
    })
    expect(mergeChunks([a])!.holidays.get('2026-10-13')).toBe('วันนวมินทรมหาราช')
  })

  it('M8 (S3.2, M8-D8): milestones come from the latest chunk (every chunk carries the full list); canManage from its context', () => {
    const a = gridResponse({
      from: '2026-08-31',
      tasks: POS_TASKS,
      people: POS_PEOPLE,
      milestones: [fxMilestone('m1', '2026-10-02')],
    })
    const b = gridResponse({
      from: '2026-10-26',
      tasks: POS_TASKS,
      people: POS_PEOPLE,
      canManage: true,
      milestones: [fxMilestone('m1', '2026-10-09'), fxMilestone('m2', '2026-11-20')],
    })
    const m = mergeChunks([a, b])!
    expect(m.milestones.map((x) => [x.id, x.date])).toEqual([
      ['m1', '2026-10-09'],
      ['m2', '2026-11-20'],
    ])
    expect(m.context.canManage).toBe(true)
    expect(mergeChunks([b, a])!.milestones.map((x) => x.id)).toEqual(['m1'])
  })
})

describe('mergeChunks — person context (M9 S3.1)', () => {
  const masked = (m: { rows: GridRow[] }) => m.rows.find((r) => r.kind === 'masked')
  it('a masked row present only in the second chunk appears once, last, with that chunk\'s keys', () => {
    const a = ivyResponse({ from: '2026-09-28' })
    const b = ivyResponse({ from: '2026-11-23', masked: { '2026-11-30': { total: 200, committed: 100 } } })
    const m = mergeChunks([a, b])!
    const rows = m.rows.filter((r) => r.kind === 'masked')
    expect(rows).toHaveLength(1)
    expect(m.rows[m.rows.length - 1]?.kind).toBe('masked')
    expect(rows[0]?.kind === 'masked' && rows[0].totals['W:2026-11-30']).toEqual({ total: 200, committed: 100 })
  })
  it('masked totals are unioned per period key over chunks', () => {
    const a = ivyResponse({ from: '2026-09-28', masked: { '2026-10-05': { total: 500, committed: 500 } } })
    const b = ivyResponse({ from: '2026-11-23', masked: { '2026-11-30': { total: 100, committed: 0 } } })
    for (const order of [[a, b], [b, a]]) {
      const row = masked(mergeChunks(order)!)
      expect(row?.kind === 'masked' && Object.keys(row.totals).sort()).toEqual(['W:2026-10-05', 'W:2026-11-30'])
    }
  })
  it('project rows are merged by id with totals unioned; one row per project, in order', () => {
    const a = ivyResponse({ from: '2026-09-28' })
    const b = ivyResponse({ from: '2026-11-23' })
    const m = mergeChunks([a, b])!
    const projects = m.rows.filter((r) => r.kind === 'project')
    expect(projects.map((p) => p.kind === 'project' && p.id)).toEqual(['p-crm', 'p-pos'])
    const crm = projects[0]
    expect(crm?.kind === 'project' && crm.totals['W:2026-10-12']).toEqual({ total: 250, committed: 0 })
    expect(crm?.kind === 'project' && crm.totals['W:2026-11-23']).toBeUndefined()
    const keys = m.rows.map((r) =>
      r.kind === 'project' ? `p:${r.id}` : r.kind === 'task' ? `t:${r.id}` : r.kind === 'assignee' ? `a:${r.taskAssignmentId}` : `m:${r.userId}`,
    )
    expect(keys).toEqual(['p:p-crm', 't:t-crm-auto', 'a:a-ivy-crm', 'p:p-pos', 't:t-uat', 'a:a-ivy-uat'])
    expect(m.context).toMatchObject({ kind: 'person', id: 'ivy', canManage: false })
  })
})
