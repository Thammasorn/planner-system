import { describe, expect, it } from 'vitest'
import type { TaskDTO } from '@/lib/contracts/tasks'
import { rangeSelect, toggleSelect, topLevelSelected } from './selection'
import { buildTaskRows } from './tree'

const task = (id: string, parentId: string | null, position: string): TaskDTO => ({
  id,
  projectId: 'p1',
  parentId,
  depth: 0,
  position,
  name: id,
  hasBody: false,
  startDate: null,
  dueDate: null,
  certaintyOverride: null,
  completedOn: null,
  assignees: [],
  statusId: 'todo',
  blockers: { open: 0, total: 0 },
})

describe('FR-614 selection', () => {
  it('toggleSelect adds and removes without mutating the input', () => {
    const sel = new Set(['a'])
    expect([...toggleSelect(sel, 'b')]).toEqual(['a', 'b'])
    expect([...toggleSelect(sel, 'a')]).toEqual([])
    expect([...sel]).toEqual(['a'])
  })

  it("rangeSelect(['a','b','c','d'], 'b', 'd') → {b,c,d}; the reverse anchor gives the same set", () => {
    const order = ['a', 'b', 'c', 'd']
    expect(rangeSelect(order, 'b', 'd')).toEqual(new Set(['b', 'c', 'd']))
    expect(rangeSelect(order, 'd', 'b')).toEqual(new Set(['b', 'c', 'd']))
    expect(rangeSelect(order, 'c', 'c')).toEqual(new Set(['c']))
  })

  it('rangeSelect with an anchor no longer in the list → only the target', () => {
    expect(rangeSelect(['a', 'b'], 'gone', 'b')).toEqual(new Set(['b']))
    expect(rangeSelect(['a', 'b'], 'a', 'gone')).toEqual(new Set())
  })

  it('M3-D23 topLevelSelected drops descendants of selected rows (DFS order)', () => {
    // A(B(C)), D(E)
    const rows = buildTaskRows([
      task('A', null, 'a0'),
      task('B', 'A', 'a0'),
      task('C', 'B', 'a0'),
      task('D', null, 'a1'),
      task('E', 'D', 'a0'),
    ])
    expect(topLevelSelected(rows, new Set(['A', 'B']))).toEqual(['A'])
    expect(topLevelSelected(rows, new Set(['C', 'A']))).toEqual(['A'])
    expect(topLevelSelected(rows, new Set(['E', 'B', 'C']))).toEqual(['B', 'E'])
    expect(topLevelSelected(rows, new Set(['missing']))).toEqual([])
  })
})
