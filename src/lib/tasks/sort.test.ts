import { describe, expect, it } from 'vitest'
import type { TaskDTO } from '@/lib/contracts/tasks'
import { sortRows, treeOpsEnabled } from './sort'
import { buildTaskRows } from './tree'

const task = (
  id: string,
  position: string,
  dueDate: string | null,
  parentId: string | null = null,
): TaskDTO => ({
  id,
  projectId: 'p1',
  parentId,
  depth: parentId === null ? 0 : 1,
  position,
  name: id,
  hasBody: false,
  startDate: null,
  dueDate,
  certaintyOverride: null,
  completedOn: null,
  assignees: [],
  statusId: 'todo',
  blockers: { open: 0, total: 0 },
  milestoneId: null,
  lateForMilestone: false,
})
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)

describe('FR-613 / M3-D7 sortRows', () => {
  const rows = buildTaskRows([
    task('a', 'a0', '2026-10-05'),
    task('b', 'a1', null),
    task('c', 'a2', '2026-09-30'),
  ])

  it("'due': due ascending, nulls last", () => {
    expect(sortRows(rows, 'due').map((r) => r.dueDate)).toEqual(['2026-09-30', '2026-10-05', null])
  })

  it("'due': ties (equal dates, several nulls) keep the tree (DFS) order", () => {
    const tied = buildTaskRows([
      task('P', 'a0', '2026-10-01'),
      task('K', 'a0', null, 'P'),
      task('Q', 'a1', '2026-10-01'),
      task('R', 'a2', null),
    ])
    expect(ids(sortRows(tied, 'due'))).toEqual(['P', 'Q', 'K', 'R'])
  })

  it("'manual' keeps the order; the input is never mutated", () => {
    const before = ids(rows)
    expect(ids(sortRows(rows, 'manual'))).toEqual(before)
    sortRows(rows, 'due')
    expect(ids(rows)).toEqual(before)
  })
})

describe('X62 treeOpsEnabled', () => {
  it.each([
    ['none', 'manual', true, true],
    ['none', 'manual', false, false],
    ['none', 'due', true, false],
    ['status', 'manual', true, false],
    ['assignee', 'manual', true, false],
    ['certainty', 'manual', true, false],
  ] as const)('groupBy %s, sort %s, canEdit %s → %s', (by, sort, canEdit, expected) => {
    expect(treeOpsEnabled(by, sort, canEdit)).toBe(expected)
  })
})
