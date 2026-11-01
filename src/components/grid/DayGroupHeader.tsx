'use client'
// src/components/grid/DayGroupHeader.tsx — header cells of an expanded week (SPEC §8.4, FR-803/807, M7-D10/D11), inside
// M6's single period header row (HEADER_ROWS unchanged). A day column: line 1 (first day only, spanning the group)
// the collapse-view button "19 ต.ค. 2569" (aria-expanded true; plain text in day zoom), line 2 the narrow weekday,
// 🎌 + holiday tooltip. The รวม column: "รวม" with the week's label.
import { memo } from 'react'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { isoWeekday } from '@/domain/dates'
import { th } from '@/i18n/th'
import { formatThaiDate, formatWeekHeader } from '@/lib/format'
import { HEADER_H, type GridColumn } from '@/lib/grid/columns'
import styles from './grid.module.css'

export interface DayHeaderCellProps {
  col: GridColumn
  c: number
  left: number
  width: number
  /** first day column of its week: carries the week label / collapse button */
  first: boolean
  /** width of the whole day group (line 1 spans it) */
  groupWidth: number
  today: boolean
  holiday: string | null
  /** false in day zoom (headers are not toggles there) */
  toggle: boolean
  onToggleWeek: (week: string) => void
}

export const DayHeaderCell = memo(function DayHeaderCell(p: DayHeaderCellProps) {
  const weekday = th.calendar.weekdays[isoWeekday(p.col.date) - 1]!
  const weekLabel = formatThaiDate(p.col.weekStart, 'medium')
  const name = [
    `${th.calendar.weekdaysLong[isoWeekday(p.col.date) - 1]} ${formatWeekHeader(p.col.date)}`,
    p.today ? th.grid.header.today : null,
    p.holiday !== null ? th.grid.cell.holiday(p.holiday) : null,
  ]
    .filter((x): x is string => x !== null)
    .join(' · ')
  return (
    <div
      role="columnheader"
      aria-colindex={p.c + 2}
      className={styles.dayHeader}
      style={{ left: p.left, width: p.width, height: HEADER_H }}
      data-col-key={p.col.key}
      data-col-kind="D"
      data-today={p.today ? 'true' : undefined}
      data-holiday={p.holiday !== null ? 'true' : undefined}
      data-first-day={p.first ? 'true' : undefined}
      data-tip={p.holiday !== null ? 'header' : undefined}
      data-date={p.col.date}
    >
      <span className={styles.dayHeaderWeek} style={{ width: p.first ? p.groupWidth : undefined }}>
        {p.first ? (
          p.toggle ? (
            <button
              type="button"
              tabIndex={-1}
              className={styles.headerToggle}
              aria-expanded={true}
              aria-label={th.grid.day.collapseWeekView(formatWeekHeader(p.col.weekStart))}
              data-testid={`collapse-week-${p.col.weekStart}`}
              onClick={(e) => {
                if (e.shiftKey) return
                p.onToggleWeek(p.col.weekStart)
              }}
            >
              {weekLabel}
            </button>
          ) : (
            <span>{weekLabel}</span>
          )
        ) : null}
      </span>
      <span className={styles.dayHeaderDay}>
        <span aria-hidden="true">{weekday}</span>
        <VisuallyHidden>{name}</VisuallyHidden>
        {p.holiday !== null ? <StatusGlyph kind="holiday" /> : null}
      </span>
    </div>
  )
})

export const WeekTotalHeaderCell = memo(function WeekTotalHeaderCell(p: {
  col: GridColumn
  c: number
  left: number
  width: number
}) {
  return (
    <div
      role="columnheader"
      aria-colindex={p.c + 2}
      aria-label={th.grid.day.totalColumnLabel(formatWeekHeader(p.col.weekStart))}
      className={styles.weekTotalHeader}
      style={{ left: p.left, width: p.width, height: HEADER_H }}
      data-col-key={p.col.key}
      data-col-role="weekTotal"
      data-week={p.col.weekStart}
    >
      {th.grid.day.totalColumn}
    </div>
  )
})
