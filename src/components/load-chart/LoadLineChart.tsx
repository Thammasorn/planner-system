'use client'
// src/components/load-chart/LoadLineChart.tsx — the "กราฟภาระ" line chart (SPEC FR-813, §8.13, M7.1-D4) drawn on the
// plan grid's own column geometry (M7.1-D30, owner feedback 2026-11-02 "week misalignment"): a hand-written SVG layer
// inside a scroller that VirtualGrid keeps at the grid's scrollLeft. Every rendered grid column is a chart column with
// the same left / width (gridlines = the grid's column edges, month lines on the grid's month starts); each weekly
// point is centred on its week's value column (a collapsed week, or the "รวม" column of an expanded week). The frozen
// area holds the y axis, the sticky "รวม" area is blank like the grid's (the chart plots weekly loads only).
import { memo, useId, useMemo, useState } from 'react'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import type { LoadDisplay } from '@/lib/load/display'
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
  isOverFull,
  noCapacityNote,
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
  /** M11.1: PERCENT (y = % of each person's own capacity, 100 % line) or DAYS */
  display: LoadDisplay
  /** the focused person (legend): others fade, DAYS shows their capacity dashed */
  focused: string | null
  height: number
}

/** Plot box inside the chart height: a top margin for the highest point, the x tick labels at the bottom. */
export const AXIS_H = 22
/** v3.8 (owner 2026-11-03 "chart too tall"): no y-axis title band inside the chart any more — the unit ("% ของ
 *  capacity" / "วัน") is the hint in the panel's header row. The top margin keeps the highest tick label (centred on
 *  PLOT_TOP, one xs line) and an over-full point's value label inside the chart. */
export const PLOT_TOP = 14
/** The plot itself (~150 px: 2 × --space-… is not a layout length, so a constant like the grid's ROW_H). */
export const PLOT_H = 150
/** The chart's total height (plot + top margin + x labels). */
export const CHART_H = PLOT_TOP + PLOT_H + AXIS_H
/** ~3 y ticks (0 · middle · top) — fewer lines on the shorter plot. */
export const Y_TICKS = 2
/** The "100% (เต็ม capacity)" label sits just below its line (never on the title band, never on the tick column). */
export const REF_LABEL_GAP = 4

function fmtTick(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}

export const LoadLineChart = memo(function LoadLineChart(p: LoadLineChartProps) {
  const { layout, series, people, display, focused } = p
  const plotH = p.height - PLOT_TOP - AXIS_H
  const slots = layout.slots
  const values = useMemo(() => valueSlots(slots), [slots])
  const alerts = useMemo(() => alertPoints(series), [series])
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const focusedPerson = people.find((x) => x.userId === focused) ?? null

  /** week → value slot (the x of that week's point) */
  const xOfWeek = useMemo(() => new Map(values.map((s) => [s.weekStart, slotCenter(s)])), [values])

  const scale = useMemo(() => {
    let max = display === 'PERCENT' ? 100 : 0
    for (const s of series)
      for (const pt of s.points) {
        const v = pointValue(pt, display)
        if (v !== null && v > max) max = v
        if (display === 'DAYS' && focusedPerson?.userId === s.userId) {
          const c = capacityValue(pt)
          if (c !== null && c > max) max = c
        }
      }
    return niceScale(max, Y_TICKS)
  }, [series, display, focusedPerson])
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
          .map((pt) => ({ pt, x: xOfWeek.get(pt.week)! - x0, v: pointValue(pt, display) }))
        return { s, pts }
      }),
    [series, xOfWeek, x0, display],
  )

  const hover = hoverKey ? slots.find((s) => s.key === hoverKey) : undefined
  const hoverValue = hover ? valueSlotOf(slots, hover) : null
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const s = slotAt(slots, e.clientX - box.left + x0)
    setHoverKey(s ? s.key : null)
  }
  const capSeries =
    display === 'DAYS' && focusedPerson ? series.find((s) => s.userId === focusedPerson.userId) : undefined
  const note = useMemo(() => noCapacityNote(series, display), [series, display])
  const patternId = `load-over-${useId().replace(/:/g, '')}`

  return (
    <>
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
            {scale.ticks.map((t) => (
              <span key={t} className={styles.yTick} style={{ top: y(t) }}>
                {fmtTick(t)}
              </span>
            ))}
            {display === 'PERCENT' ? (
              <span className={styles.yRefLabel} style={{ top: y(100) + REF_LABEL_GAP }} data-ref-label="">
                {th.loadChart.fullCapacityPercent}
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
            {display === 'PERCENT' ? (
              <>
                {/* M11.1-D5: the band above 100 % is hatched (never colour alone) */}
                <defs>
                  <pattern
                    id={patternId}
                    width={6}
                    height={6}
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <line x1={0} y1={0} x2={0} y2={6} className={styles.overHatch} />
                  </pattern>
                </defs>
                {scale.max > 100 ? (
                  <rect
                    x={0}
                    y={y(scale.max)}
                    width={Math.max(0, spanW)}
                    height={Math.max(0, y(100) - y(scale.max))}
                    fill={`url(#${patternId})`}
                    className={styles.overBand}
                    data-over-band=""
                  />
                ) : null}
                <line
                  x1={0}
                  x2={spanW}
                  y1={y(100)}
                  y2={y(100)}
                  className={styles.refLine}
                  data-ref-line="100"
                />
              </>
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
                    const overFull = isOverFull(q.pt, display)
                    return (
                      <g
                        key={q.pt.week}
                        transform={`translate(${q.x} ${y(q.v)})`}
                        data-chart-point=""
                        data-user={s.userId}
                        data-week={q.pt.week}
                        data-alert={level}
                        data-over-full={overFull ? 'true' : undefined}
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
                        {overFull && q.pt.pct !== null ? (
                          <text x={0} y={-12} textAnchor="middle" className={styles.overLabel}>
                            {th.loadChart.overFull(q.pt.pct)}
                          </text>
                        ) : null}
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
                data-color={v.color}
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
            <Tooltip slot={hoverValue} slots={slots} series={series} people={people} display={display} />
          ) : null}

          <div className={styles.cover} aria-hidden="true" />
        </div>
      </AlignedScroller>
      {note ? (
        <p className={styles.noCapacityNote} data-testid="load-chart-no-capacity">
          {note}
        </p>
      ) : null}
    </>
  )
})

function Tooltip(p: {
  slot: PeriodSlot
  slots: readonly PeriodSlot[]
  series: readonly LoadSeries[]
  people: readonly ChartPerson[]
  display: LoadDisplay
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
              {pointText(pt, p.display)}
              {alert ? ` · ${alert}` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
