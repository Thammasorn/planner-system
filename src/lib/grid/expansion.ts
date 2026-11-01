// src/lib/grid/expansion.ts — which weeks of the grid show day columns (FR-802/803, M7-D10/D11/D24, X53). Pure; the
// state lives in React memory (useExpansion), never in localStorage; the zoom itself is the `grid.zoom` preference.
import { addWeeks, compareISO } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import type { GridPeriod, GridZoom } from '@/lib/contracts/grid'
import type { GridChunk } from '@/lib/query-keys'
import { CHUNK_WEEKS } from './columns'

export interface ExpansionState {
  zoom: GridZoom
  expanded: ReadonlySet<ISODate>
}

/** Expands a collapsed week / collapses an expanded one. DAY zoom → the same object (M7-D11). */
export function toggleWeek(s: ExpansionState, week: ISODate): ExpansionState {
  if (s.zoom === 'DAY') return s
  return s.expanded.has(week) ? collapseWeek(s, week) : expandWeek(s, week)
}

export function expandWeek(s: ExpansionState, week: ISODate): ExpansionState {
  if (s.zoom === 'DAY' || s.expanded.has(week)) return s
  return { zoom: s.zoom, expanded: new Set([...s.expanded, week]) }
}

export function collapseWeek(s: ExpansionState, week: ISODate): ExpansionState {
  if (s.zoom === 'DAY' || !s.expanded.has(week)) return s
  const next = new Set(s.expanded)
  next.delete(week)
  return { zoom: s.zoom, expanded: next }
}

/** DAY zoom → every week. */
export function isExpanded(s: ExpansionState, week: ISODate): boolean {
  return s.zoom === 'DAY' || s.expanded.has(week)
}

/** Per-chunk query part: only the expanded weeks inside [chunkFrom, chunkFrom + 8 weeks), sorted; DAY zoom → expand []. */
export function chunkParams(s: ExpansionState, chunkFrom: ISODate, includeOthers: boolean): GridChunk {
  if (s.zoom === 'DAY') return { from: chunkFrom, expand: [], zoom: 'DAY', includeOthers }
  const to = addWeeks(chunkFrom, CHUNK_WEEKS)
  const expand = [...s.expanded]
    .filter((w) => compareISO(w, chunkFrom) >= 0 && compareISO(w, to) < 0)
    .sort(compareISO)
  return { from: chunkFrom, expand, zoom: 'WEEK', includeOthers }
}

/** The D: dates of the loaded periods per week (input of buildColumns), in date order. */
export function dayDatesByWeek(periods: readonly GridPeriod[]): Map<ISODate, ISODate[]> {
  const out = new Map<ISODate, ISODate[]>()
  for (const p of periods) {
    if (p.kind !== 'DAY') continue
    const list = out.get(p.weekStart)
    if (list) list.push(p.date)
    else out.set(p.weekStart, [p.date])
  }
  for (const list of out.values()) list.sort(compareISO)
  return out
}
