// src/lib/tasks/sort.ts — list sort (FR-613, M3-D7) and the tree-ops switch (X62).
import { compareISO } from '@/domain/dates'
import type { GroupBy } from './group'
import type { TaskRowModel } from './tree'

export type SortBy = 'manual' | 'due'

/** 'manual' = tree (DFS) order; 'due' = flat list, due ascending, nulls last, then tree order. Returns a copy. */
export function sortRows(rows: readonly TaskRowModel[], by: SortBy): TaskRowModel[] {
  if (by === 'manual') return [...rows]
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = a.row.dueDate
      const y = b.row.dueDate
      const byDue = x === y ? 0 : x === null ? 1 : y === null ? -1 : compareISO(x, y)
      return byDue || a.index - b.index
    })
    .map((e) => e.row)
}

/** Tab/Shift+Tab, drag and move menu items work only ungrouped, in manual order, with edit rights (M3-D7). */
export const treeOpsEnabled = (by: GroupBy, sort: SortBy, canEdit: boolean): boolean =>
  by === 'none' && sort === 'manual' && canEdit
