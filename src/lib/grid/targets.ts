// src/lib/grid/targets.ts — (visible row, column) → TargetCell, the input of every gesture planner. Pure.
import type { LoadPair, PeriodKey } from '@/domain/types'
import type { AssigneeCell } from '@/lib/contracts/grid'
import type { TargetCell } from './apply'
import type { GridColumn } from './columns'
import type { GridModel } from './merge'
import { cellEditability, cellRowOf, type AnyViewRow, type ViewRow } from './rows'

/** The assignee cell of a merged / assignee row at a column. */
export function cellAt(m: GridModel, row: ViewRow, col: GridColumn): AssigneeCell | undefined {
  return row.kind === 'task' ? undefined : m.cells.get(row.key)?.get(col.key)
}

/** The capacity of the row's person for the column's period — W: week capacity, D: that day's (0 when unknown or a
 *  task row; a missing D: key means 0, M7-D19). */
export function capacityAt(m: GridModel, row: ViewRow, key: PeriodKey): number {
  return row.kind === 'task' ? 0 : (m.people[row.assignee.userId]?.capacity[key] ?? 0)
}

/** M7.1 (S3.3, BR-101): a `sum` row targets its single assignment through cellRowOf (exactly a merged row), else it is
 *  a summed task row whose editability is 'readOnlySum' / 'unassigned' (never distributed, D23). */
export function targetFor(
  m: GridModel,
  viewRow: AnyViewRow,
  col: GridColumn,
  taskTotals?: ReadonlyMap<string, Partial<Record<PeriodKey, LoadPair>>>,
  projectTotals?: ReadonlyMap<string, Partial<Record<PeriodKey, LoadPair>>>,
): TargetCell {
  // M9 person context: project / masked rows are read-only sums (copy reads their total)
  if (viewRow.kind === 'project' || viewRow.kind === 'masked') {
    const totals =
      viewRow.kind === 'project'
        ? (projectTotals?.get(viewRow.project.id) ?? viewRow.project.totals)
        : viewRow.masked.totals
    const total = totals[col.key]?.total ?? 0
    return {
      rowKey: viewRow.key,
      taskAssignmentId: null,
      week: col.weekStart,
      editability: 'readOnlyRow',
      capCd: 0,
      ...(total > 0 ? { cell: { cd: total, resolution: 'WEEK' as const, derived: false } } : {}),
      ...(col.kind === 'D' ? { granularity: 'DAY' as const, date: col.date } : {}),
    }
  }
  const row = cellRowOf(viewRow)
  const own = cellAt(m, row, col)
  const total = row.kind === 'task' ? (taskTotals?.get(row.task.id)?.[col.key]?.total ?? 0) : 0
  const cell: AssigneeCell | undefined =
    row.kind === 'task' ? (total > 0 ? { cd: total, resolution: 'WEEK', derived: false } : undefined) : own
  return {
    rowKey: row.key,
    taskAssignmentId: row.kind === 'task' ? null : row.assignee.taskAssignmentId,
    week: col.weekStart,
    editability: viewRow.kind === 'sum' ? cellEditability(viewRow, own, m) : cellEditability(row, own, m),
    capCd: capacityAt(m, row, col.key),
    ...(cell ? { cell } : {}),
    ...(col.kind === 'D' ? { granularity: 'DAY' as const, date: col.date } : {}),
  }
}

/** A lookup over visible rows × columns for the planners (null outside the grid). */
export function targetGrid(
  m: GridModel,
  rows: readonly AnyViewRow[],
  cols: readonly GridColumn[],
  taskTotals?: ReadonlyMap<string, Partial<Record<PeriodKey, LoadPair>>>,
  projectTotals?: ReadonlyMap<string, Partial<Record<PeriodKey, LoadPair>>>,
): (r: number, c: number) => TargetCell | null {
  return (r, c) => {
    const row = rows[r]
    const col = cols[c]
    return row && col ? targetFor(m, row, col, taskTotals, projectTotals) : null
  }
}
