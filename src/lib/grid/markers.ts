// src/lib/grid/markers.ts — placement of the milestone lines on the grid (SPEC BR-102, FR-709/FR-705; M7.1-D12,
// M11.1-D1). Pure. Since M11.1 the line layer draws milestones only (plan markers were merged into milestones).
import { compareISO, weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import type { MilestoneColor } from '@/lib/contracts/milestones'
import type { GridColumn } from './columns'

/** One line of the layer: a milestone (id = the milestone id), its colour (line colour + pattern) and name. */
export interface GridMarkerView {
  id: string
  date: ISODate
  color: MilestoneColor
  label: string
}

/**
 * BR-102: index of the displayed column whose right edge carries a marker on `date` — the week column of a collapsed
 * week; in an expanded week the day column of `date`, else the last shown day before it, else the first shown day.
 * Never the "รวม" column. null when the week is not in `cols`.
 */
export function markerEdgeColumn(date: ISODate, cols: readonly GridColumn[]): number | null {
  const w = weekStart(date)
  let firstDay = -1
  let lastBefore = -1
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]!
    if (c.weekStart !== w) continue
    if (c.role === 'week') return i
    if (c.role !== 'day') continue
    const cmp = compareISO(c.date, date)
    if (cmp === 0) return i
    if (firstDay < 0) firstDay = i
    if (cmp < 0) lastBefore = i
  }
  if (lastBefore >= 0) return lastBefore
  return firstDay >= 0 ? firstDay : null
}

export interface MarkerEdge {
  colIndex: number
  /** right edge of the column, column-offset space */
  x: number
  /** stacked by (date, input order) */
  views: GridMarkerView[]
}

/** Edges sorted by column; markers whose week is not displayed are dropped. */
export function markerEdges(views: readonly GridMarkerView[], cols: readonly GridColumn[]): MarkerEdge[] {
  const byCol = new Map<number, { v: GridMarkerView; order: number }[]>()
  views.forEach((v, order) => {
    const i = markerEdgeColumn(v.date, cols)
    if (i === null) return
    const list = byCol.get(i)
    if (list) list.push({ v, order })
    else byCol.set(i, [{ v, order }])
  })
  return [...byCol.entries()]
    .sort(([a], [b]) => a - b)
    .map(([colIndex, list]) => {
      const c = cols[colIndex]!
      return {
        colIndex,
        x: c.offset + c.width,
        views: list.sort((a, b) => compareISO(a.v.date, b.v.date) || a.order - b.order).map((e) => e.v),
      }
    })
}
