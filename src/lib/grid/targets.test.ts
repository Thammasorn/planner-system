import { describe, expect, it } from 'vitest'
import { taskTotals } from './aggregate'
import { buildColumns, timelineWeeks } from './columns'
import { gridResponse, POS_PEOPLE, type FxTask } from './fixtures.test.data'
import { mergeChunks } from './merge'
import { buildViewRows } from './rows'
import { targetGrid } from './targets'

const tasks: FxTask[] = [
  {
    id: 'pair',
    name: 'pair',
    assignees: [
      { taId: 'a1', userId: 'cindy', cells: { '2026-09-28': 300 } },
      { taId: 'a2', userId: 'ivy', cells: { '2026-09-28': 200 } },
    ],
  },
]
const m = mergeChunks([
  gridResponse({
    from: '2026-09-28',
    tasks,
    people: { ...POS_PEOPLE, ivy: { name: 'Ivy', capacity: { '2026-09-28': 300 } } },
  }),
])!
const rows = buildViewRows(m, { showCompleted: true, collapsed: new Set() })
const cols = buildColumns(timelineWeeks('2026-09-30'), new Set(), new Map())
const at = targetGrid(m, rows, cols, taskTotals(m, rows))

describe('targetGrid', () => {
  it('assignee targets carry their assignment, cell and own capacity', () => {
    expect(at(2, 156)).toEqual({
      rowKey: 'a:a2',
      taskAssignmentId: 'a2',
      week: '2026-09-28',
      editability: 'ok',
      capCd: 300,
      cell: { cd: 200, resolution: 'WEEK', derived: false },
    })
  })
  it('task rows are read-only sums with the total as their cell', () => {
    const t = at(0, 156)!
    expect(t.editability).toBe('readOnlyRow')
    expect(t.taskAssignmentId).toBeNull()
    expect(t.cell?.cd).toBe(500)
  })
  it('null outside the grid', () => {
    expect(at(9, 0)).toBeNull()
    expect(at(0, 999)).toBeNull()
  })
})
