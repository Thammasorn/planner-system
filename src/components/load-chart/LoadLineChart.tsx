'use client'
// src/components/load-chart/LoadLineChart.tsx — the MUI X LineChart of the "กราฟภาระ" pane (SPEC FR-813, §8.13,
// M7.1-D2/D4). Loaded only through next/dynamic from LoadChartPanel (plan/research/r9-mui-x-charts.md §4.5): the
// x-charts code never reaches the plan route's initial JS. Imports come from the sub-paths only (bundle budget, r9 §3b).
import { createContext, useContext, useMemo } from 'react'
import Box from '@mui/material/Box'
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine'
import {
  LineChart,
  lineClasses,
  MarkElement,
  type LineSeries,
  type MarkElementProps,
} from '@mui/x-charts/LineChart'
import type { CellUnit } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridMarkerView } from '@/lib/contracts/plan-markers'
import {
  alertPoints,
  alertText,
  CAPACITY_SERIES_ID,
  capacityValue,
  days1,
  markerReferences,
  pointText,
  pointValue,
  weekLabels,
  type ChartPerson,
} from './chart-model'
import type { LoadSeries } from './types'

export interface LoadLineChartProps {
  weeks: readonly string[]
  series: readonly LoadSeries[]
  /** chartPeople(series): colour + shape per person, same order */
  people: readonly ChartPerson[]
  unit: CellUnit
  markers: readonly GridMarkerView[]
  /** the focused person (legend): others fade, DAYS shows their capacity dashed */
  focused: string | null
  height: number
  /** tests pass a width (jsdom has no layout); the app lets the chart fill its parent */
  width?: number
  skipAnimation?: boolean
}

/** OVER/RISK points (`seriesId:index`) — read by the mark slot, which must be a stable component. */
const AlertContext = createContext<ReadonlyMap<string, 'OVER' | 'RISK'>>(new Map())

/** M7.1-D4: an OVER/RISK point keeps its shape and gets an outer ring (larger, outlined mark — not colour alone). */
function LoadMark(props: MarkElementProps) {
  const alerts = useContext(AlertContext)
  const level = alerts.get(`${String(props.seriesId)}:${props.dataIndex}`)
  if (level === undefined) return <MarkElement {...props} />
  const x = Number(props.x)
  const y = Number(props.y)
  return (
    <g data-alert={level}>
      <circle
        cx={x}
        cy={y}
        r={level === 'OVER' ? 9 : 8}
        fill="none"
        stroke={props.color}
        strokeWidth={2}
        strokeDasharray={level === 'RISK' ? '3 2' : undefined}
        opacity={props.hidden ? 0 : 1}
        pointerEvents="none"
      />
      <MarkElement {...props} style={{ ...props.style, fill: props.color }} />
    </g>
  )
}

export function LoadLineChart(p: LoadLineChartProps) {
  const labels = useMemo(() => weekLabels(p.weeks), [p.weeks])
  const alerts = useMemo(() => alertPoints(p.series), [p.series])
  const refs = useMemo(() => markerReferences(p.markers, p.weeks), [p.markers, p.weeks])
  const focusedPerson = p.people.find((x) => x.userId === p.focused) ?? null

  const lines = useMemo<LineSeries[]>(() => {
    const out: LineSeries[] = p.series.map((s, i) => {
      const person = p.people[i]!
      return {
        id: person.seriesId,
        label: person.name,
        data: s.points.map((pt) => pointValue(pt, p.unit)),
        color: person.color,
        shape: person.shape,
        showMark: true,
        connectNulls: false,
        curve: 'linear',
        valueFormatter: (_v, { dataIndex }) => {
          const pt = s.points[dataIndex]
          if (!pt) return null
          const alert = alertText(pt)
          return alert ? `${pointText(pt, p.unit)} · ${alert}` : pointText(pt, p.unit)
        },
      }
    })
    if (p.unit === 'DAYS' && focusedPerson) {
      const s = p.series.find((x) => x.userId === focusedPerson.userId)
      if (s)
        out.push({
          id: CAPACITY_SERIES_ID,
          label: th.loadChart.capacityOf(focusedPerson.name),
          data: s.points.map(capacityValue),
          color: focusedPerson.color,
          showMark: false,
          connectNulls: false,
          curve: 'linear',
          valueFormatter: (_v, { dataIndex }) => {
            const cd = s.points[dataIndex]?.capacityCd
            return cd === null || cd === undefined ? null : days1(cd)
          },
        })
    }
    return out
  }, [p.series, p.people, p.unit, focusedPerson])

  const fade = focusedPerson
    ? {
        [`& .${lineClasses.line}:not([data-series="${focusedPerson.seriesId}"]):not([data-series="${CAPACITY_SERIES_ID}"]), & .${lineClasses.mark}:not([data-series="${focusedPerson.seriesId}"]), & [data-alert]:not(:has([data-series="${focusedPerson.seriesId}"]))`]:
          { opacity: 0.3 },
      }
    : {}

  return (
    <AlertContext value={alerts}>
      <Box
        data-testid="load-line-chart"
        sx={{
          [`& .${lineClasses.line}[data-series="${CAPACITY_SERIES_ID}"]`]: { strokeDasharray: '6 4' },
          ...fade,
        }}
      >
        <LineChart
          height={p.height}
          {...(p.width === undefined ? {} : { width: p.width })}
          series={lines}
          xAxis={[{ scaleType: 'point', data: labels, height: 28 }]}
          yAxis={[{ min: 0, label: p.unit === 'DAYS' ? th.loadChart.unitDays : th.loadChart.unitFraction, width: 48 }]}
          hideLegend
          grid={{ horizontal: true }}
          slots={{ mark: LoadMark }}
          {...(p.skipAnimation ? { skipAnimation: true } : {})}
        >
          {p.unit === 'FRACTION' ? (
            <ChartsReferenceLine
              y={1}
              label={th.loadChart.fullCapacity}
              labelAlign="end"
              lineStyle={{ stroke: 'var(--mui-palette-text-secondary)', strokeDasharray: '4 3' }}
            />
          ) : null}
          {refs.map((r) => (
            <ChartsReferenceLine
              key={r.id}
              x={r.x}
              label={r.label}
              labelAlign="start"
              lineStyle={{ stroke: r.stroke, strokeWidth: 2, strokeDasharray: r.dash }}
            />
          ))}
        </LineChart>
      </Box>
    </AlertContext>
  )
}
