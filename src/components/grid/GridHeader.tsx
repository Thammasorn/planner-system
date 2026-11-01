'use client'
// src/components/grid/GridHeader.tsx — the period header row (SPEC §8.3, FR-807, M6-D33). "30/9" per week; this week
// marked with the --today line + hidden text; holiday weeks 🎌 + tooltip names (shared tooltip). A plain click does
// nothing in M6 (M7 expands the week); Shift+click selects that column over the editable rows.
import { memo, type PointerEvent } from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import { HEADER_H, HEADER_ROWS, NAME_COL_W, TOTAL_W, type GridColumn } from '@/lib/grid/columns'
import styles from './grid.module.css'

export interface GridHeaderProps {
  cols: readonly GridColumn[]
  vCols: readonly VirtualItem[]
  totalWidth: number
  thisWeek: string
  holidayWeeks: ReadonlySet<string>
  onSelectColumn: (c: number) => void
}

const HeaderCell = memo(function HeaderCell({
  col,
  c,
  left,
  width,
  today,
  holiday,
  onSelectColumn,
}: {
  col: GridColumn
  c: number
  left: number
  width: number
  today: boolean
  holiday: boolean
  onSelectColumn: (c: number) => void
}) {
  const label = formatWeekHeader(col.weekStart)
  // the aria-label replaces the content, so it carries the today / holiday texts itself (§8.9, FR-807)
  const name = [
    th.grid.header.week(label),
    today ? th.grid.header.today : null,
    holiday ? th.grid.glyph.holiday : null,
  ]
    .filter((x): x is string => x !== null)
    .join(' · ')
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.shiftKey || e.button !== 0) return // plain click: reserved for M7's expand
    e.preventDefault()
    onSelectColumn(c)
  }
  return (
    <div
      role="columnheader"
      aria-colindex={c + 2}
      aria-label={name}
      className={styles.colHeader}
      style={{ left, width, height: HEADER_H }}
      data-col-key={col.key}
      data-today={today ? 'true' : undefined}
      data-tip={holiday ? 'header' : undefined}
      data-week={col.weekStart}
      onPointerDown={onPointerDown}
    >
      <span>{label}</span>
      {holiday ? <StatusGlyph kind="holiday" /> : null}
      {today ? <VisuallyHidden>{th.grid.header.today}</VisuallyHidden> : null}
    </div>
  )
})

export function GridHeader(p: GridHeaderProps) {
  return (
    <div
      role="row"
      aria-rowindex={HEADER_ROWS}
      className={styles.headerRow}
      style={{ width: p.totalWidth, height: HEADER_H }}
    >
      <div
        role="columnheader"
        aria-colindex={1}
        className={styles.corner}
        style={{ width: NAME_COL_W, height: HEADER_H }}
      >
        {th.grid.header.name}
      </div>
      {p.vCols.map((v) => {
        const col = p.cols[v.index]
        if (!col) return null
        return (
          <HeaderCell
            key={v.key}
            col={col}
            c={v.index}
            left={v.start}
            width={v.size}
            today={col.weekStart === p.thisWeek}
            holiday={p.holidayWeeks.has(col.weekStart)}
            onSelectColumn={p.onSelectColumn}
          />
        )
      })}
      <div
        role="columnheader"
        aria-colindex={p.cols.length + 2}
        className={styles.totalHeader}
        style={{ width: TOTAL_W, height: HEADER_H }}
      >
        {th.grid.header.total}
      </div>
    </div>
  )
}
