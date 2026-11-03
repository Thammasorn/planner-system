'use client'
// src/components/workload/WorkloadCell.tsx — one person × week cell of the workload (SPEC §8.5, FR-1002/1003,
// BR-40/BR-45, M9-D6/D7, X67). Reused verbatim by M10's embed block and home (m10 S3.5). Dense: one plain <button> +
// CSS Module classes, no MUI per cell (PLAN §3.9). The hover breakdown is the shared WorkloadTooltipHost popper.
// M11.1 (FR-1002/FR-1010, M11.1-D4/D5): the visible text follows `load.display` — "90%" (PERCENT, default) or "4.5/5"
// (DAYS); capacity 0 keeps the days text; tones, glyphs and the aria label's days are unchanged in both modes.
import type { KeyboardEvent } from 'react'
import { addDays, compareISO } from '@/domain/dates'
import { viewTone } from '@/domain/overload'
import type { ISODate, LoadView } from '@/domain/types'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { useLoadDisplay } from '@/components/load/LoadDisplayToggle'
import { th } from '@/i18n/th'
import type { WorkloadCell as WorkloadCellDTO, WorkloadResponse } from '@/lib/contracts/workload'
import { formatThaiDate } from '@/lib/format'
import { loadPct, workloadDisplayText, type LoadDisplay } from '@/lib/load/display'
import { statusSuffix, twoDecimals } from '@/lib/workload/format'
import styles from './Workload.module.css'

export interface WorkloadCellProps {
  name: string
  week: ISODate
  cell: WorkloadCellDTO
  view: LoadView
  projects: WorkloadResponse['projects']
  deactivated: boolean
  /** No onOpen → read-only (still focusable for the tooltip). */
  onOpen?: () => void
  /** Roving focus of a table (one tab stop); default 0. */
  tabIndex?: number
  /** The cell whose side panel is open. */
  selected?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void
  /** M11.1: overrides the viewer's `load.display` (tests / fixed surfaces); absent = the preference. */
  display?: LoadDisplay
}

/** M9-D7: a week ending on or after the user's deactivation date shows "ปิดใช้งาน" instead of the cause. */
export function isDeactivatedWeek(deactivatedOn: ISODate | null, week: ISODate): boolean {
  return deactivatedOn !== null && compareISO(addDays(week, 6), deactivatedOn) >= 0
}

export function WorkloadCell(p: WorkloadCellProps): React.JSX.Element {
  const { cell } = p
  const pref = useLoadDisplay()
  const display = p.display ?? pref
  const { tone, palette, loadCd } = viewTone(
    { total: cell.total, committed: cell.committed },
    cell.capacity,
    p.view,
  )
  // BR-40 glyph follows { total, committed } regardless of the view (X67)
  const level = cell.level
  const suffix = statusSuffix(cell, { deactivated: p.deactivated })
  const loadText = loadCd === 0 ? th.workload.cell.emptyLabel : twoDecimals(loadCd)
  const pct = loadCd === 0 ? null : loadPct(loadCd, cell.capacity)
  const label = th.workload.cell.label(
    p.name,
    formatThaiDate(p.week),
    loadText,
    twoDecimals(cell.capacity),
    pct === null ? suffix : ` (${th.loadDisplay.used(pct)})${suffix}`,
  )
  return (
    <button
      type="button"
      className={styles.cell}
      data-wl-cell=""
      data-week={p.week}
      data-tone={tone}
      data-palette={palette}
      data-level={level}
      data-no-capacity={cell.capacity === 0 ? 'true' : undefined}
      data-display={display}
      data-readonly={p.onOpen ? undefined : 'true'}
      data-selected={p.selected ? 'true' : undefined}
      aria-label={label}
      tabIndex={p.tabIndex ?? 0}
      onClick={p.onOpen}
      onKeyDown={p.onKeyDown}
    >
      <span aria-hidden="true">{workloadDisplayText(loadCd, cell.capacity, display)}</span>
      {level === 'OK' ? null : <StatusGlyph kind={level === 'OVER' ? 'over' : 'risk'} label={suffix} />}
    </button>
  )
}
