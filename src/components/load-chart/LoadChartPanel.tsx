'use client'
// src/components/load-chart/LoadChartPanel.tsx — the "กราฟภาระ" pane under the grid (SPEC FR-813, BR-104, §8.13,
// M7.1-D3–D5, D30). The grid computes `series` with memberLoadSeries from its loaded chunks for exactly the weeks it
// renders and mounts this panel (VirtualGrid `renderBelow`) only while the pane is open. The chart and the table are
// laid out on the grid's column geometry (`layout`) and scroll with it (M7.1-D30: a hand-written SVG layer — MUI X
// Charts cannot place points on the grid's mixed-width, virtualized columns).
import { useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Skeleton from '@mui/material/Skeleton'
import Switch from '@mui/material/Switch'
import { LoadDisplayToggle } from '@/components/load/LoadDisplayToggle'
import { th } from '@/i18n/th'
import { chartPeople } from './chart-model'
import { LoadLineChart } from './LoadLineChart'
import { LoadTable } from './LoadTable'
import { ShapeGlyph } from './ShapeGlyph'
import styles from './LoadChart.module.css'
import type { LoadChartProps } from './types'

/** §8.13: about 240 px, not resizable in the MVP. */
export const CHART_HEIGHT = 240

function ChartSkeleton() {
  return <Skeleton variant="rounded" height={CHART_HEIGHT} aria-label={th.loadChart.loading} />
}

export function LoadChartPanel(p: LoadChartProps) {
  const people = useMemo(() => chartPeople(p.series), [p.series])
  const [asTable, setAsTable] = useState(false)
  /** click / Enter on a legend item pins the person; hover / keyboard focus previews (FR-813) */
  const [pinned, setPinned] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const pinnedLive = people.some((x) => x.userId === pinned) ? pinned : null
  const focused = preview ?? pinnedLive
  const hasData = p.series.length > 0 && p.weeks.length > 0

  return (
    <section data-testid="load-chart-panel" aria-label={th.loadChart.title} className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>{th.loadChart.title}</h2>
        <span className={styles.hint}>
          {p.display === 'DAYS' ? th.loadChart.unitDays : th.loadChart.unitPercent}
        </span>
        <span className={styles.spacer} />
        {/* M11.1 (FR-813/FR-1010): % of capacity (default) or days — the shared load.display preference */}
        <LoadDisplayToggle />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={p.includeOthers}
              onChange={(_e, on) => p.onIncludeOthers(on)}
              data-testid="load-chart-include-others"
            />
          }
          label={th.loadChart.includeOthers}
          slotProps={{ typography: { sx: { fontSize: 'var(--font-sm)' } } }}
        />
        <Button
          size="small"
          variant="outlined"
          className={styles.toggle}
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          data-testid="load-chart-table-toggle"
        >
          {asTable ? th.loadChart.chart : th.loadChart.table}
        </Button>
      </div>

      {!hasData ? (
        p.loading ? (
          <ChartSkeleton />
        ) : (
          <p className={styles.empty}>{th.loadChart.empty}</p>
        )
      ) : (
        <>
          <ul className={styles.legend} aria-label={th.loadChart.legend}>
            {people.map((x) => (
              <li key={x.userId}>
                <button
                  type="button"
                  className={styles.legendItem}
                  aria-pressed={pinnedLive === x.userId}
                  title={th.loadChart.focusHint}
                  data-user={x.userId}
                  onClick={() => setPinned((cur) => (cur === x.userId ? null : x.userId))}
                  onMouseEnter={() => setPreview(x.userId)}
                  onMouseLeave={() => setPreview(null)}
                  onFocus={() => setPreview(x.userId)}
                  onBlur={() => setPreview(null)}
                >
                  <ShapeGlyph shape={x.shape} color={x.color} />
                  {x.name}
                </button>
              </li>
            ))}
          </ul>
          {asTable ? (
            <LoadTable layout={p.layout} series={p.series} people={people} display={p.display} />
          ) : (
            <div className={styles.chart} data-focused={focused ?? undefined}>
              <LoadLineChart
                layout={p.layout}
                series={p.series}
                people={people}
                display={p.display}
                focused={focused}
                height={CHART_HEIGHT}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}
