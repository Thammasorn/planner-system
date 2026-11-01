'use client'
// src/components/grid/GridCell.tsx — one memoised body cell (FR-804/807/808, BR-20a, M6-D9/D12/D20, PLAN §3.9).
// A plain div with one CSS Module class and data-* state; selection/focus flags come from the external grid store, so
// only cells whose flags change re-render. The inline editor replaces the text while editing.
// M7 (S3.4/S3.10, §8.9): day cells — derived (dashed underline + faded token + data-derived + aria-description, never
// opacity), warnings (⚠ cap-0 day, leave glyph on a time-off date), 🔴 / ⚠ day overload of the person; the รวม cell
// of a DAY week carries the ↕ collapse-to-week button; a BR-24 pending value shows data-pending-choice.
import { memo, useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { th } from '@/i18n/th'
import type { Editability } from '@/lib/grid/rows'
import { asciiForCode } from '@/lib/grid/keymap'
import {
  CELL_EDITING,
  CELL_FILL,
  CELL_FOCUSED,
  CELL_HANDLE,
  CELL_ROVING,
  CELL_SELECTED,
  useCellFlags,
  type GridStore,
} from './gridStore'
import styles from './grid.module.css'

export interface GridCellProps {
  store: GridStore
  r: number
  c: number
  left: number
  width: number
  rowKey: string
  periodKey: string
  text: string
  /** accessible name: th.grid.cell.label(row, week, value + glyph texts) */
  label: string
  editability: Editability
  resolution: 'WEEK' | 'DAY' | undefined
  tentative: boolean
  leave: boolean
  noCapacity: boolean
  notCounted: boolean
  today: boolean
  /** the editor's initial value for F2 / '' (exact, current unit) */
  exactValue: string
  onEditorBlur: (value: string) => void
  // ── M7 (all optional; absent = M6 week cell) ──
  colKind?: 'W' | 'D'
  /** D cell of a WEEK week (BR-20 display-only spread) */
  derived?: boolean
  /** aria-description (derived values, M7-D20) */
  description?: string
  /** ⚠ text: a cap-0 day with work, or a WEEK week without capacity (BR-21a fallback) */
  warnLabel?: string
  /** leave glyph text on a time-off date with work (M7-D15) */
  timeOffLabel?: string
  /** BR-40 level of the person on this day (≠ OK) and its full status text */
  dayLevel?: 'OVER' | 'RISK'
  dayLevelLabel?: string
  holiday?: boolean
  /** BR-24 dialog open for this (row, week): the typed value shows as pending */
  pendingChoice?: boolean
  /** the expanded week's day data is still loading (placeholder) */
  busy?: boolean
  /** the รวม cell of a DAY week on an editable row: ↕ รวมเป็นรายสัปดาห์ */
  collapsible?: boolean
  onCollapse?: (rowKey: string, periodKey: string) => void
}

function CellEditor({
  initial,
  label,
  onBlur,
}: {
  initial: string
  label: string
  onBlur: (value: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [])
  // M6-D27: on the Kedmanee layout digit / period / comma keys type Thai characters — insert the ASCII character
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
    const ch = asciiForCode(e.code)
    if (ch === null || e.key === ch) return
    e.preventDefault()
    const el = e.currentTarget
    el.setRangeText(ch, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, 'end')
    el.removeAttribute('aria-invalid')
  }, [])
  return (
    <input
      ref={ref}
      className={styles.editor}
      data-cell-editor=""
      defaultValue={initial}
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      onKeyDown={onKeyDown}
      onInput={(e) => e.currentTarget.removeAttribute('aria-invalid')}
      onBlur={(e) => onBlur(e.currentTarget.value)}
    />
  )
}

export const GridCell = memo(function GridCell(p: GridCellProps) {
  const flags = useCellFlags(p.store, p.r, p.c)
  const ref = useRef<HTMLDivElement | null>(null)
  const focused = (flags & CELL_FOCUSED) !== 0
  const editing = (flags & CELL_EDITING) !== 0

  useEffect(() => {
    const el = ref.current
    if (!el || !focused || editing || !p.store.get().active) return
    if (document.activeElement !== el) el.focus({ preventScroll: true })
  }, [focused, editing, p.store])

  // keep keyboard focus inside the grid when the focused cell scrolls out of the virtual window
  const setRef = useCallback((el: HTMLDivElement | null) => {
    ref.current = el
    if (!el) return
    return () => {
      if (document.activeElement === el)
        el.closest<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true })
    }
  }, [])

  const draft = editing ? p.store.get().draft : ''
  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- aria-description is a global ARIA 1.3 attribute (M7-D20, derived values)
    <div
      ref={setRef}
      role="gridcell"
      aria-colindex={p.c + 2}
      aria-selected={(flags & CELL_SELECTED) !== 0}
      aria-readonly={p.editability !== 'ok' ? true : undefined}
      aria-label={p.label}
      aria-description={p.description}
      aria-busy={p.busy ? true : undefined}
      tabIndex={(flags & CELL_ROVING) !== 0 ? 0 : -1}
      className={styles.cell}
      style={{ left: p.left, width: p.width }}
      data-cell=""
      data-r={p.r}
      data-c={p.c}
      data-tip="cell"
      data-testid={`cell-${p.rowKey}-${p.periodKey}`}
      data-resolution={p.resolution}
      data-tentative={p.tentative ? 'true' : undefined}
      data-leave={p.leave ? 'true' : undefined}
      data-no-capacity={p.noCapacity ? 'true' : undefined}
      data-not-counted={p.notCounted ? 'true' : undefined}
      data-today={p.today ? 'true' : undefined}
      data-focused={focused ? 'true' : undefined}
      data-fill={(flags & CELL_FILL) !== 0 ? 'true' : undefined}
      data-col-kind={p.colKind}
      data-derived={p.derived ? 'true' : undefined}
      data-holiday={p.holiday ? 'true' : undefined}
      data-pending-choice={p.pendingChoice ? 'true' : undefined}
      data-day-level={p.dayLevel}
    >
      {editing ? (
        <CellEditor initial={draft === '' ? p.exactValue : draft} label={p.label} onBlur={p.onEditorBlur} />
      ) : (
        <>
          {p.collapsible && p.onCollapse ? (
            <button
              type="button"
              tabIndex={-1}
              className={styles.collapseButton}
              aria-label={th.grid.day.collapseToWeek}
              title={th.grid.day.collapseToWeek}
              data-collapse-week=""
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => p.onCollapse?.(p.rowKey, p.periodKey)}
            >
              <span aria-hidden="true">↕</span>
            </button>
          ) : null}
          {p.leave ? <StatusGlyph kind="leave" /> : null}
          {p.noCapacity ? <StatusGlyph kind="noCapacity" /> : null}
          {p.timeOffLabel ? <StatusGlyph kind="leave" label={p.timeOffLabel} /> : null}
          {p.warnLabel ? (
            <span className={styles.warnGlyph} data-glyph="warn">
              <span aria-hidden="true">{th.overload.glyph.RISK}</span>
              <VisuallyHidden>{p.warnLabel}</VisuallyHidden>
            </span>
          ) : null}
          {p.dayLevel ? (
            <StatusGlyph kind={p.dayLevel === 'OVER' ? 'over' : 'risk'} label={p.dayLevelLabel ?? ''} />
          ) : null}
          {p.busy && p.text === '' ? (
            // the expanded week's day data is still loading: a visible placeholder + its text (never cursor only)
            <span className={styles.busyPlaceholder} data-busy-placeholder="">
              <span aria-hidden="true">…</span>
              <VisuallyHidden>{th.grid.day.loading}</VisuallyHidden>
            </span>
          ) : null}
          <span data-cell-value="" className={p.derived ? styles.derivedValue : undefined}>
            {p.text}
          </span>
          {p.resolution === 'DAY' && p.colKind !== 'D' ? <StatusGlyph kind="dayDetail" /> : null}
        </>
      )}
      {(flags & CELL_HANDLE) !== 0 && p.editability === 'ok' ? (
        <span className={styles.fillHandle} data-fill-handle="" aria-hidden="true" />
      ) : null}
    </div>
  )
})
