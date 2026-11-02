'use client'
// src/components/load-chart/LoadLineChart.tsx — the "กราฟภาระ" line chart (SPEC FR-813, §8.13, M7.1-D4) drawn on the
// plan grid's own column geometry (M7.1-D30, owner feedback 2026-11-02 "week misalignment"): a hand-written SVG layer
// inside a scroller that VirtualGrid keeps at the grid's scrollLeft. Every rendered grid column is a chart column with
// the same left / width (gridlines = the grid's column edges, month lines on the grid's month starts); each weekly
// point is centred on its week's value column (a collapsed week, or the "รวม" column of an expanded week). The frozen
// area holds the y axis, the sticky "รวม" area is blank like the grid's (the chart plots weekly loads only).
import { memo, useMemo, useState } from 'react'
import type { CellUnit } from '@/domain/types'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import {
  linePath,
  niceScale,
  slotAt,
  slotCenter,
  valueSlotOf,
  valueSlots,
  yOf,
  type PeriodSlot,
} from '@/lib/grid/chart-geometry'
import { AlignedScroller } from './AlignedScroller'
import {
  alertPoints,
  alertText,
  capacityValue,
  pointText,
  pointValue,
  seriesIdOf,
  type ChartPerson,
} from './chart-model'
import { ShapeGlyph, ShapePath } from './ShapeGlyph'
import styles from './LoadChart.module.css'
import type { ChartLayout, LoadSeries } from './types'

export interface LoadLineChartProps {
  layout: ChartLayout
  series: readonly LoadSeries[]
  /** chartPeople(series): colour + shape per person, same order */
  people: readonly ChartPerson[]
  unit: CellUnit
  /** the focused person (legend): others fade, DAYS shows their capacity dashed */
  focused: string | null
  height: number
}

/** Plot box inside the chart height: a top margin for the highest point, the x tick labels at the bottom. */
export const PLOT_TOP = 12
export const AXIS_H = 22

function fmtTick(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}

export const LoadLineChart = memo(function LoadLineChart(p: LoadLineChartProps) {
  const { layout, series, people, unit, focused } = p
  const plotH = p.height - PLOT_TOP - AXIS_H
  const slots = layout.slots
  const values = useMemo(() => valueSlots(slots), [slots])
  const alerts = useMemo(() => alertPoints(series), [series])
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const focusedPerson = people.find((x) => x.userId === focused) ?? null

  /** week → value slot (the x of that week's point) */
  const xOfWeek = useMemo(() => new Map(values.map((s) => [s.weekStart, slotCenter(s)])), [values])

  const scale = useMemo(() => {
    let max = unit === 'FRACTION' ? 1 : 0
    for (const s of series)
      for (const pt of s.points) {
        const v = pointValue(pt, unit)
        if (v !== null && v > max) max = v
        if (unit === 'DAYS' && focusedPerson?.userId === s.userId) {
          const c = capacityValue(pt)
          if (c !== null && c > max) max = c
        }
      }
    return niceScale(max)
  }, [series, unit, focusedPerson])
  const y = (v: number) => yOf(v, scale.max, PLOT_TOP, plotH)

  const first = slots[0]
  const last = slots[slots.length - 1]
  const x0 = first?.left ?? 0
  const spanW = last ? last.left + last.width - x0 : 0

  const lines = useMemo(
    () =>
      series.map((s) => {
        const pts = s.points
          .filter((pt) => xOfWeek.has(pt.week))
          .map((pt) => ({ pt, x: xOfWeek.get(pt.week)! - x0, v: pointValue(pt, unit) }))
        return { s, pts }
      }),
    [series, xOfWeek, x0, unit],
  )

  const hover = hoverKey ? slots.find((s) => s.key === hoverKey) : undefined
  const hoverValue = hover ? valueSlotOf(slots, hover) : null
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const s = slotAt(slots, e.clientX - box.left + x0)
    setHoverKey(s ? s.key : null)
  }
  const capSeries =
    unit === 'DAYS' && focusedPerson ? series.find((s) => s.userId === focusedPerson.userId) : undefined

  return (
    <AlignedScroller layout={layout} className={styles.chartScroller}>
      <div
        className={styles.track}
        style={{ width: layout.contentWidth, height: p.height }}
        data-testid="load-line-chart"
        role="img"
        aria-label={th.loadChart.title}
        onPointerLeave={() => setHoverKey(null)}
      >
        <div className={styles.frozen} aria-hidden="true">
          <span className={styles.axisUnit}>
            {unit === 'DAYS' ? th.loadChart.unitDays : th.loadChart.unitFraction}
          </span>
          {scale.ticks.map((t) => (
            <span key={t} className={styles.yTick} style={{ top: y(t) }}>
              {fmtTick(t)}
            </span>
          ))}
          {unit === 'FRACTION' ? (
            <span className={styles.yRefLabel} style={{ top: y(1) }}>
              {th.loadChart.fullCapacity}
            </span>
          ) : null}
        </div>

        {/* one chart column per rendered grid column: same left / width, right border = the grid's column edge */}
        <div
          className={styles.cols}
          style={{ left: x0, width: spanW, height: PLOT_TOP + plotH }}
          aria-hidden="true"
          onPointerMove={onPointerMove}
        >
          {slots.map((s) => (
            <div
              key={s.key}
              className={styles.col}
              style={{ left: s.left - x0, width: s.width }}
              data-chart-col={s.key}
              data-role={s.role}
              data-month-start={layout.monthStarts.has(s.key) ? '' : undefined}
              data-hover={hoverValue?.weekStart === s.weekStart ? 'true' : undefined}
            />
          ))}
        </div>

        <svg
          className={styles.plot}
          style={{ left: x0 }}
          width={Math.max(0, spanW)}
          height={PLOT_TOP + plotH}
          aria-hidden="true"
          focusable="false"
        >
          {scale.ticks.map((t) => (
            <line key={t} x1={0} x2={spanW} y1={y(t)} y2={y(t)} className={styles.hLine} />
          ))}
          {unit === 'FRACTION' ? (
            <line x1={0} x2={spanW} y1={y(1)} y2={y(1)} className={styles.refLine} />
          ) : null}
          {capSeries && focusedPerson ? (
            <path
              d={linePath(
                capSeries.points
                  .filter((pt) => xOfWeek.has(pt.week))
                  .map((pt) => {
                    const c = capacityValue(pt)
                    return { x: xOfWeek.get(pt.week)! - x0, y: c === null ? null : y(c) }
                  }),
              )}
              className={styles.capLine}
              stroke={focusedPerson.color}
              data-series="cap"
            />
          ) : null}
          {lines.map(({ s, pts }, i) => {
            const person = people[i]!
            const faded = focusedPerson !== null && focusedPerson.userId !== s.userId
            return (
              <g key={s.userId} data-series={seriesIdOf(s.userId)} opacity={faded ? 0.3 : 1}>
                <path
                  d={linePath(pts.map((q) => ({ x: q.x, y: q.v === null ? null : y(q.v) })))}
                  className={styles.line}
                  stroke={person.color}
                />
                {pts.map((q) => {
                  if (q.v === null) return null
                  const level = alerts.get(`${seriesIdOf(s.userId)}:${s.points.indexOf(q.pt)}`)
                  return (
                    <g
                      key={q.pt.week}
                      transform={`translate(${q.x} ${y(q.v)})`}
                      data-chart-point=""
                      data-user={s.userId}
                      data-week={q.pt.week}
                      data-alert={level}
                    >
                      {level ? (
                        <circle
                          r={level === 'OVER' ? 9 : 8}
                          fill="none"
                          stroke={person.color}
                          strokeWidth={2}
                          strokeDasharray={level === 'RISK' ? '3 2' : undefined}
                        />
                      ) : null}
                      <g transform="translate(-6 -6)">
                        <ShapePath shape={person.shape} color={person.color} />
                      </g>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>

        {layout.markerEdges.map((e) => {
          const v = e.views[0]!
          return (
            <div
              key={e.colIndex}
              aria-hidden="true"
              className={styles.markerLine}
              style={{ left: layout.frozenWidth + e.x - 1, height: PLOT_TOP + plotH }}
              data-tone={v.tone}
              data-chart-marker={e.views.map((x) => x.id).join(',')}
            />
          )
        })}

        {values.map((s) => (
          <span
            key={s.key}
            aria-hidden="true"
            className={styles.xTick}
            style={{ left: s.left, width: s.width, top: PLOT_TOP + plotH }}
            data-chart-tick={s.key}
            data-week={s.weekStart}
          >
            {formatWeekHeader(s.weekStart)}
          </span>
        ))}

        {hoverValue ? (
          <Tooltip slot={hoverValue} slots={slots} series={series} people={people} unit={unit} />
        ) : null}

        <div className={styles.cover} aria-hidden="true" />
      </div>
    </AlignedScroller>
  )
})

function Tooltip(p: {
  slot: PeriodSlot
  slots: readonly PeriodSlot[]
  series: readonly LoadSeries[]
  people: readonly ChartPerson[]
  unit: CellUnit
}) {
  const i = p.slots.indexOf(p.slot)
  const flip = i > p.slots.length / 2
  return (
    <div
      role="tooltip"
      className={styles.tooltip}
      style={{
        left: slotCenter(p.slot),
        transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
      }}
      data-testid="load-chart-tooltip"
    >
      <div className={styles.tooltipTitle}>{th.loadChart.week(formatWeekHeader(p.slot.weekStart))}</div>
      {p.series.map((s, k) => {
        const pt = s.points.find((x) => x.week === p.slot.weekStart)
        if (!pt) return null
        const person = p.people[k]!
        const alert = alertText(pt)
        return (
          <div key={s.userId} className={styles.tooltipRow}>
            <ShapeGlyph shape={person.shape} color={person.color} />
            <span>{s.name}</span>
            <span className={styles.tooltipValue}>
              {pointText(pt, p.unit)}
              {alert ? ` · ${alert}` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
