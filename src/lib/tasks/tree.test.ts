import { describe, expect, it } from 'vitest'
import type { TaskDTO } from '@/lib/contracts/tasks'
import { buildTaskRows, isSubtreeComplete, openDescendants, unionAssigneeIds, visibleRows } from './tree'

const DONE = '2026-09-28'
const task = (id: string, parentId: string | null, position: string, x: Partial<TaskDTO> = {}): TaskDTO => ({
  id,
  projectId: 'p1',
  parentId,
  depth: 0,
  position,
  name: `name-${id}`,
  hasBody: false,
  startDate: null,
  dueDate: null,
  certaintyOverride: null,
  completedOn: null,
  assignees: [],
  statusId: 'todo',
  blockers: { open: 0, total: 0 },
  ...x,
})
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)
const none = { collapsed: new Set<string>(), showCompleted: true }

describe('buildTaskRows', () => {
  // A(B, C(G)), D — given out of order
  const tasks = [
    task('D', null, 'a1'),
    task('G', 'C', 'a0', { depth: 2 }),
    task('C', 'A', 'a1', { depth: 1 }),
    task('A', null, 'a0'),
    task('B', 'A', 'a0', { depth: 1 }),
  ]

  it('DFS order with depth, hasChildren, isLeaf and the parent path (root first)', () => {
    const rows = buildTaskRows(tasks)
    expect(rows.map((r) => [r.id, r.depth, r.hasChildren, r.isLeaf, r.parentPath])).toEqual([
      ['A', 0, true, false, []],
      ['B', 1, false, true, ['name-A']],
      ['C', 1, true, false, ['name-A']],
      ['G', 2, false, true, ['name-A', 'name-C']],
      ['D', 0, false, true, []],
    ])
  })

  it('keeps every TaskDTO field', () => {
    const row = buildTaskRows([task('A', null, 'a0', { hasBody: true, dueDate: '2026-10-05' })])[0]
    expect(row).toMatchObject({ hasBody: true, dueDate: '2026-10-05', statusId: 'todo', projectId: 'p1' })
  })
})

describe('FR-607 / M3-D6 visibleRows', () => {
  it('a completed parent whose children are all completed is hidden with them when showCompleted is off', () => {
    const rows = buildTaskRows([
      task('P', null, 'a0', { completedOn: DONE }),
      task('C1', 'P', 'a0', { depth: 1, completedOn: DONE }),
      task('C2', 'P', 'a1', { depth: 1, completedOn: DONE }),
      task('X', null, 'a1'),
    ])
    expect(ids(visibleRows(rows, { collapsed: new Set(), showCompleted: false }))).toEqual(['X'])
  })

  it('a completed parent with one open child stays visible with the open child; the done child is hidden', () => {
    const rows = buildTaskRows([
      task('P', null, 'a0', { completedOn: DONE }),
      task('C1', 'P', 'a0', { depth: 1 }),
      task('C2', 'P', 'a1', { depth: 1, completedOn: DONE }),
    ])
    expect(ids(visibleRows(rows, { collapsed: new Set(), showCompleted: false }))).toEqual(['P', 'C1'])
  })

  it('showCompleted on → completed rows stay', () => {
    const rows = buildTaskRows([task('P', null, 'a0', { completedOn: DONE })])
    expect(ids(visibleRows(rows, none))).toEqual(['P'])
  })

  it('a collapsed parent hides its descendants but stays visible', () => {
    const rows = buildTaskRows([
      task('A', null, 'a0'),
      task('B', 'A', 'a0', { depth: 1 }),
      task('BB', 'B', 'a0', { depth: 2 }),
      task('D', null, 'a1'),
    ])
    expect(ids(visibleRows(rows, { collapsed: new Set(['A']), showCompleted: true }))).toEqual(['A', 'D'])
    expect(ids(visibleRows(rows, { collapsed: new Set(['B']), showCompleted: true }))).toEqual([
      'A',
      'B',
      'D',
    ])
  })
})

describe('isSubtreeComplete / openDescendants / unionAssigneeIds', () => {
  const rows = buildTaskRows([
    task('P', null, 'a0', { completedOn: DONE }),
    task('C1', 'P', 'a0', {
      depth: 1,
      assignees: [
        { assignmentId: 'as1', userId: 'cindy' },
        { assignmentId: 'as2', userId: 'ivy' },
      ],
    }),
    task('C2', 'P', 'a1', {
      depth: 1,
      completedOn: DONE,
      assignees: [{ assignmentId: 'as3', userId: 'ivy' }],
    }),
    task('C3', 'P', 'a2', { depth: 1 }),
    task('G', 'C3', 'a0', { depth: 2, assignees: [{ assignmentId: 'as4', userId: 'mint' }] }),
  ])

  it('isSubtreeComplete is true only when the row and every descendant are completed', () => {
    expect(isSubtreeComplete(rows, 'P')).toBe(false)
    expect(isSubtreeComplete(rows, 'C2')).toBe(true)
    expect(isSubtreeComplete(rows, 'C1')).toBe(false)
    expect(isSubtreeComplete(rows, 'missing')).toBe(false)
  })

  it('openDescendants lists open descendants in DFS order (FR-608)', () => {
    expect(openDescendants(rows, 'P')).toEqual(['C1', 'C3', 'G'])
    expect(openDescendants(rows, 'C2')).toEqual([])
    expect(openDescendants(rows, 'missing')).toEqual([])
  })

  it('unionAssigneeIds: distinct user ids of the subtree, first-seen DFS order', () => {
    expect(unionAssigneeIds(rows, 'P')).toEqual(['cindy', 'ivy', 'mint'])
    expect(unionAssigneeIds(rows, 'C2')).toEqual(['ivy'])
    expect(unionAssigneeIds(rows, 'missing')).toEqual([])
  })
})
