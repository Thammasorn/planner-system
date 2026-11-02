// src/components/load-chart/chart-model.ts — display model of the "กราฟภาระ" pane (SPEC FR-813, BR-104, M7.1-D4).
// Pure: turns S1's integer-cd LoadSeries into the per-person colour/shape and the display values of the chart and the
// table. Division happens only here, at the display edge (BR-104: cd / 100, pct / 100).
import type { MarkShape } from '@mui/x-charts/models'
import { weekStart } from '@/domain/dates'
import type { CellUnit, Cd } from '@/domain/types'
import { formatCd } from '@/domain/units'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import { chartVar, markerVar } from '@/lib/theme/tokens'
import type { GridMarkerView, MarkerTone } from '@/lib/contracts/plan-markers'
import type { LoadSeries, LoadSeriesPoint } from './types'

/** M7.1-D4: person i → SHAPES[i mod 7] (never colour alone, §8.9). */
export const SHAPES: readonly MarkShape[] = ['circle', 'square', 'triangle', 'diamond', 'cross', 'star', 'wye']

export interface ChartPerson {
  userId: string
  name: string
  /** `var(--chart-n)` — person i gets --chart-{(i mod 8)+1} */
  color: string
  shape: MarkShape
  /** the chart series id (`u:<userId>`) */
  seriesId: string
}

export const seriesIdOf = (userId: string): string => `u:${userId}`
export const CAPACITY_SERIES_ID = 'cap'

export function chartPeople(series: readonly LoadSeries[]): ChartPerson[] {
  return series.map((s, i) => ({
    userId: s.userId,
    name: s.name,
    color: chartVar(i),
    shape: SHAPES[i % SHAPES.length]!,
    seriesId: seriesIdOf(s.userId),
  }))
}

/** y value of a point: DAYS → load in days; FRACTION → pct / 100 (cap 0 → no point). Not loaded → null (gap). */
export function pointValue(p: LoadSeriesPoint, unit: CellUnit): number | null {
  if (p.loadCd === null) return null
  if (unit === 'DAYS') return p.loadCd / 100
  return p.pct === null ? null : p.pct / 100
}

/** The dashed capacity line of the focused person (DAYS only): capacity in days, null when not loaded. */
export function capacityValue(p: LoadSeriesPoint): number | null {
  return p.capacityCd === null ? null : p.capacityCd / 100
}

/** Days with one decimal; 0 shows as "0" (formatCd leaves 0 empty for grid cells). */
export function days1(cd: Cd): string {
  return cd === 0 ? '0' : formatCd(cd, { unit: 'DAYS', decimals: 1 })
}

/** BR-40 OVER/RISK → the tooltip / table text; OK or unknown → null. */
export function alertText(p: LoadSeriesPoint): string | null {
  if (p.level === 'OVER' && p.loadCd !== null && p.capacityCd !== null)
    return th.loadChart.over(days1(Math.max(0, p.loadCd - p.capacityCd)))
  if (p.level === 'RISK') return th.loadChart.risk
  return null
}

/**
 * The value text of one point — tooltip line and table cell (§8.13: "Cindy 2.5 / 5.0 วัน"). FRACTION shows the ratio
 * with two decimals; cap 0 → "ไม่มี capacity"; not loaded → "ยังไม่ได้โหลด".
 */
export function pointText(p: LoadSeriesPoint, unit: CellUnit): string {
  if (p.loadCd === null || p.capacityCd === null) return th.loadChart.notLoaded
  if (unit === 'FRACTION') {
    if (p.pct === null) return th.loadChart.noCapacity
    return `${(p.pct / 100).toFixed(2)} (${th.loadChart.daysValue(days1(p.loadCd), days1(p.capacityCd))})`
  }
  return th.loadChart.daysValue(days1(p.loadCd), days1(p.capacityCd))
}

/** `${seriesId}:${index}` of every OVER/RISK point → the larger ringed mark (M7.1-D4). */
export function alertPoints(series: readonly LoadSeries[]): Map<string, 'OVER' | 'RISK'> {
  const out = new Map<string, 'OVER' | 'RISK'>()
  for (const s of series)
    s.points.forEach((p, i) => {
      if (p.level === 'OVER' || p.level === 'RISK') out.set(`${seriesIdOf(s.userId)}:${i}`, p.level)
    })
  return out
}

/** x-axis labels "28/9" (FR-813: weekly even in day zoom). */
export function weekLabels(weeks: readonly string[]): string[] {
  return weeks.map(formatWeekHeader)
}

export interface ChartReference {
  id: string
  /** the x-axis label of the marker's week */
  x: string
  label: string
  stroke: string
  dash: string | undefined
}

const DASH: Record<MarkerTone, string | undefined> = {
  RED: undefined,
  YELLOW: '6 4',
  GREEN: '2 3',
  MILESTONE: '8 3 2 3',
}

/** Markers whose week is on the x axis → vertical reference lines (FR-813, FR-820); pattern per tone like the grid. */
export function markerReferences(markers: readonly GridMarkerView[], weeks: readonly string[]): ChartReference[] {
  const onAxis = new Set(weeks)
  const out: ChartReference[] = []
  for (const m of markers) {
    const week = weekStart(m.date)
    if (!onAxis.has(week)) continue
    out.push({
      id: m.id,
      x: formatWeekHeader(week),
      label: m.label ?? '',
      stroke: m.tone === 'MILESTONE' ? 'var(--milestone)' : markerVar(m.tone),
      dash: DASH[m.tone],
    })
  }
  return out
}
