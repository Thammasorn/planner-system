'use client'
// src/components/grid/GridHeader.tsx — the period header row (SPEC §8.3/§8.4, FR-803/807, M6-D33, M7-D11). "30/9" per
// week; this week marked with the --today line + hidden text; holiday weeks 🎌 + tooltip names (shared tooltip).
// M7: a plain click on a collapsed week header expands it (a button with aria-expanded, view only — never data);
// expanded weeks render DayGroupHeader cells + the รวม header; in day zoom headers are not toggles. Shift+click
// selects that column over the editable rows (M6, unchanged). The toggles are buttons out of the Tab order (the grid
// keeps one Tab stop, §8.9); their keyboard path is Mod+↓ / Mod+↑ on a cell (M7-D11).
// M7.1: this is the period row (aria-rowindex HEADER_ROWS = 3 since M8; ◆ row and month row above it) and it is no longer
// sticky itself (the header group is). Two frozen header cells — "งาน" (+ ⇔ ColumnResizeHandle, FR-814) and
// "ผู้รับผิดชอบ" (+ the icon-only "ซ่อน" button, FR-816; absent when hidden: "งาน" spans both ARIA columns) — each sticky at its own left
// offset; the first column of every month carries data-month-start (FR-818).
// M9 (M9-D28, S3.4): the person grid's `?week=` header carries data-focus-week (outline, not colour alone) + an
// aria-description.
import { memo, type PointerEvent, type ReactNode } from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import {
  ASSIGNEE_COL_W,
  FROZEN_COL_W,
  FROZEN_COLS,
  HEADER_H,
  HEADER_ROWS,
  periodColIndex,
  TASK_COL_W,
  totalColIndex,
  TOTAL_COL_W,
  type GridColumn,
} from '@/lib/grid/columns'
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
  /** M7.1 (FR-816): the assignee column is shown (default) */
  showAssignees?: boolean
  /** M7.1: "ซ่อน" on the ผู้รับผิดชอบ header */
  onHideAssignees?: () => void
  /** M7.1 (FR-814): the ⇔ separator, rendered inside the งาน header */
  resizeHandle?: ReactNode
  /** M7.1 (FR-818): keys of the first column of each month */
  monthStarts?: ReadonlySet<string>
  /** M9 (M9-D28): the Monday marked as the focus week (person grid `?week=`) */
  focusWeek?: string
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
  monthStart,
  focus,
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
  monthStart: boolean
  focus: boolean
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
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- aria-description is a global ARIA 1.3 attribute (M9-D28 focus week)
    <div
      role="columnheader"
      aria-colindex={periodColIndex(c)}
      aria-label={name}
      aria-description={focus ? th.people.grid.focusWeek : undefined}
      className={styles.colHeader}
      style={{ left, width, height: HEADER_H }}
      data-col-key={col.key}
      data-c={c}
      data-month-start={monthStart ? '' : undefined}
      data-today={today ? 'true' : undefined}
      data-focus-week={focus ? 'true' : undefined}
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

const NO_STARTS: ReadonlySet<string> = new Set()

export function GridHeader(p: GridHeaderProps) {
  const showAssignees = p.showAssignees ?? true
  const starts = p.monthStarts ?? NO_STARTS
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
        aria-colspan={showAssignees ? undefined : FROZEN_COLS}
        className={styles.corner}
        style={{ width: showAssignees ? TASK_COL_W : FROZEN_COL_W, height: HEADER_H }}
        data-frozen-header="task"
      >
        <span className={styles.cornerLabel}>{th.grid.columns.task}</span>
        {p.resizeHandle}
      </div>
      {showAssignees ? (
        <div
          role="columnheader"
          aria-colindex={2}
          className={styles.cornerAssignee}
          style={{ width: ASSIGNEE_COL_W, height: HEADER_H }}
          data-frozen-header="assignee"
        >
          <span className={styles.cornerLabel}>{th.grid.columns.assignee}</span>
          {p.onHideAssignees ? (
            // out of the Tab order (the grid keeps one Tab stop, §8.9): the toolbar switch is its keyboard path
            <button
              type="button"
              tabIndex={-1}
              className={styles.cornerButton}
              onClick={p.onHideAssignees}
              data-testid="hide-assignees"
              // icon-only so "ผู้รับผิดชอบ" fits the fixed 112 px column (FR-816, §8.12 no clipped text)
              aria-label={th.grid.columns.hide}
              title={th.grid.columns.hide}
            >
              <VisibilityOffOutlined fontSize="inherit" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      {p.vCols.map((v) => {
        const col = p.cols[v.index]
        if (!col) return null
        const monthStart = starts.has(col.key)
        if (col.role === 'weekTotal')
          return (
            <WeekTotalHeaderCell
              key={v.key}
              col={col}
              c={v.index}
              left={v.start}
              width={v.size}
              monthStart={monthStart}
            />
          )
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
              monthStart={monthStart}
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
            monthStart={monthStart}
            focus={p.focusWeek === col.weekStart}
          />
        )
      })}
      <div
        role="columnheader"
        aria-colindex={totalColIndex(p.cols.length)}
        className={styles.totalHeader}
        style={{ width: TOTAL_COL_W, height: HEADER_H }}
      >
        {th.grid.header.total}
      </div>
    </div>
  )
}
