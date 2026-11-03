// src/components/load-chart/types.ts — the load-chart contract (SPEC FR-813, BR-104, M7.1-D3/D4/D5; plan/m07.1 S0.10).
// S1's src/lib/grid/load-series.ts returns LoadSeries[]; S3 passes LoadChartProps to LoadChartPanel; S4 renders it.
import type { OverloadLevel } from '@/domain/overload'
import type { Cd, ISODate, LoadView } from '@/domain/types'
import type { LoadDisplay } from '@/lib/load/display'
import type { PeriodSlot } from '@/lib/grid/chart-geometry'
import type { MarkerEdge } from '@/lib/grid/markers'

/** One week of one person. `null` = not loaded yet (a gap, never 0 — M7.1-D5). `pct` = the footer's integer percent. */
export interface LoadSeriesPoint {
  week: ISODate
  loadCd: Cd | null
  capacityCd: Cd | null
  pct: number | null
  level: OverloadLevel | null
}

/** One line = one person of the footer's "ภาระรวม" row (footerTotals order, M7.1-D4). */
export interface LoadSeries {
  userId: string
  name: string
  points: LoadSeriesPoint[]
}

/**
 * M7.1-D30 (owner feedback 2026-11-02): the grid's column geometry, shared by the chart and the table so both line up
 * with the grid's columns and scroll with it. Everything in content coordinates of the grid's scroller.
 */
export interface ChartLayout {
  /** the grid's rendered period columns (VirtualGrid's column window, overscan included) */
  slots: readonly PeriodSlot[]
  /** the grid's content width (frozen + all period columns + the "รวม" padding) */
  contentWidth: number
  /** task + assignee width (0 assignee when hidden) */
  frozenWidth: number
  /** the sticky "รวม" column's width — a blank cover in the chart and the table */
  totalColWidth: number
  /** the grid scroller's clientWidth (0 = not measured) */
  viewWidth: number
  /** keys of the first column of each month (the grid's month lines) */
  monthStarts: ReadonlySet<string>
  /** the grid's milestone line edges inside the rendered window (x = right edge, column-offset space) */
  markerEdges: readonly MarkerEdge[]
  /** ref callback of the pane's horizontal scroller, kept in lockstep with the grid (VirtualGrid `follow`) */
  follow: (el: HTMLElement | null) => (() => void) | undefined
  /** M11.2 (/workload): the scroller's accessible name; absent = th.loadChart.scroller (the plan grid's) */
  scrollerLabel?: string
}

export interface LoadChartProps {
  /** x = exactly the weeks whose value column the grid renders (slotWeeks(layout.slots), M7.1-D30). */
  weeks: ISODate[]
  layout: ChartLayout
  series: LoadSeries[]
  /** M11.1 (FR-813/FR-1010): `load.display` — PERCENT (default) or DAYS; no longer the grid unit */
  display: LoadDisplay
  view: LoadView
  /** Shared with the footer's switch (FR-806, X29). M11.2: absent (/workload — its cells already count every project,
   *  masked) → no "รวมงานโปรเจคอื่น" switch. */
  includeOthers?: boolean
  onIncludeOthers?: (on: boolean) => void
  today: ISODate
  loading: boolean
}
