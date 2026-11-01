'use client'
// src/components/grid/GridHeader.tsx — the period header row (SPEC §8.3/§8.4, FR-803/807, M6-D33, M7-D11). "30/9" per
// week; this week marked with the --today line + hidden text; holiday weeks 🎌 + tooltip names (shared tooltip).
// M7: a plain click on a collapsed week header expands it (a button with aria-expanded, view only — never data);
// expanded weeks render DayGroupHeader cells + the รวม header; in day zoom headers are not toggles. Shift+click
// selects that column over the editable rows (M6, unchanged). The toggles are buttons out of the Tab order (the grid
// keeps one Tab stop, §8.9); their keyboard path is Mod+↓ / Mod+↑ on a cell (M7-D11).
import { memo, type PointerEvent } from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import { HEADER_H, HEADER_ROWS, NAME_COL_W, TOTAL_COL_W, type GridColumn } from '@/lib/grid/columns'
import { DayHeaderCell, WeekTotalHeaderCell } from './DayGroupHeader'
import styles from './grid.module.css'

export interface GridHeaderProps {
  cols: readonly GridColumn[]
  vCols: readonly VirtualItem[]
  totalWidth: number
  thisWeek: string
  holidayWeeks: ReadonlySet<string>
  onSelectColumn: (c: number) => void
  /** M7: today's date (day columns), holidays by date, toggles (false in day zoom) */
  today?: string
  holidays?: ReadonlyMap<string, string>
  toggle?: boolean
  onToggleWeek?: (week: string) => void
}

const NO_HOLIDAYS: ReadonlyMap<string, string> = new Map()
const noop = () => {}

const HeaderCell = memo(function HeaderCell({
  col,
  c,
  left,
  width,
  today,
  holiday,
  onSelectColumn,
  toggle,
  onToggleWeek,
}: {
  col: GridColumn
  c: number
  left: number
  width: number
  today: boolean
  holiday: boolean
  onSelectColumn: (c: number) => void
  toggle: boolean
  onToggleWeek: (week: string) => void
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
    if (!e.shiftKey || e.button !== 0) return // plain click: the expand button (M7)
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
      {toggle ? (
        <button
          type="button"
          tabIndex={-1}
          className={styles.headerToggle}
          aria-expanded={false}
          aria-label={th.grid.day.expandWeek(label)}
          data-testid={`expand-week-${col.weekStart}`}
          onClick={(e) => {
            if (e.shiftKey) return // Shift+click selected the column (pointerdown)
            onToggleWeek(col.weekStart)
          }}
        >
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
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
        if (col.role === 'weekTotal')
          return <WeekTotalHeaderCell key={v.key} col={col} c={v.index} left={v.start} width={v.size} />
        if (col.role === 'day') {
          const prev = p.cols[v.index - 1]
          const first = prev?.kind !== 'D' || prev.weekStart !== col.weekStart
          let groupWidth = 0
          if (first)
            for (let i = v.index; p.cols[i]?.kind === 'D' && p.cols[i]!.weekStart === col.weekStart; i++)
              groupWidth += p.cols[i]!.width
          return (
            <DayHeaderCell
              key={v.key}
              col={col}
              c={v.index}
              left={v.start}
              width={v.size}
              first={first}
              groupWidth={groupWidth}
              today={col.date === p.today}
              holiday={(p.holidays ?? NO_HOLIDAYS).get(col.date) ?? null}
              toggle={p.toggle ?? false}
              onToggleWeek={p.onToggleWeek ?? noop}
            />
          )
        }
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
            toggle={p.toggle ?? false}
            onToggleWeek={p.onToggleWeek ?? noop}
          />
        )
      })}
      <div
        role="columnheader"
        aria-colindex={p.cols.length + 2}
        className={styles.totalHeader}
        style={{ width: TOTAL_COL_W, height: HEADER_H }}
      >
        {th.grid.header.total}
      </div>
    </div>
  )
}
