'use client'
// src/components/grid/DropIndicator.tsx — where a dragged task row will land (SPEC FR-815, M7.1-D16): a line above view
// row `indicatorIndex` across the row, with a depth marker indented like the task cell (sticky inside the frozen
// column) and, for an invalid spot, th.grid.reorder.invalid in text (never colour alone). aria-live announces it.
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import { HEADER_TOTAL_H, ROW_H } from '@/lib/grid/columns'
import styles from './grid.module.css'

export interface DropIndicatorProps {
  indicatorIndex: number
  depth: number
  valid: boolean
  width: number
}

export function DropIndicator(p: DropIndicatorProps): JSX.Element | null {
  if (p.indicatorIndex < 0) return null
  return (
    <div
      className={styles.dropIndicator}
      style={{ top: HEADER_TOTAL_H + p.indicatorIndex * ROW_H - 1, width: p.width }}
      data-testid="drop-indicator"
      data-valid={p.valid ? 'true' : 'false'}
      data-depth={p.depth}
      data-index={p.indicatorIndex}
    >
      <span
        className={styles.dropMarker}
        style={{ marginLeft: `calc(var(--space-2) + ${p.depth} * var(--space-4))` }}
        role="status"
        aria-live="polite"
      >
        {p.valid ? null : th.grid.reorder.invalid}
      </span>
    </div>
  )
}
