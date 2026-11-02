'use client'
// src/components/grid/GridLoadChart.tsx — the กราฟภาระ pane as VirtualGrid's `renderBelow` (FR-813, M7.1-D30). It gets
// the grid's rendered columns with their x positions and turns them into the chart's layout: the chart and the table
// show exactly the weeks whose value column the grid renders, at the grid's pixels, scrolled with it. Memoised: while
// the column window does not change, scrolling re-renders nothing here (VirtualGrid keeps scrollLeft in sync itself).
import type { VirtualItem } from '@tanstack/react-virtual'
import { memo, useMemo } from 'react'
import type { CellUnit, LoadView, PeriodKey } from '@/domain/types'
import { LoadChartPanel } from '@/components/load-chart/LoadChartPanel'
import type { ChartLayout } from '@/components/load-chart/types'
import { periodSlots, slotWeeks } from '@/lib/grid/chart-geometry'
import type { GridColumn } from '@/lib/grid/columns'
import { memberLoadSeries } from '@/lib/grid/load-series'
import type { MarkerEdge } from '@/lib/grid/markers'
import type { GridModel } from '@/lib/grid/merge'
import { renderedEdges } from './MarkerLayer'
import styles from './grid.module.css'

export interface GridLoadChartProps {
  cols: readonly GridColumn[]
  vCols: readonly VirtualItem[]
  contentWidth: number
  frozenWidth: number
  totalColWidth: number
  viewWidth: number
  follow: ChartLayout['follow']
  model: GridModel | null
  view: LoadView
  unit: CellUnit
  includeOthers: boolean
  onIncludeOthers: (on: boolean) => void
  monthStarts: ReadonlySet<PeriodKey>
  edges: readonly MarkerEdge[]
  today: string
}

export const GridLoadChart = memo(function GridLoadChart(p: GridLoadChartProps) {
  const slots = useMemo(() => periodSlots(p.cols, p.vCols), [p.cols, p.vCols])
  const weekKey = slotWeeks(slots).join(',')
  const weeks = useMemo(() => (weekKey ? weekKey.split(',') : []), [weekKey])
  const series = useMemo(
    () =>
      p.model
        ? memberLoadSeries(p.model, weeks, { view: p.view, includeOthers: p.includeOthers, unit: p.unit })
        : [],
    [p.model, weeks, p.view, p.includeOthers, p.unit],
  )
  const markerEdges = useMemo(() => renderedEdges(p.edges, p.vCols), [p.edges, p.vCols])
  const layout = useMemo<ChartLayout>(
    () => ({
      slots,
      contentWidth: p.contentWidth,
      frozenWidth: p.frozenWidth,
      totalColWidth: p.totalColWidth,
      viewWidth: p.viewWidth,
      monthStarts: p.monthStarts,
      markerEdges,
      follow: p.follow,
    }),
    [
      slots,
      p.contentWidth,
      p.frozenWidth,
      p.totalColWidth,
      p.viewWidth,
      p.monthStarts,
      markerEdges,
      p.follow,
    ],
  )
  return (
    <div className={styles.chartPane} data-testid="chart-pane">
      <LoadChartPanel
        weeks={weeks}
        layout={layout}
        series={series}
        unit={p.unit}
        view={p.view}
        includeOthers={p.includeOthers}
        onIncludeOthers={p.onIncludeOthers}
        today={p.today}
        loading={!p.model}
      />
    </div>
  )
})
