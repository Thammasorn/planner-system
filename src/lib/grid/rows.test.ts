import { describe, expect, it } from 'vitest'
import { gridResponse, posChunks, POS_PEOPLE, type FxTask } from './fixtures.test.data'
import { mergeChunks } from './merge'
import { buildViewRows, cellEditability, rowKeyOfAssignment, rowKeyOfTask } from './rows'

const open = { showCompleted: true, collapsed: new Set<string>() }

const TREE: FxTask[] = [
  { id: 'parent', name: 'แม่', assignees: [] },
  {
    id: 'child-a',
    name: 'ลูก A',
    parentId: 'parent',
    depth: 1,
    assignees: [{ taId: 'a-ca', userId: 'cindy', cells: { '2026-09-28': 100 } }],
  },
  { id: 'child-b', name: 'ลูก B', parentId: 'parent', depth: 1, assignees: [] },
  {
    id: 'pair',
    name: 'คู่',
    assignees: [
      { taId: 'a-jack', userId: 'jack', cells: { '2026-09-28': 300 } },
      {
        taId: 'a-mix',
        userId: 'mint',
        cells: { '2026-10-12': { days: { '2026-10-12': 50, '2026-10-13': 50 } } },
      },
    ],
  },
  {
    id: 'done',
    name: 'เสร็จแล้ว',
    completedWeek: '2026-09-28',
    assignees: [{ taId: 'a-done', userId: 'ivy', cells: { '2026-09-28': 100 } }],
  },
]
const people = { ...POS_PEOPLE, jack: { name: 'Jack' } }
const model = (o: { archived?: boolean; canEdit?: boolean } = {}) =>
  mergeChunks([gridResponse({ from: '2026-09-28', tasks: TREE, people, ...o })])!

describe('row keys (M6-D33)', () => {
  it('prefixes task and assignment ids', () => {
    expect(rowKeyOfTask('x')).toBe('t:x')
    expect(rowKeyOfAssignment('y')).toBe('a:y')
  })
})

describe('buildViewRows (FR-805, §8.3)', () => {
  it('merges single-assignee leaves: golden POS → 3 merged rows keyed a:<id>', () => {
    const rows = buildViewRows(mergeChunks(posChunks())!, open)
    expect(rows.map((r) => [r.kind, r.key])).toEqual([
      ['merged', 'a:a-cindy-pos'],
      ['merged', 'a:a-ivy-uat'],
      ['merged', 'a:a-mix-rollout'],
    ])
  })

  it('a task with two assignees → t: row + two a: rows; parents and unassigned leaves → t: rows', () => {
    const rows = buildViewRows(model(), open)
    expect(rows.map((r) => `${r.kind}:${r.key}:${r.depth}`)).toEqual([
      'task:t:parent:0',
      'merged:a:a-ca:1',
      'task:t:child-b:1',
      'task:t:pair:0',
      'assignee:a:a-jack:1',
      'assignee:a:a-mix:1',
      'merged:a:a-done:0',
    ])
  })

  it('hides completed tasks when showCompleted is false', () => {
    const rows = buildViewRows(model(), { showCompleted: false, collapsed: new Set() })
    expect(rows.some((r) => r.task.id === 'done')).toBe(false)
  })

  it('keeps a completed parent visible while a child is open', () => {
    const tree: FxTask[] = [
      { id: 'p', name: 'p', completedWeek: '2026-09-28', assignees: [] },
      { id: 'c', name: 'c', parentId: 'p', depth: 1, assignees: [] },
    ]
    const m = mergeChunks([gridResponse({ from: '2026-09-28', tasks: tree, people })])!
    expect(buildViewRows(m, { showCompleted: false, collapsed: new Set() }).map((r) => r.key)).toEqual([
      't:p',
      't:c',
    ])
  })

  it('collapsed parents hide their descendants', () => {
    const rows = buildViewRows(model(), { showCompleted: true, collapsed: new Set(['parent']) })
    expect(rows.map((r) => r.key).slice(0, 2)).toEqual(['t:parent', 't:pair'])
    expect(rows[0]?.kind === 'task' && rows[0].collapsed).toBe(true)
  })
})

describe('cellEditability (M6-D11)', () => {
  const m = model()
  const rows = buildViewRows(m, open)
  const byKey = (k: string) => rows.find((r) => r.key === k)!
  const cellOf = (k: string, p: `W:${string}`) => m.cells.get(k)?.get(p)

  it('ok on merged and assignee rows', () => {
    expect(cellEditability(byKey('a:a-ca'), cellOf('a:a-ca', 'W:2026-09-28'), m)).toBe('ok')
    expect(cellEditability(byKey('a:a-jack'), undefined, m)).toBe('ok')
  })
  it('parent and multi-assignee task rows are read-only sums', () => {
    expect(cellEditability(byKey('t:parent'), undefined, m)).toBe('readOnlyRow')
    expect(cellEditability(byKey('t:pair'), undefined, m)).toBe('readOnlyRow')
  })
  it('unassigned leaf → unassigned', () => {
    expect(cellEditability(byKey('t:child-b'), undefined, m)).toBe('unassigned')
  })
  it('DAY week → dayWeek', () => {
    expect(cellEditability(byKey('a:a-mix'), cellOf('a:a-mix', 'W:2026-10-12'), m)).toBe('dayWeek')
  })
  it('archived project → archived; canEdit false → noEdit', () => {
    const am = model({ archived: true })
    const ar = buildViewRows(am, open)
    expect(
      cellEditability(
        ar.find((r) => r.key === 'a:a-ca')!,
        undefined,
        am,
      ),
    ).toBe('archived')
    const nm = model({ canEdit: false })
    const nr = buildViewRows(nm, open)
    expect(
      cellEditability(
        nr.find((r) => r.key === 'a:a-ca')!,
        undefined,
        nm,
      ),
    ).toBe('noEdit')
  })
  it('completed and deactivated rows stay editable', () => {
    expect(cellEditability(byKey('a:a-done'), undefined, m)).toBe('ok')
  })
})
