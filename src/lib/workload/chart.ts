// src/lib/workload/chart.ts — the /workload month-year header row and the per-person load chart under the table
// (SPEC FR-1001/FR-1011 v3.5, M11.2-D1…D4; FR-818's month rule, FR-813's chart). Pure, integer cd.
// Month grouping, labels and boundary keys reuse the plan grid's helpers (src/lib/grid/months.ts) on the grid's own
// column model (a week column per Monday), so "a week belongs to the month of its Monday" is the same code path.
// The chart sits on the table's measured header geometry (TableGeometry, table content coordinates): a chart slot's
// left / width are exactly its week header cell's, so the points are centred on the table's columns at any width.
// Series come only from the /api/workload payload already on the client (masked by the server — names + numbers).
import { viewLoad } from '@/domain/certainty'
import type { ISODate, LoadView } from '@/domain/types'
import type { LoadSeries } from '@/components/load-chart/types'
import type { PeriodSlot } from '@/lib/grid/chart-geometry'
import { buildColumns, densityWidths, WEEK_W, type GridColumn } from '@/lib/grid/columns'
import type { GridDensity } from '@/lib/schemas/preferences'
import { monthLabel, monthSpans, monthStartKeys, type MonthKey } from '@/lib/grid/months'
import type { WorkloadGroup } from '@/lib/contracts/workload'
import { loadPct } from '@/lib/load/display'

/** The "คน" column's CSS min-width (Workload.module.css .corner) — the nominal frozen width before a measure. */
export const PERSON_COL_W = 180

/**
 * The table's measured geometry in its own content coordinates (px from the table's left edge): `personW` = the
 * sticky "คน" column, `cols[i]` = week header i, `contentW` = the table width, `viewW` = the scroller's clientWidth.
 */
export interface TableGeometry {
  personW: number
  contentW: number
  viewW: number
  cols: readonly { left: number; width: number }[]
}

/** The geometry before the table is measured (and in jsdom): person column + WEEK_W per week, unmeasured view. */
export function nominalGeometry(weekCount: number, density: GridDensity = 'NORMAL'): TableGeometry {
  const w = density === 'COMPACT' ? densityWidths('COMPACT').week : WEEK_W
  return {
    personW: PERSON_COL_W,
    contentW: PERSON_COL_W + weekCount * w,
    viewW: 0,
    cols: Array.from({ length: weekCount }, (_, i) => ({ left: PERSON_COL_W + i * w, width: w })),
  }
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.5

/** Equal within half a pixel (a re-measure that changes nothing visible does not re-render the chart). */
export function sameGeometry(a: TableGeometry | null, b: TableGeometry | null): boolean {
  if (!a || !b) return a === b
  return (
    close(a.personW, b.personW) &&
    close(a.contentW, b.contentW) &&
    close(a.viewW, b.viewW) &&
    a.cols.length === b.cols.length &&
    a.cols.every((c, i) => close(c.left, b.cols[i]!.left) && close(c.width, b.cols[i]!.width))
  )
}

/** The grid's column model for the workload weeks (week columns only, never expanded). */
function weekColumns(weeks: readonly ISODate[]): GridColumn[] {
  return buildColumns(weeks, new Set(), new Map())
}

/** One <th> of the month-year header row. */
export interface MonthHeaderCell {
  key: MonthKey
  /** index of its first week */
  start: number
  /** number of weeks (colSpan) */
  span: number
  /** px: measured widths of its week columns (nominal WEEK_W each before a measure) */
  width: number
  /** its first week is a month start inside the table (a boundary line on its left edge) */
  monthStart: boolean
  label: { text: string; full: string }
}

/** FR-818's grouping on the workload weeks: contiguous spans by the month of each Monday, labelled for their width. */
export function monthHeaderCells(weeks: readonly ISODate[], g: TableGeometry | null): MonthHeaderCell[] {
  return monthSpans(weekColumns(weeks)).map((s) => {
    let width = 0
    for (let i = s.startIdx; i <= s.endIdx; i++) width += g?.cols[i]?.width ?? WEEK_W
    return {
      key: s.key,
      start: s.startIdx,
      span: s.endIdx - s.startIdx + 1,
      width,
      monthStart: s.startIdx > 0,
      label: monthLabel(s.key, width),
    }
  })
}

/** `W:<monday>` of the first week of each month after the first column (header, body and chart month lines). */
export function workloadMonthStarts(weeks: readonly ISODate[]): Set<string> {
  return monthStartKeys(weekColumns(weeks))
}

/** The chart's columns = the table's week header cells (missing rects → the nominal column after the last one). */
export function tableSlots(weeks: readonly ISODate[], g: TableGeometry): PeriodSlot[] {
  let next = g.personW
  return weeks.map((w, index) => {
    const r = g.cols[index] ?? { left: next, width: WEEK_W }
    next = r.left + r.width
    return { index, key: `W:${w}`, role: 'week', weekStart: w, date: w, left: r.left, width: r.width }
  })
}

/**
 * One series per person of the table (its group / person order, so the table's filters — position, project,
 * onlyOver, applied by the server — and the view apply as they do to the cells). Per week: load = the view's part of
 * { total, committed } (BR-37), capacity, pct = integer half-up (null when cap 0 → a gap), level = BR-40 (X67).
 */
export function workloadSeries(
  groups: readonly WorkloadGroup[],
  weeks: readonly ISODate[],
  view: LoadView,
): LoadSeries[] {
  return groups.flatMap((g) =>
    g.people.map((p) => ({
      userId: p.userId,
      name: p.name,
      points: weeks.map((week) => {
        const c = p.cells[week]
        if (!c) return { week, loadCd: null, capacityCd: null, pct: null, level: null }
        const loadCd = viewLoad({ total: c.total, committed: c.committed }, view)
        return { week, loadCd, capacityCd: c.capacity, pct: loadPct(loadCd, c.capacity), level: c.level }
      }),
    })),
  )
}
