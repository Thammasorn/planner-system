'use client'
// src/components/grid/FooterCell.tsx — ★ one memoised footer cell (FR-806, M6-D33). M7 adds day cells / tones, M9 week
// tones (C87) through additive props.
import { memo } from 'react'
import styles from './grid.module.css'

export interface FooterCellProps {
  /** 'load' | 'capacity' | 'util' */
  kind: 'load' | 'capacity' | 'util'
  periodKey: string
  colIndex: number
  left: number
  width: number
  text: string
  label?: string
}

export const FooterCell = memo(function FooterCell({
  kind,
  periodKey,
  colIndex,
  left,
  width,
  text,
  label,
}: FooterCellProps) {
  return (
    <div
      role="gridcell"
      aria-colindex={colIndex + 2}
      aria-readonly="true"
      aria-label={label}
      className={styles.footerCell}
      style={{ left, width }}
      data-testid={`cell-footer-${kind}-${periodKey}`}
    >
      {text}
    </div>
  )
})
