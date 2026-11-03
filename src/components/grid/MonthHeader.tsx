'use client'
// src/components/grid/MonthHeader.tsx — header row 2 (M8: the ◆ row is row 1): month + year above the week / day row (SPEC FR-818, AC-811,
// M7.1-D10). One columnheader per month span intersecting the rendered columns (aria-colspan = its columns); the label
// ("ตุลาคม 2569", narrow spans "ต.ค. 69" with the long name as the accessible name and title) sticks to the right edge
// of the frozen columns while its month is in view. (M7.1's marker flags left with the plan markers in M11.1.)
import { memo } from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'
import {
  FROZEN_COL_W,
  FROZEN_COLS,
  HEADER_ROWS,
  MONTH_H,
  periodColIndex,
  totalColIndex,
  TOTAL_COL_W,
  type GridColumn,
} from '@/lib/grid/columns'
import { monthLabel, monthSpans, visibleSpanWidth } from '@/lib/grid/months'
import styles from './grid.module.css'

export interface MonthHeaderProps {
  cols: readonly GridColumn[]
  vCols: readonly VirtualItem[]
  totalWidth: number
  /** visible period area in column-offset space (left / right edge); undefined = unmeasured → whole spans */
  viewFrom?: number
  viewTo?: number
}

/** The month row sits right above the period row (HEADER_ROWS); M8 puts its ◆ row above both (X85). */
export const MONTH_ROW_INDEX = HEADER_ROWS - 1

export const MonthHeader = memo(function MonthHeader(p: MonthHeaderProps) {
  const first = p.vCols[0]
  const last = p.vCols[p.vCols.length - 1]
  // virtual item start = column offset + the frozen padding (paddingStart)
  const pad = first ? first.start - (p.cols[first.index]?.offset ?? 0) : 0
  const spans = first && last ? monthSpans(p.cols, { first: first.index, last: last.index }) : []
  const view = p.viewFrom !== undefined && p.viewTo !== undefined ? { from: p.viewFrom, to: p.viewTo } : null
  return (
    <div
      role="row"
      aria-rowindex={MONTH_ROW_INDEX}
      className={styles.monthRow}
      style={{ width: p.totalWidth, height: MONTH_H }}
    >
      <div
        role="columnheader"
        aria-colindex={1}
        aria-colspan={FROZEN_COLS}
        className={styles.monthCorner}
        style={{ width: FROZEN_COL_W, height: MONTH_H }}
      />
      {spans.map((s) => {
        // the label fits the on-screen part of the span (not its full extent under "รวม"), §8.12 no clipped text
        const shownW = visibleSpanWidth(s, view)
        const { text, full } = monthLabel(s.key, shownW)
        return (
          <div
            key={s.key}
            role="columnheader"
            aria-colindex={periodColIndex(s.startIdx)}
            aria-colspan={s.endIdx - s.startIdx + 1}
            aria-label={full}
            title={text === full ? undefined : full}
            className={styles.monthSpan}
            style={{ left: pad + s.left, width: s.width, height: MONTH_H }}
            data-month={s.key}
            data-month-start={s.startIdx > 0 ? '' : undefined}
          >
            <span
              className={styles.monthLabel}
              aria-hidden="true"
              style={view ? { maxWidth: shownW } : undefined}
              data-testid={`month-label-${s.key}`}
            >
              {text}
            </span>
          </div>
        )
      })}
      <div
        role="columnheader"
        aria-colindex={totalColIndex(p.cols.length)}
        className={styles.monthTotal}
        style={{ width: TOTAL_COL_W, height: MONTH_H }}
      />
    </div>
  )
})
