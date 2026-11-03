'use client'
// src/components/workload/WorkloadLoadChart.tsx — the per-person weekly load chart under the /workload table (SPEC
// FR-1011 v3.5, M11.2-D2…D5). The plan page's กราฟภาระ pane (src/components/load-chart/**, FR-813) on the table's
// own measured week columns: one line per person shown in the table (same view and filters — the server already
// applied position / project / onlyOver to the payload), points centred on the week header cells, the "คน" column
// as the frozen y-axis area, month lines on the table's month starts, horizontal scroll locked to the table's both
// ways. Values come only from the /api/workload cells already on the client (masked: per-person totals, no project
// names). Follows `load.display` (the same toggle). Open / closed is the plan chart's `grid.chart` preference
// (M11.2-D4): unset → open here.
import { useId, useLayoutEffect, useMemo } from 'react'
import Button from '@mui/material/Button'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import type { LoadView } from '@/domain/types'
import { LoadChartPanel } from '@/components/load-chart/LoadChartPanel'
import type { ChartLayout } from '@/components/load-chart/types'
import { useLoadDisplay } from '@/components/load/LoadDisplayToggle'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import type { WorkloadResponse } from '@/lib/contracts/workload'
import {
  nominalGeometry,
  tableSlots,
  workloadMonthStarts,
  workloadSeries,
  type TableGeometry,
} from '@/lib/workload/chart'
import styles from './Workload.module.css'

export interface WorkloadLoadChartProps {
  data: WorkloadResponse
  view: LoadView
  /** WorkloadTable's measured header geometry (null before the first measure → nominal columns) */
  geometry: TableGeometry | null
  /** useScrollFollow: the chart scroller's ref callback and the resync after a layout change */
  follow: ChartLayout['follow']
  sync: () => void
}

/** M11.2-D4: the plan chart's preference; never set → open on /workload. */
export function useWorkloadChartOpen(): [boolean, (open: boolean) => void] {
  const { prefs, setPreference } = usePreferences()
  return [prefs['grid.chart'] ?? true, (open) => setPreference('grid.chart', open)]
}

export function WorkloadLoadChart({ data, view, geometry, follow, sync }: WorkloadLoadChartProps) {
  const [open, setOpen] = useWorkloadChartOpen()
  const display = useLoadDisplay()
  const { weeks, groups } = data
  const g = useMemo(
    () => (geometry && geometry.cols.length === weeks.length ? geometry : nominalGeometry(weeks.length)),
    [geometry, weeks.length],
  )
  const slots = useMemo(() => tableSlots(weeks, g), [weeks, g])
  const series = useMemo(() => workloadSeries(groups, weeks, view), [groups, weeks, view])
  const monthStarts = useMemo(() => workloadMonthStarts(weeks), [weeks])
  const layout = useMemo<ChartLayout>(
    () => ({
      slots,
      contentWidth: g.contentW,
      frozenWidth: g.personW,
      totalColWidth: 0,
      viewWidth: g.viewW,
      monthStarts,
      markerEdges: [],
      follow,
      scrollerLabel: th.workload.chart.scroller,
    }),
    [slots, g, monthStarts, follow],
  )
  // the chart's content width follows the table's measure: put its scrollLeft back on the table's
  useLayoutEffect(() => {
    if (open) sync()
  }, [open, layout, sync])
  const panelId = useId()

  return (
    <div className={styles.chartBlock} data-testid="workload-chart">
      <div className={styles.chartBar}>
        <Button
          size="small"
          variant="outlined"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen(!open)}
          startIcon={open ? <ExpandLess /> : <ExpandMore />}
          data-testid="workload-chart-toggle"
        >
          {th.loadChart.toggle}
        </Button>
      </div>
      {open ? (
        <div id={panelId} className={styles.chartFrame}>
          <LoadChartPanel
            weeks={weeks}
            layout={layout}
            series={series}
            display={display}
            view={view}
            today={data.today}
            loading={false}
          />
        </div>
      ) : null}
    </div>
  )
}
