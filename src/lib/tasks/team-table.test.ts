import { describe, expect, it } from 'vitest'
import type { TeamTaskCard } from '@/lib/contracts/tasks'
import {
  clampWidth,
  nextSort,
  setColumnWidth,
  sortCards,
  tableItems,
  TEAM_TABLE_DEFAULT_WIDTHS,
  toggleColumn,
  visibleColumns,
  type SortContext,
} from './team-table'

function card(id: string, o: Partial<TeamTaskCard> = {}): TeamTaskCard {
  return {
    id,
    projectId: 'p1',
    name: id,
    parentPath: [],
    status: { id: 's', name: 'ยังไม่เริ่ม', color: 'GRAY', category: 'TODO' },
    assigneeIds: [],
    dueDate: null,
    startDate: null,
    completedOn: null,
    certainty: 'CONFIRMED',
    completed: false,
    blockers: { open: 0, total: 0 },
    hasBody: false,
    milestoneId: null,
    plannedCd: 0,
    ...o,
  }
}

const names: Record<string, string> = { p1: 'ข้าว', p2: 'กล้วย', u1: 'Cindy', u2: 'Ivy' }
const ctx: SortContext = {
  projectName: (id) => names[id] ?? '',
  assigneeName: (c) => (c.assigneeIds[0] ? (names[c.assigneeIds[0]] ?? '') : ''),
  milestoneOf: (c) => (c.milestoneId ? { name: c.milestoneId, date: c.milestoneId === 'mA' ? '2026-11-01' : '2026-12-01' } : null),
}
const ids = (cs: readonly TeamTaskCard[]) => cs.map((c) => c.id)

describe('columns (FR-668)', () => {
  it('shows every column by default in a fixed order with default widths', () => {
    const cols = visibleColumns(undefined)
    expect(cols.map((c) => c.id)).toEqual([
      'name',
      'project',
      'status',
      'assignees',
      'startDate',
      'dueDate',
      'milestone',
      'blockers',
      'load',
    ])
    expect(cols[0]!.width).toBe(TEAM_TABLE_DEFAULT_WIDTHS.name)
  })

  it('hides and shows a column; the name column can never be hidden', () => {
    const hidden = toggleColumn(undefined, 'load')
    expect(hidden.hidden).toEqual(['load'])
    expect(visibleColumns(hidden).map((c) => c.id)).not.toContain('load')
    expect(toggleColumn(hidden, 'load').hidden).toEqual([])
    expect(toggleColumn(hidden, 'name')).toBe(hidden)
    expect(toggleColumn(toggleColumn(undefined, 'status'), 'project').hidden).toEqual(['project', 'status'])
  })

  it('stores widths clamped to 64..640 px', () => {
    expect(clampWidth(10)).toBe(64)
    expect(clampWidth(9999)).toBe(640)
    const p = setColumnWidth(undefined, 'project', 250.4)
    expect(p.widths.project).toBe(250)
    expect(visibleColumns(p).find((c) => c.id === 'project')!.width).toBe(250)
  })
})

describe('sort (FR-668)', () => {
  it('cycles none → asc → desc → none; another column restarts at asc', () => {
    const a = nextSort(null, 'name')
    expect(a).toEqual({ column: 'name', dir: 'asc' })
    const d = nextSort(a, 'name')
    expect(d).toEqual({ column: 'name', dir: 'desc' })
    expect(nextSort(d, 'name')).toBeNull()
    expect(nextSort(d, 'dueDate')).toEqual({ column: 'dueDate', dir: 'asc' })
  })

  it('no sort keeps the server order (a copy)', () => {
    const cs = [card('b'), card('a')]
    const out = sortCards(cs, null, ctx)
    expect(ids(out)).toEqual(['b', 'a'])
    expect(out).not.toBe(cs)
  })

  it('sorts names in Thai order both ways', () => {
    const cs = [card('ข'), card('ก'), card('ค')]
    expect(ids(sortCards(cs, { column: 'name', dir: 'asc' }, ctx))).toEqual(['ก', 'ข', 'ค'])
    expect(ids(sortCards(cs, { column: 'name', dir: 'desc' }, ctx))).toEqual(['ค', 'ข', 'ก'])
  })

  it('keeps empty dates last in both directions and ties in server order', () => {
    const cs = [
      card('none1'),
      card('late', { dueDate: '2026-12-01' }),
      card('early', { dueDate: '2026-11-01' }),
      card('none2'),
      card('early2', { dueDate: '2026-11-01' }),
    ]
    expect(ids(sortCards(cs, { column: 'dueDate', dir: 'asc' }, ctx))).toEqual([
      'early',
      'early2',
      'late',
      'none1',
      'none2',
    ])
    expect(ids(sortCards(cs, { column: 'dueDate', dir: 'desc' }, ctx))).toEqual([
      'late',
      'early',
      'early2',
      'none1',
      'none2',
    ])
  })

  it('sorts status by category then name, project by Thai name, load by cd', () => {
    const done = { id: 'd', name: 'เสร็จ', color: 'GREEN', category: 'DONE' as const }
    const doing = { id: 'i', name: 'กำลังทำ', color: 'BLUE', category: 'IN_PROGRESS' as const }
    const cs = [card('x', { status: done }), card('y', { status: doing }), card('z')]
    expect(ids(sortCards(cs, { column: 'status', dir: 'asc' }, ctx))).toEqual(['z', 'y', 'x'])
    const ps = [card('a', { projectId: 'p1' }), card('b', { projectId: 'p2' })]
    expect(ids(sortCards(ps, { column: 'project', dir: 'asc' }, ctx))).toEqual(['b', 'a'])
    const ls = [card('a', { plannedCd: 250 }), card('b', { plannedCd: 0 }), card('c', { plannedCd: 1000 })]
    expect(ids(sortCards(ls, { column: 'load', dir: 'desc' }, ctx))).toEqual(['c', 'a', 'b'])
  })

  it('sorts assignees by the first name (nobody last), milestones by date (none last), blockers by open', () => {
    const cs = [card('a', { assigneeIds: ['u2'] }), card('b'), card('c', { assigneeIds: ['u1'] })]
    expect(ids(sortCards(cs, { column: 'assignees', dir: 'asc' }, ctx))).toEqual(['c', 'a', 'b'])
    const ms = [card('a', { milestoneId: 'mB' }), card('b'), card('c', { milestoneId: 'mA' })]
    expect(ids(sortCards(ms, { column: 'milestone', dir: 'asc' }, ctx))).toEqual(['c', 'a', 'b'])
    expect(ids(sortCards(ms, { column: 'milestone', dir: 'desc' }, ctx))).toEqual(['a', 'c', 'b'])
    const bs = [card('a', { blockers: { open: 1, total: 2 } }), card('b'), card('c', { blockers: { open: 0, total: 1 } })]
    expect(ids(sortCards(bs, { column: 'blockers', dir: 'desc' }, ctx))).toEqual(['a', 'c', 'b'])
  })
})

describe('grouping (FR-668 จัดกลุ่มตามโปรเจค)', () => {
  const cs = [card('a', { projectId: 'p1' }), card('b', { projectId: 'p2' }), card('c', { projectId: 'p1' })]

  it('is off by default: rows only with row indexes', () => {
    const items = tableItems(cs, { groupByProject: false, projectName: ctx.projectName })
    expect(items.map((i) => (i.kind === 'row' ? `${i.card.id}${i.rowIndex}` : 'G'))).toEqual(['a0', 'b1', 'c2'])
  })

  it('groups by project in Thai name order, rows keep their order, row indexes count rows only', () => {
    const items = tableItems(cs, { groupByProject: true, projectName: ctx.projectName })
    expect(items.map((i) => (i.kind === 'row' ? `${i.card.id}${i.rowIndex}` : `G${i.projectId}:${i.count}`))).toEqual([
      'Gp2:1',
      'b0',
      'Gp1:2',
      'a1',
      'c2',
    ])
  })
})
