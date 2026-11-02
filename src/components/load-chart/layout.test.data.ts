// Test fixture: a ChartLayout as GridLoadChart builds it from VirtualGrid's column window (M7.1-D30).
import { addWeeks } from '@/domain/dates'
import { periodSlots } from '@/lib/grid/chart-geometry'
import { buildColumns, TOTAL_W } from '@/lib/grid/columns'
import { markerEdges } from '@/lib/grid/markers'
import { monthStartKeys } from '@/lib/grid/months'
import type { GridMarkerView } from '@/lib/contracts/plan-markers'
import type { ChartLayout } from './types'

export const FROZEN = 352
export const W = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'] as const

export function testLayout(
  o: {
    expanded?: string[]
    frozen?: number
    markers?: GridMarkerView[]
    follow?: ChartLayout['follow']
  } = {},
): ChartLayout {
  const weeks = Array.from({ length: 4 }, (_, i) => addWeeks(W[0], i))
  const cols = buildColumns(weeks, new Set(o.expanded ?? []), new Map())
  const frozen = o.frozen ?? FROZEN
  const slots = periodSlots(
    cols,
    cols.map((c, index) => ({ index, start: frozen + c.offset, size: c.width })),
  )
  const last = cols[cols.length - 1]!
  return {
    slots,
    contentWidth: frozen + last.offset + last.width + TOTAL_W,
    frozenWidth: frozen,
    totalColWidth: TOTAL_W,
    viewWidth: 900,
    monthStarts: monthStartKeys(cols),
    markerEdges: markerEdges(o.markers ?? [], cols),
    follow: o.follow ?? (() => undefined),
  }
}
