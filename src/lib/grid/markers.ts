// src/lib/grid/markers.ts — plan-marker placement on the grid (SPEC FR-819/820, BR-102, M7.1-D11/D12). Pure.
// One layer for plan markers (M7.1) and milestones (M8): placement works on GridMarkerView, whatever its source.
import { addDays, compareISO, weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import type { GridMarkerView, PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import type { GridColumn } from './columns'

/** Plan markers → layer views, in input order (the API orders by date, created_at). */
export function toMarkerViews(markers: readonly PlanMarkerDTO[], canEdit: boolean): GridMarkerView[] {
  return markers.map((m) => ({
    id: m.id,
    source: 'PLAN',
    date: m.date,
    tone: m.color,
    label: m.label,
    editable: canEdit,
  }))
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

/** Default date of a marker added from a column header: a day column → that day; else Friday of the week. */
export function defaultMarkerDate(col: GridColumn): ISODate {
  return col.role === 'day' ? col.date : addDays(col.weekStart, 4)
}

/** Default date of a marker added from the toolbar: Friday of the week of `today`. */
export function defaultToolbarMarkerDate(today: ISODate): ISODate {
  return addDays(weekStart(today), 4)
}
