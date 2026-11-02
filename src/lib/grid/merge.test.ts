import { describe, expect, it } from 'vitest'
import { fxMilestone, gridResponse, posChunks, POS_PEOPLE, POS_TASKS } from './fixtures.test.data'
import { mergeChunks } from './merge'

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
    const mint = m.cells.get('a:a-mix-rollout')!
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
    const ids = m.rows.map((r) => (r.kind === 'task' ? r.id : r.taskAssignmentId))
    expect(ids).toEqual(['t-pos', 'a-cindy-pos', 't-new', 't-uat', 'a-ivy-uat', 't-rollout', 'a-mix-rollout'])
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
