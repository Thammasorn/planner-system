'use client'
// src/components/grid/FooterCell.tsx — ★ one memoised footer cell (FR-806, M6-D33). M7 (S3.10, X06/X67, M7-D13): day
// cells of the ภาระรวม row carry the BR-45 tone (data-tone / data-palette) AND the BR-40 glyph + number — never the
// colour alone; M9 adds week tones through the same additive props (C87).
import { memo } from 'react'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import type { LoadTone, OverloadLevel } from '@/domain/overload'
import { periodColIndex } from '@/lib/grid/columns'
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
  /** M7: BR-45 tone of a day load cell */
  tone?: LoadTone
  palette?: 'load' | 'tentative'
  /** M7: the worst person's BR-40 level (OK = no glyph) and its text */
  glyph?: OverloadLevel
  glyphLabel?: string
  /** M7: the shared tooltip lists the people over capacity */
  tip?: boolean
  /** M7.1 (FR-818): first column of a month */
  monthStart?: boolean
}

export const FooterCell = memo(function FooterCell({
  kind,
  periodKey,
  colIndex,
  left,
  width,
  text,
  label,
  tone,
  palette,
  glyph,
  glyphLabel,
  tip,
  monthStart,
}: FooterCellProps) {
  return (
    <div
      role="gridcell"
      aria-colindex={periodColIndex(colIndex)}
      aria-readonly="true"
      aria-label={label}
      className={styles.footerCell}
      style={{ left, width }}
      data-testid={`cell-footer-${kind}-${periodKey}`}
      data-tone={tone}
      data-palette={tone ? palette : undefined}
      data-tip={tip ? 'footer' : undefined}
      data-period={periodKey}
      data-month-start={monthStart ? '' : undefined}
    >
      {glyph && glyph !== 'OK' ? (
        <StatusGlyph kind={glyph === 'OVER' ? 'over' : 'risk'} label={glyphLabel ?? ''} />
      ) : null}
      {text}
    </div>
  )
})
