// src/lib/grid/row-select.ts — multi-select of task rows in the frozen row header (FR-6xx grid row menu, v3.8).
// A plain click selects one row; Mod+click toggles a row; Shift+click selects the task rows between the anchor and the
// clicked row. Only task-owning rows (task / merged / sum) join a multi-selection — assignee rows have no task of
// their own to delete. `rowSelection` (the focused row) is always a member; `rowSelection === null` = nothing.
import type { RowKey } from './rows'

export interface RowSelectState {
  rowSelection: RowKey | null
  rowKeys: ReadonlySet<RowKey>
  rowAnchor: RowKey | null
}

export interface RowLike {
  key: RowKey
  kind: string
}

export const EMPTY_ROW_KEYS: ReadonlySet<RowKey> = new Set()

/** Rows that can join a multi-selection (own a task). */
export const ownsTask = (r: RowLike): boolean =>
  r.kind === 'task' || r.kind === 'merged' || r.kind === 'sum'

/** Is `key` selected? Stale `rowKeys` (the focused row is not in them) count as a single-row selection. */
export function isRowSelected(s: RowSelectState, key: RowKey): boolean {
  if (s.rowSelection === null) return false
  if (s.rowSelection === key) return true
  return s.rowKeys.has(s.rowSelection) && s.rowKeys.has(key)
}

/** The selected row keys in selection order ([] when nothing is selected). */
export function selectedRowKeys(s: RowSelectState): RowKey[] {
  if (s.rowSelection === null) return []
  return s.rowKeys.has(s.rowSelection) ? [...s.rowKeys] : [s.rowSelection]
}

/** Plain click / Shift+Space: one row. */
export function selectOne(key: RowKey): RowSelectState {
  return { rowSelection: key, rowKeys: new Set([key]), rowAnchor: key }
}

/** Mod+click: toggle a task row in or out of the selection (assignee rows fall back to a plain click). */
export function toggleRow(s: RowSelectState, row: RowLike): RowSelectState {
  if (!ownsTask(row)) return selectOne(row.key)
  const current = new Set(selectedRowKeys(s))
  if (current.has(row.key)) {
    current.delete(row.key)
    const rest = [...current]
    const last = rest[rest.length - 1] ?? null
    return { rowSelection: last, rowKeys: current, rowAnchor: last }
  }
  current.add(row.key)
  return { rowSelection: row.key, rowKeys: current, rowAnchor: row.key }
}

/** Shift+click: the task rows between the anchor and `row` (inclusive, view order); the anchor stays. */
export function rangeRows(s: RowSelectState, rows: readonly RowLike[], row: RowLike): RowSelectState {
  const anchor = s.rowAnchor ?? s.rowSelection
  const a = anchor === null ? -1 : rows.findIndex((x) => x.key === anchor)
  const b = rows.findIndex((x) => x.key === row.key)
  if (a < 0 || b < 0 || !ownsTask(row)) return selectOne(row.key)
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  const keys = new Set<RowKey>()
  for (let i = lo; i <= hi; i++) {
    const x = rows[i]
    if (x && ownsTask(x)) keys.add(x.key)
  }
  return { rowSelection: row.key, rowKeys: keys, rowAnchor: anchor }
}

/** The distinct task ids of the selected task rows, in view order (assignee rows are ignored). */
export function selectedTaskIds<R extends RowLike & { task: { id: string } }>(
  s: RowSelectState,
  rows: readonly R[],
): string[] {
  const keys = new Set(selectedRowKeys(s))
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!keys.has(r.key) || !ownsTask(r) || seen.has(r.task.id)) continue
    seen.add(r.task.id)
    out.push(r.task.id)
  }
  return out
}
