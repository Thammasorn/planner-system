import { describe, expect, it } from 'vitest'
import { footerTotals, footerValue, rowTotalView, taskRowTotals, taskTotals } from './aggregate'
import { CRM_TASKS, gridResponse, posChunks, POS_PEOPLE, type FxTask } from './fixtures.test.data'
import { mergeChunks } from './merge'
import { buildViewRows } from './rows'

const open = { showCompleted: true, collapsed: new Set<string>() }
const pos = mergeChunks(posChunks())!

describe('footerTotals (FR-806, M6-D8, golden POS r8 §6.3)', () => {
  const f = footerTotals(pos, { includeOthers: false })

  it('sums every counted assignee cell per week', () => {
    expect(f.cells['W:2026-09-14']?.load.total).toBe(625)
    expect(f.cells['W:2026-09-21']?.load.total).toBe(500)
    expect(f.cells['W:2026-09-28']?.load.total).toBe(500)
    expect(f.cells['W:2026-10-05']?.load.total).toBe(125)
    expect(f.cells['W:2026-11-02']?.load.total).toBe(0)
  })

  it('capacity is the sum of the people in the grid; % is integer half-up', () => {
    expect(f.cells['W:2026-09-14']?.capacityCd).toBe(1500)
    expect(f.cells['W:2026-09-14']?.utilizationPct).toBe(42)
    expect(footerValue(f.cells['W:2026-09-14']!, 'ALL')).toEqual({ loadCd: 625, pct: 42 })
  })

  it('people are sorted by name', () => {
    expect(f.people).toEqual(['cindy', 'ivy', 'mint'])
  })

  it('views split committed and at-risk (FR-809)', () => {
    expect(footerValue(f.cells['W:2026-12-14']!, 'AT_RISK').loadCd).toBe(500)
    expect(footerValue(f.cells['W:2026-12-14']!, 'COMMITTED').loadCd).toBe(0)
    const crm = mergeChunks([
      gridResponse({
        from: '2026-10-05',
        tasks: CRM_TASKS,
        people: { cindy: { name: 'Cindy' }, ivy: { name: 'Ivy' } },
      }),
    ])!
    const fc = footerTotals(crm, { includeOthers: false })
    expect(footerValue(fc.cells['W:2026-10-12']!, 'COMMITTED')).toEqual({ loadCd: 0, pct: 0 })
    expect(footerValue(fc.cells['W:2026-10-12']!, 'ALL')).toEqual({ loadCd: 500, pct: 50 })
  })

  it('includeOthers adds the other projects (numbers only, X29)', () => {
    const r = gridResponse({
      from: '2026-08-31',
      includeOthers: true,
      tasks: [],
      people: { cindy: { name: 'Cindy', otherProjects: { '2026-09-28': { total: 250, committed: 250 } } } },
    })
    const m = mergeChunks([r])!
    expect(footerTotals(m, { includeOthers: true }).cells['W:2026-09-28']?.load).toEqual({
      total: 250,
      committed: 250,
    })
    expect(footerTotals(m, { includeOthers: false }).cells['W:2026-09-28']?.load).toEqual({
      total: 0,
      committed: 0,
    })
  })

  it('capacity 0 → pct null', () => {
    const m = mergeChunks([
      gridResponse({ from: '2026-08-31', tasks: [], people: { cindy: { name: 'Cindy', defaultCapacity: 0 } } }),
    ])!
    const c = footerTotals(m, { includeOthers: false }).cells['W:2026-08-31']!
    expect(c.utilizationPct).toBeNull()
    expect(footerValue(c, 'ALL').pct).toBeNull()
  })

  it('weeks after completedWeek are not counted (BR-50)', () => {
    const tasks: FxTask[] = [
      {
        id: 'd',
        name: 'd',
        completedWeek: '2026-09-28',
        assignees: [{ taId: 'a', userId: 'cindy', cells: { '2026-09-28': 100, '2026-10-05': 200 } }],
      },
    ]
    const m = mergeChunks([gridResponse({ from: '2026-09-28', tasks, people: POS_PEOPLE })])!
    const f2 = footerTotals(m, { includeOthers: false })
    expect(f2.cells['W:2026-09-28']?.load.total).toBe(100)
    expect(f2.cells['W:2026-10-05']?.load.total).toBe(0)
    expect(taskTotals(m, buildViewRows(m, open)).get('d')?.['W:2026-10-05']).toBeUndefined()
  })
})

describe('taskTotals / taskRowTotals (FR-805)', () => {
  const tree: FxTask[] = [
    { id: 'p', name: 'p', assignees: [] },
    {
      id: 'c1',
      name: 'c1',
      parentId: 'p',
      depth: 1,
      assignees: [{ taId: 'a1', userId: 'cindy', cells: { '2026-09-28': 100 } }],
    },
    {
      id: 'c2',
      name: 'c2',
      parentId: 'p',
      depth: 1,
      certainty: 'TENTATIVE',
      assignees: [
        { taId: 'a2', userId: 'ivy', cells: { '2026-09-28': 250 } },
        { taId: 'a3', userId: 'mint', cells: { '2026-09-28': 50, '2026-10-05': 25 } },
      ],
    },
  ]
  const m = mergeChunks([gridResponse({ from: '2026-09-28', tasks: tree, people: POS_PEOPLE })])!
  const totals = taskTotals(m, buildViewRows(m, open))

  it('parent totals = Σ children; tentative counts in total only', () => {
    expect(totals.get('c2')?.['W:2026-09-28']).toEqual({ total: 300, committed: 0 })
    expect(totals.get('p')?.['W:2026-09-28']).toEqual({ total: 400, committed: 100 })
    expect(totals.get('p')?.['W:2026-10-05']).toEqual({ total: 25, committed: 0 })
  })

  it('task "รวม" = Σ of its leaves rowTotal', () => {
    const rt = taskRowTotals(m)
    expect(rt.get('c2')).toEqual({ total: 325, committed: 0 })
    expect(rt.get('p')).toEqual({ total: 425, committed: 100 })
    expect(rowTotalView(rt.get('p')!, 'AT_RISK')).toBe(325)
  })
})
