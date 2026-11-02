'use client'
// src/components/grid/MilestoneRow.tsx — header row 1: ◆ Milestones (SPEC FR-705, §8.3 "◆ → เดือน → สัปดาห์/วัน", §8.9;
// plan/m08 S3.3–S3.6, S3.9, M8-D9/D10/D11). Part of the grid's sticky header group (one scroll container). One
// role="rowheader" spanning the frozen columns, one role="gridcell" per rendered (virtual) column and the sticky "รวม"
// cell. A column holding milestones shows its first ◆ (date then id) as a button — ◆ glyph in --milestone, the name,
// status glyph + visually hidden status text, ⚠ + hidden "เลย milestone N งาน" when late — and "+N" for the rest.
// State is never colour alone (§8.9). Gestures: click / Enter / Space on ◆ → popover; Shift+F10 / ContextMenu key /
// right click → the cell menu; pointer drag (useMilestoneDrag, managers only); a click on the empty part of a cell or
// Enter on a focused empty cell → create (managers only). Reads only `canManage` (C40), never the context kind; M9 adds
// the optional `projectLabel` prefix without changing this call site.
import { memo, useMemo, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridMilestone } from '@/lib/contracts/grid'
import { formatThaiDate, formatWeekHeader } from '@/lib/format'
import {
  FROZEN_COL_W,
  FROZEN_COLS,
  MS_ROW_H,
  MS_ROW_INDEX,
  periodColIndex,
  totalColIndex,
  TOTAL_COL_W,
  type GridColumn,
} from '@/lib/grid/columns'
import { dateForDrop, placeMilestones } from '@/lib/grid/milestones'
import type { MilestoneDragState } from './useMilestoneDrag'
import styles from './grid.module.css'

export type MilestoneMenuTarget = { milestone: GridMilestone } | { col: GridColumn }

export interface MilestoneRowProps {
  cols: readonly GridColumn[]
  vCols: readonly VirtualItem[]
  totalWidth: number
  milestones: readonly GridMilestone[]
  /** model.context.canManage (M/L, not archived): create, drag and edit; otherwise ◆ open read-only */
  canManage: boolean
  today: ISODate
  thisWeek: ISODate
  onOpen(m: GridMilestone, anchor: HTMLElement): void
  onOpenStack(list: readonly GridMilestone[], anchor: HTMLElement, col: GridColumn): void
  onCreate(col: GridColumn, anchor: HTMLElement): void
  /** `at` = pointer position (right click); null = keyboard (anchor at the element) */
  onMenu(target: MilestoneMenuTarget, anchor: HTMLElement, at: { x: number; y: number } | null): void
  drag?: MilestoneDragState | null
  onDragStart?(e: PointerEvent<HTMLElement>, m: GridMilestone): void
  /** true when the click that follows a drag must be ignored */
  consumeClick?(): boolean
  /** M9 (C76): project-name prefix on ◆ in the person grid */
  projectLabel?: string
}

const STATUS_GLYPH: Record<GridMilestone['status'], string> = {
  DONE: '✓',
  OVERDUE: '❗',
  DUE_SOON: '⏰',
  UPCOMING: '',
}

/** The accessible name of a ◆ (S3.3): diamondLabel(name, date, status) + "เลย milestone N งาน" when late. */
export function milestoneLabel(m: GridMilestone, projectLabel?: string): string {
  const name = projectLabel ? `${projectLabel} · ${m.name}` : m.name
  const base = th.milestones.grid.diamondLabel(name, formatThaiDate(m.date, 'medium'), th.milestones.status[m.status])
  return m.late ? `${base} ${th.milestones.lateTasks(m.lateTaskCount)}` : base
}

const isMenuKey = (e: KeyboardEvent) => (e.code === 'F10' && e.shiftKey) || e.code === 'ContextMenu'
const isEnter = (e: KeyboardEvent) => e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter'

export const MilestoneRow = memo(function MilestoneRow(p: MilestoneRowProps) {
  const placed = useMemo(() => placeMilestones(p.milestones, p.cols), [p.milestones, p.cols])
  const byId = useMemo(() => new Map(p.milestones.map((m) => [m.id, m])), [p.milestones])
  const dragged = p.drag ? byId.get(p.drag.id) : undefined
  const dropCol = p.drag ? p.cols[p.drag.targetIdx] : undefined
  const dropHint =
    dragged && dropCol ? th.milestones.grid.dropHint(formatThaiDate(dateForDrop(dragged.date, dropCol), 'medium')) : ''

  const cellOf = (el: Element) => el.closest<HTMLElement>('[data-ms-cell]')
  const colOf = (cell: HTMLElement) => p.cols[Number(cell.dataset.c)]

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    const button = t.closest<HTMLElement>('[data-ms-id]')
    const cell = cellOf(t)
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      if (!cell) return
      const cells = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-ms-cell]')]
      const step = e.code === 'ArrowLeft' ? -1 : 1
      for (let i = cells.indexOf(cell) + step; i >= 0 && i < cells.length; i += step) {
        const c = cells[i]!
        const next = c.querySelector<HTMLElement>('[data-ms-id]') ?? (c.tabIndex >= 0 ? c : null)
        if (next) {
          e.preventDefault()
          e.stopPropagation()
          next.focus()
          return
        }
      }
      return
    }
    if (button) {
      if (!isMenuKey(e)) return
      const m = byId.get(button.dataset.msId ?? '')
      if (!m) return
      e.preventDefault()
      e.stopPropagation()
      p.onMenu({ milestone: m }, button, null)
      return
    }
    if (!cell || t !== cell || !p.canManage) return
    const col = colOf(cell)
    if (!col) return
    if (isMenuKey(e)) {
      e.preventDefault()
      e.stopPropagation()
      p.onMenu({ col }, cell, null)
    } else if (isEnter(e)) {
      e.preventDefault()
      e.stopPropagation()
      p.onCreate(col, cell)
    }
  }

  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    const button = t.closest<HTMLElement>('[data-ms-id]')
    const m = button ? byId.get(button.dataset.msId ?? '') : undefined
    const keyboard = e.clientX === 0 && e.clientY === 0
    const at = keyboard ? null : { x: e.clientX, y: e.clientY }
    if (button && m) {
      e.preventDefault()
      e.stopPropagation()
      p.onMenu({ milestone: m }, button, at)
      return
    }
    const cell = cellOf(t)
    const col = cell ? colOf(cell) : undefined
    if (!cell || !col || !p.canManage) return
    e.preventDefault()
    e.stopPropagation()
    p.onMenu({ col }, cell, at)
  }

  const onCellClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!p.canManage || (e.target as HTMLElement).closest('button')) return
    const col = colOf(e.currentTarget)
    if (col) p.onCreate(col, e.currentTarget)
  }

  const renderDiamond = (m: GridMilestone, key: string) => {
    const glyph = STATUS_GLYPH[m.status]
    return (
      <button
        type="button"
        className={styles.msDiamond}
        aria-label={milestoneLabel(m, p.projectLabel)}
        data-testid={`ms-${m.id}`}
        data-ms-id={m.id}
        data-status={m.status}
        data-late={m.late ? 'true' : 'false'}
        data-period-key={key}
        data-dragging={p.drag?.id === m.id ? 'true' : undefined}
        data-tip="milestone"
        onPointerDown={(e) => {
          if (p.canManage) p.onDragStart?.(e, m)
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (p.consumeClick?.()) return
          p.onOpen(m, e.currentTarget)
        }}
      >
        <span aria-hidden="true" className={styles.msGlyph}>
          {th.milestones.diamond}
        </span>
        {glyph ? (
          <span aria-hidden="true" className={styles.msStatus}>
            {glyph}
          </span>
        ) : null}
        <span aria-hidden="true" className={styles.msName}>
          {p.projectLabel ? `${p.projectLabel} · ${m.name}` : m.name}
        </span>
        {m.late ? (
          <span aria-hidden="true" className={styles.msLate}>
            ⚠
          </span>
        ) : null}
        <span className={styles.srOnly}>{th.milestones.status[m.status]}</span>
        {m.late ? <span className={styles.srOnly}>{th.milestones.lateTasks(m.lateTaskCount)}</span> : null}
      </button>
    )
  }

  return (
    <div
      role="row"
      aria-rowindex={MS_ROW_INDEX}
      aria-label={th.milestones.grid.rowLabel}
      className={styles.msRow}
      style={{ width: p.totalWidth, height: MS_ROW_H }}
      data-testid="ms-row"
      data-manage={p.canManage ? 'true' : undefined}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
    >
      <div
        role="rowheader"
        aria-colindex={1}
        aria-colspan={FROZEN_COLS}
        className={styles.msHeader}
        style={{ width: FROZEN_COL_W, height: MS_ROW_H }}
      >
        <span className={styles.cornerLabel}>{th.milestones.grid.rowHeader}</span>
        <span className={styles.srOnly} aria-live="polite" data-testid="ms-drop-hint">
          {dropHint}
        </span>
      </div>
      {p.vCols.map((v) => {
        const col = p.cols[v.index]
        if (!col) return null
        const list = placed.get(v.index)
        const first = list?.[0]
        const more = list ? list.length - 1 : 0
        const isDay = col.key.startsWith('D:')
        const today = isDay ? col.date === p.today : col.weekStart === p.thisWeek
        return (
          <div
            key={v.key}
            role="gridcell"
            aria-colindex={periodColIndex(v.index)}
            className={styles.msCell}
            style={{ left: v.start, width: v.size, height: MS_ROW_H }}
            tabIndex={p.canManage && !first ? -1 : undefined}
            aria-label={
              p.canManage && !first ? th.milestones.grid.addAt(formatThaiDate(isDay ? col.date : col.weekStart, 'medium')) : undefined
            }
            data-testid={`ms-cell-${col.key}`}
            data-ms-cell=""
            data-c={v.index}
            data-period-key={col.key}
            data-today={today ? 'true' : undefined}
            data-drop={p.drag?.targetIdx === v.index ? 'true' : undefined}
            onClick={onCellClick}
          >
            {first ? renderDiamond(first, col.key) : null}
            {more > 0 && list ? (
              <button
                type="button"
                className={styles.msMore}
                aria-label={th.milestones.grid.moreLabel(more, formatWeekHeader(isDay ? col.date : col.weekStart))}
                aria-haspopup="dialog"
                data-testid={`ms-more-${col.key}`}
                onClick={(e) => {
                  e.stopPropagation()
                  p.onOpenStack(list, e.currentTarget, col)
                }}
              >
                {th.milestones.grid.more(more)}
              </button>
            ) : null}
            {p.drag?.targetIdx === v.index ? (
              <span aria-hidden="true" className={styles.msGhost} data-testid="ms-ghost">
                {th.milestones.diamond}
              </span>
            ) : null}
          </div>
        )
      })}
      <div
        role="gridcell"
        aria-colindex={totalColIndex(p.cols.length)}
        className={styles.msTotal}
        style={{ width: TOTAL_COL_W, height: MS_ROW_H }}
      />
    </div>
  )
})
