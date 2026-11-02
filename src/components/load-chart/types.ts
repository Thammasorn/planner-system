// src/components/load-chart/types.ts — the load-chart contract (SPEC FR-813, BR-104, M7.1-D3/D4/D5; plan/m07.1 S0.10).
// S1's src/lib/grid/load-series.ts returns LoadSeries[]; S3 passes LoadChartProps to LoadChartPanel; S4 renders it.
import type { OverloadLevel } from '@/domain/overload'
import type { CellUnit, Cd, ISODate, LoadView } from '@/domain/types'
import type { GridMarkerView } from '@/lib/contracts/plan-markers'

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

export interface LoadChartProps {
  /** x axis = the visible weeks (Mondays), 4–26 (M7.1-D5). */
  weeks: ISODate[]
  series: LoadSeries[]
  unit: CellUnit
  view: LoadView
  /** Shared with the footer's switch (FR-806, X29). */
  includeOthers: boolean
  onIncludeOthers(on: boolean): void
  /** Drawn as vertical reference lines at their week (FR-813, FR-820). */
  markers: GridMarkerView[]
  today: ISODate
  loading: boolean
}
