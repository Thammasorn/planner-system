'use client'
// src/components/grid/MarkerLayer.tsx — the milestone line layer of the grid (SPEC BR-102, FR-709, M7.1-D12; since
// M11.1 milestones only — plan markers were merged into milestones). One markerEdges() result feeds three pieces so they
// never drift (R6): `MarkerLines piece="header"` inside the sticky header block, `piece="body"` inside the sized body
// (height = rows × ROW_H) and `piece="footer"` inside the sticky footer — 2 px lines at the right edge of the column,
// aria-hidden (the ◆ above carries the name and colour), in the milestone's colour with a pattern per colour
// (PURPLE dash-dot · RED solid · YELLOW dashed · GREEN dotted · BLUE double), never colour alone. Only edges inside the
// rendered column window are drawn.
import type { VirtualItem } from '@tanstack/react-virtual'
import { memo, type JSX } from 'react'
import type { GridColumn } from '@/lib/grid/columns'
import type { MarkerEdge } from '@/lib/grid/markers'
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
            data-color={v.color}
            data-marker-ids={e.views.map((x) => x.id).join(',')}
          />
        )
      })}
    </>
  )
})
