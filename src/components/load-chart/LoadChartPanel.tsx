'use client'
// src/components/load-chart/LoadChartPanel.tsx — the "กราฟภาระ" pane under the grid (SPEC FR-813, BR-104, §8.13,
// M7.1-D2–D5). The grid (S3) computes `series` with memberLoadSeries from its loaded chunks and mounts this panel only
// while the pane is open; the MUI X chart itself is a next/dynamic chunk (ssr: false) fetched on first render here,
// so nothing of @mui/x-charts is in the plan route's initial JS (r9 §3b). This module imports x-charts types only.
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Skeleton from '@mui/material/Skeleton'
import Switch from '@mui/material/Switch'
import useMediaQuery from '@mui/material/useMediaQuery'
import { th } from '@/i18n/th'
import { chartPeople } from './chart-model'
import { LoadTable } from './LoadTable'
import { ShapeGlyph } from './ShapeGlyph'
import styles from './LoadChart.module.css'
import type { LoadChartProps } from './types'

/** §8.13: about 240 px, not resizable in the MVP. */
export const CHART_HEIGHT = 240

function ChartSkeleton() {
  return <Skeleton variant="rounded" height={CHART_HEIGHT} aria-label={th.loadChart.loading} />
}

const LoadLineChart = dynamic(() => import('./LoadLineChart').then((m) => m.LoadLineChart), {
  ssr: false,
  loading: ChartSkeleton,
})

export function LoadChartPanel(p: LoadChartProps) {
  const people = useMemo(() => chartPeople(p.series), [p.series])
  const [asTable, setAsTable] = useState(false)
  /** click / Enter on a legend item pins the person; hover / keyboard focus previews (FR-813) */
  const [pinned, setPinned] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const pinnedLive = people.some((x) => x.userId === pinned) ? pinned : null
  const focused = preview ?? pinnedLive
  const hasData = p.series.length > 0 && p.weeks.length > 0

  return (
    <section data-testid="load-chart-panel" aria-label={th.loadChart.title} className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>{th.loadChart.title}</h2>
        <span className={styles.hint}>{p.unit === 'DAYS' ? th.loadChart.unitDays : th.loadChart.unitFraction}</span>
        <span className={styles.spacer} />
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
            <LoadTable weeks={p.weeks} series={p.series} people={people} unit={p.unit} />
          ) : (
            <div className={styles.chart} role="img" aria-label={th.loadChart.title} data-focused={focused ?? undefined}>
              <LoadLineChart
                weeks={p.weeks}
                series={p.series}
                people={people}
                unit={p.unit}
                markers={p.markers}
                focused={focused}
                height={CHART_HEIGHT}
                skipAnimation={reducedMotion}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}
