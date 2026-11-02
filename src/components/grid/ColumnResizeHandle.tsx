'use client'
// src/components/grid/ColumnResizeHandle.tsx — ⇔ at the right edge of the "งาน" header (SPEC FR-814, AC-808, M7.1-D9).
// A focusable separator (role="separator", vertical, aria-valuemin/max/now) in the grid's single-Tab-stop model (§8.9,
// S3.8): it is tabbable only while a row header is selected (Shift+Space, then Shift+Tab reaches it — like ⠿ / ↗ / ×
// inside the selected row) or while it has focus itself; otherwise the body keeps the grid's one Tab stop.
import { useId, useState, type JSX } from 'react'
import { th } from '@/i18n/th'
import { useGridSel, type GridStore } from './gridStore'
import { useColumnResize, type ColumnResizeOptions } from './useColumnResize'
import styles from './grid.module.css'

export interface ColumnResizeHandleProps extends ColumnResizeOptions {
  store: GridStore
}

export function ColumnResizeHandle(p: ColumnResizeHandleProps): JSX.Element {
  const r = useColumnResize(p)
  const rowSelected = useGridSel(p.store, (s) => s.rowSelection !== null)
  const [focused, setFocused] = useState(false)
  const hintId = useId()
  return (
    <>
      <span id={hintId} className={styles.srOnly}>
        {th.grid.columns.resizeHint}
      </span>
      <div
      role="separator"
      aria-orientation="vertical"
      aria-label={th.grid.columns.resize}
      aria-describedby={hintId}
      aria-valuemin={r.min}
      aria-valuemax={r.max}
      aria-valuenow={p.width}
      tabIndex={rowSelected || focused ? 0 : -1}
      className={styles.resizeHandle}
      data-testid="task-column-resize"
      onPointerDown={r.onPointerDown}
      onPointerMove={r.onPointerMove}
      onPointerUp={r.onPointerUp}
      onPointerCancel={r.onPointerCancel}
      onLostPointerCapture={r.onPointerCancel}
      onKeyDown={r.onKeyDown}
      onDoubleClick={r.onDoubleClick}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={(e) => e.stopPropagation()}
      />
    </>
  )
}
