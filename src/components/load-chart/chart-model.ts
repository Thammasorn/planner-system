// src/components/load-chart/chart-model.ts — display model of the "กราฟภาระ" pane (SPEC FR-813, BR-104, M7.1-D4).
// Pure: turns S1's integer-cd LoadSeries into the per-person colour/shape and the display values of the chart and the
// table. Division happens only here, at the display edge (BR-104: cd / 100; the percent is S1's integer pct).
// M11.1 (FR-813, M11.1-D4/D5): the display follows `load.display` — PERCENT (default) or DAYS — not the grid unit.
import type { Cd } from '@/domain/types'
import { formatCd } from '@/domain/units'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import { percentText, type LoadDisplay } from '@/lib/load/display'
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

/** y value of a point: DAYS → load in days; PERCENT → the integer pct (cap 0 → no point, a gap). Not loaded → null. */
export function pointValue(p: LoadSeriesPoint, display: LoadDisplay): number | null {
  if (p.loadCd === null) return null
  if (display === 'DAYS') return p.loadCd / 100
  return p.pct
}

/** M11.1-D5: a PERCENT point above the 100 % line (labelled with its value, never colour alone). */
export function isOverFull(p: LoadSeriesPoint, display: LoadDisplay): boolean {
  return display === 'PERCENT' && p.loadCd !== null && p.pct !== null && p.pct > 100
}

/** PERCENT: "ไม่มี capacity: Cindy 12/10, 19/10 · Ivy 5/10" for loaded weeks with capacity 0 (their line has a gap). */
export function noCapacityNote(series: readonly LoadSeries[], display: LoadDisplay): string | null {
  if (display !== 'PERCENT') return null
  const parts: string[] = []
  for (const s of series) {
    const weeks = s.points.filter((p) => p.loadCd !== null && p.capacityCd === 0).map((p) => formatWeekHeader(p.week))
    if (weeks.length > 0) parts.push(th.loadChart.noCapacityOf(s.name, weeks.join(', ')))
  }
  return parts.length > 0 ? th.loadChart.noCapacityNote(parts.join(' · ')) : null
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
 * The value text of one point — tooltip line and table cell (§8.13). PERCENT: "63% (3.8 / 6.0 วัน)", cap 0 →
 * "ไม่มี capacity"; DAYS: "3.8 / 6.0 วัน"; not loaded → "ยังไม่ได้โหลด".
 */
export function pointText(p: LoadSeriesPoint, display: LoadDisplay): string {
  if (p.loadCd === null || p.capacityCd === null) return th.loadChart.notLoaded
  const days = th.loadChart.daysValue(days1(p.loadCd), days1(p.capacityCd))
  if (display === 'PERCENT') return p.pct === null ? th.loadChart.noCapacity : `${percentText(p.pct)} (${days})`
  return days
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
 * The short text of a table cell on the grid's column width (M7.1-D30): DAYS "2.5/5.0", PERCENT "50%"; not loaded or
 * no capacity (PERCENT) → "–". The full text (pointText) is the cell's accessible text and tooltip.
 */
export function compactText(p: LoadSeriesPoint, display: LoadDisplay): string {
  if (p.loadCd === null || p.capacityCd === null) return '–'
  if (display === 'PERCENT') return p.pct === null ? '–' : percentText(p.pct)
  return `${days1(p.loadCd)}/${days1(p.capacityCd)}`
}
