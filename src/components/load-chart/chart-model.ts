// src/components/load-chart/chart-model.ts — display model of the "กราฟภาระ" pane (SPEC FR-813, BR-104, M7.1-D4).
// Pure: turns S1's integer-cd LoadSeries into the per-person colour/shape and the display values of the chart and the
// table. Division happens only here, at the display edge (BR-104: cd / 100, pct / 100).
import type { CellUnit, Cd } from '@/domain/types'
import { formatCd } from '@/domain/units'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import { chartVar } from '@/lib/theme/tokens'
import type { LoadSeries, LoadSeriesPoint } from './types'

/** The mark shapes (M7.1-D4); drawn by ShapeGlyph / the chart's own SVG (M7.1-D30: no chart library). */
export type MarkShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'star' | 'wye'

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

/**
 * The short text of a table cell on the grid's column width (M7.1-D30): DAYS "2.5/5.0", FRACTION "0.50"; not loaded or
 * no capacity → "–". The full text (pointText) is the cell's accessible text and tooltip.
 */
export function compactText(p: LoadSeriesPoint, unit: CellUnit): string {
  if (p.loadCd === null || p.capacityCd === null) return '–'
  if (unit === 'FRACTION') return p.pct === null ? '–' : (p.pct / 100).toFixed(2)
  return `${days1(p.loadCd)}/${days1(p.capacityCd)}`
}
