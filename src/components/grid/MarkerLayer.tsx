'use client'
// src/components/grid/MarkerLayer.tsx — the marker layer of the grid (SPEC FR-819/820, BR-102, M7.1-D12; one layer for
// plan markers now and M8 milestones later, D24). One markerEdges() result feeds three pieces so they never drift (R6):
// `MarkerLines piece="header"` inside the sticky header block, `piece="body"` inside the sized body (height = rows ×
// ROW_H) and `piece="footer"` inside the sticky footer — 2 px lines at the right edge of the column, aria-hidden,
// pattern per tone (RED solid · YELLOW dashed · GREEN dotted · MILESTONE dash-dot), never colour alone. The flags
// (`MarkerFlags`) are buttons in the month row named th.planMarkers.flag(label ?? colour, date); stacked markers at one
// edge show the first flag + "+N". Only edges inside the rendered column window are drawn.
import type { VirtualItem } from '@tanstack/react-virtual'
import { memo, type JSX, type MouseEvent } from 'react'
import { th } from '@/i18n/th'
import type { GridMarkerView } from '@/lib/contracts/plan-markers'
import type { GridColumn } from '@/lib/grid/columns'
import type { MarkerEdge } from '@/lib/grid/markers'
import type { MonthSpan } from '@/lib/grid/months'
import { formatThaiDate } from '@/lib/format'
import styles from './grid.module.css'

/** Edges whose column is inside the rendered window (overscan included). */
export function renderedEdges(edges: readonly MarkerEdge[], vCols: readonly VirtualItem[]): MarkerEdge[] {
  const first = vCols[0]?.index
  const last = vCols[vCols.length - 1]?.index
  if (first === undefined || last === undefined) return []
  return edges.filter((e) => e.colIndex >= first && e.colIndex <= last)
}

/** The frozen padding of the column virtualizer (= task + assignee width): virtual start − column offset. */
export function paddingOf(cols: readonly GridColumn[], vCols: readonly VirtualItem[]): number {
  const v = vCols[0]
  return v ? v.start - (cols[v.index]?.offset ?? 0) : 0
}

/** The accessible name / tooltip of one marker: "<label> · <date>" or "เส้นกำกับ <colour> · <date>". */
export function markerName(v: GridMarkerView): string {
  const date = formatThaiDate(v.date, 'medium')
  if (v.label) return th.planMarkers.flag(v.label, date)
  return v.tone === 'MILESTONE' ? th.planMarkers.flag(null, date) : th.planMarkers.flag(th.planMarkers.color[v.tone], date)
}

export interface MarkerLinesProps {
  piece: 'header' | 'body' | 'footer'
  edges: readonly MarkerEdge[]
  /** frozen padding (px) added to the column-offset x */
  pad: number
  /** body piece: top of the first row and the rows' height */
  top?: number
  height?: number
}

export const MarkerLines = memo(function MarkerLines(p: MarkerLinesProps): JSX.Element {
  return (
    <>
      {p.edges.map((e) => {
        // the first by (date, created) styles the shared edge; every id is listed for tests and the "+N" flag
        const v = e.views[0]!
        return (
          <div
            key={`${e.colIndex}`}
            aria-hidden="true"
            className={styles.markerLine}
            style={{
              left: p.pad + e.x - 1,
              ...(p.piece === 'body' ? { top: p.top ?? 0, height: p.height ?? 0 } : { top: 0, bottom: 0 }),
            }}
            data-marker-line={p.piece}
            data-tone={v.tone}
            data-marker-ids={e.views.map((x) => x.id).join(',')}
          />
        )
      })}
    </>
  )
})

export interface MarkerFlagsProps {
  span: MonthSpan
  edges: readonly MarkerEdge[]
  onOpen: (marker: GridMarkerView, anchor: HTMLElement) => void
  /** "+N": the edge's markers as a list */
  onOpenStack: (edge: MarkerEdge, anchor: HTMLElement) => void
}

/** The flags of the edges inside one month span, right-aligned to their line (left = edge − span start). */
export function MarkerFlags(p: MarkerFlagsProps): JSX.Element | null {
  const mine = p.edges.filter((e) => e.colIndex >= p.span.startIdx && e.colIndex <= p.span.endIdx)
  if (mine.length === 0) return null
  return (
    <>
      {mine.map((e) => {
        const v = e.views[0]!
        const more = e.views.length - 1
        const stop = (ev: MouseEvent) => ev.stopPropagation()
        return (
          <span
            key={e.colIndex}
            className={styles.markerFlagGroup}
            style={{ left: e.x - p.span.left }}
            data-marker-edge={e.colIndex}
          >
            <button
              type="button"
              tabIndex={-1}
              className={styles.markerFlag}
              aria-label={markerName(v)}
              title={markerName(v)}
              data-tone={v.tone}
              data-marker-flag={v.id}
              onPointerDown={stop}
              onClick={(ev) => {
                stop(ev)
                p.onOpen(v, ev.currentTarget)
              }}
            >
              <span aria-hidden="true">⚑</span>
              <span className={styles.markerFlagText} aria-hidden="true">
                {v.label ?? (v.tone === 'MILESTONE' ? '' : th.planMarkers.color[v.tone])}
              </span>
            </button>
            {more > 0 ? (
              <button
                type="button"
                tabIndex={-1}
                className={styles.markerMore}
                aria-label={e.views.map(markerName).join(', ')}
                aria-haspopup="menu"
                data-marker-more={e.colIndex}
                onPointerDown={stop}
                onClick={(ev) => {
                  stop(ev)
                  p.onOpenStack(e, ev.currentTarget)
                }}
              >
                {`+${more}`}
              </button>
            ) : null}
          </span>
        )
      })}
    </>
  )
}
