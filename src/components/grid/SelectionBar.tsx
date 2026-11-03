'use client'
// src/components/grid/SelectionBar.tsx — v3.9 (owner feedback, FR-821): "เลือก N งาน · ลบ · ยกเลิก" while the row
// header is in check mode (☐ / Mod+click / Shift+click, src/lib/grid/row-select.ts). Floats over the top of the grid
// (a zero-height anchor, so nothing under the pointer moves). ลบ = the same delete as the Delete key (undo toast + Cmd+Z).
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import { inCheckMode, selectedTaskIds } from '@/lib/grid/row-select'
import { isTaskViewRow, type AnyViewRow } from '@/lib/grid/rows'
import { useGridSel, type GridStore } from './gridStore'
import styles from './grid.module.css'

export interface SelectionBarProps {
  store: GridStore
  viewRows: readonly AnyViewRow[]
  onDelete: () => void
  onClear: () => void
}

export function SelectionBar(p: SelectionBarProps): JSX.Element | null {
  const keys = useGridSel(p.store, (s) => (inCheckMode(s) ? s.rowKeys : null))
  const sel = p.store.get()
  const n = keys === null ? 0 : selectedTaskIds(sel, p.viewRows.filter(isTaskViewRow)).length
  if (n === 0) return null
  return (
    <div className={styles.selBarAnchor}>
      <div
        className={styles.selBar}
        role="toolbar"
        aria-label={th.grid.row.selBarLabel}
        data-testid="grid-selection-bar"
      >
        <span className={styles.selBarCount} role="status" aria-live="polite" data-count={n}>
          {th.grid.row.selBarCount(n)}
        </span>
        <button
          type="button"
          className={styles.selBarDelete}
          onClick={p.onDelete}
          data-testid="grid-selection-delete"
        >
          {th.grid.row.selBarDelete}
        </button>
        <button
          type="button"
          className={styles.selBarButton}
          onClick={p.onClear}
          data-testid="grid-selection-clear"
        >
          {th.grid.row.selBarClear}
        </button>
      </div>
    </div>
  )
}
