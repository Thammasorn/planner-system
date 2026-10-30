'use client'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react'

export type Col = { key: string; kind: 'WEEK' | 'DAY'; label: string }
export type Row = { key: string; label: string }

export const FIRST_COL_W = 260
export const HEADER_H = 56
export const ROW_H = 32
export const WEEK_W = 72
export const DAY_W = 52

export type VirtualGridHandle = { scrollToColumn: (index: number) => void }

type Props = {
  rows: readonly Row[]
  cols: readonly Col[]
  renderCell: (row: Row, col: Col) => React.ReactNode
  /** sticky bottom totals row (FR-806) */
  footerLabel?: React.ReactNode
  renderFooterCell?: (col: Col) => React.ReactNode
  /** called when the user nears an edge; parent prepends/appends columns */
  onNearStart?: () => void
  onNearEnd?: () => void
  ref?: Ref<VirtualGridHandle> // React 19: ref is a regular prop
}

export function VirtualGrid({ rows, cols, renderCell, footerLabel, renderFooterCell, onNearStart, onNearEnd, ref }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const rowV = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    getItemKey: useCallback((i: number) => rows[i]?.key ?? i, [rows]),
    paddingStart: HEADER_H, // rows start below the sticky header
    scrollPaddingStart: HEADER_H,
    overscan: 8,
    useFlushSync: false, // React 19: avoid "flushSync was called from inside a lifecycle method"
  })

  const colV = useVirtualizer({
    horizontal: true,
    count: cols.length,
    getScrollElement: () => scrollRef.current,
    // Fixed widths per kind; a NEW getItemKey identity (deps [cols]) is what makes the
    // virtualizer re-measure — estimateSize changes alone are NOT observed (virtual-core 3.17 memo deps).
    estimateSize: (i) => (cols[i]?.kind === 'DAY' ? DAY_W : WEEK_W),
    getItemKey: useCallback((i: number) => cols[i]?.key ?? i, [cols]),
    paddingStart: FIRST_COL_W, // leave room for the sticky first column
    scrollPaddingStart: FIRST_COL_W, // scrollToIndex aligns right after the sticky column
    anchorTo: 'end', // keep the first visible column (by key) in place when columns are prepended
    overscan: 4,
    useFlushSync: false,
  })

  useImperativeHandle(ref, () => ({
    scrollToColumn: (index) => colV.scrollToIndex(index, { align: 'start' }),
  }))

  const vCols = colV.getVirtualItems()
  const vRows = rowV.getVirtualItems()
  const firstCol = vCols[0]?.index
  const lastCol = vCols[vCols.length - 1]?.index

  useEffect(() => {
    if (firstCol === undefined || lastCol === undefined) return
    if (firstCol <= 2) onNearStart?.()
    if (lastCol >= cols.length - 3) onNearEnd?.()
  }, [firstCol, lastCol, cols.length, onNearStart, onNearEnd])

  const totalW = colV.getTotalSize()
  const totalH = rowV.getTotalSize()

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-rowcount={rows.length + 1}
      aria-colcount={cols.length + 1}
      style={{ height: '100%', overflow: 'auto', position: 'relative', contain: 'strict' }}
    >
      <div style={{ width: totalW, height: totalH, position: 'relative' }}>
        {/* sticky header row */}
        <div role="row" aria-rowindex={1} style={{ position: 'sticky', top: 0, zIndex: 2, height: HEADER_H, width: totalW }}>
          <div role="columnheader" aria-colindex={1} style={{ position: 'sticky', left: 0, zIndex: 3, width: FIRST_COL_W, height: HEADER_H, background: 'var(--mui-palette-background-paper, #fff)' }} />
          {vCols.map((c) => {
            const col = cols[c.index]
            if (!col) return null
            return (
              <div key={c.key} role="columnheader" aria-colindex={c.index + 2} data-col-key={col.key}
                style={{ position: 'absolute', top: 0, left: c.start, width: c.size, height: HEADER_H }}>
                {col.label}
              </div>
            )
          })}
        </div>
        {/* body rows: absolutely positioned by `top` (not transform) so sticky cells inside behave */}
        {vRows.map((r) => {
          const row = rows[r.index]
          if (!row) return null
          return (
            <div key={r.key} role="row" aria-rowindex={r.index + 2}
              style={{ position: 'absolute', top: r.start, left: 0, width: totalW, height: r.size }}>
              <div role="rowheader" aria-colindex={1}
                style={{ position: 'sticky', left: 0, zIndex: 1, width: FIRST_COL_W, height: r.size, background: 'var(--mui-palette-background-paper, #fff)' }}>
                {row.label}
              </div>
              {vCols.map((c) => {
                const col = cols[c.index]
                if (!col) return null
                return (
                  <div key={c.key} role="gridcell" aria-colindex={c.index + 2}
                    style={{ position: 'absolute', top: 0, left: c.start, width: c.size, height: r.size }}>
                    {renderCell(row, col)}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {/* sticky footer: in-flow sibling AFTER the sized container (verified in Chromium at top/mid/max scroll) */}
      {renderFooterCell ? (
        <div role="row" aria-rowindex={rows.length + 2} style={{ position: 'sticky', bottom: 0, zIndex: 2, height: ROW_H, width: totalW }}>
          <div role="rowheader" aria-colindex={1} style={{ position: 'sticky', left: 0, zIndex: 3, width: FIRST_COL_W, height: ROW_H, background: 'var(--mui-palette-background-paper, #fff)' }}>
            {footerLabel}
          </div>
          {vCols.map((c) => {
            const col = cols[c.index]
            if (!col) return null
            return (
              <div key={c.key} role="gridcell" aria-colindex={c.index + 2} style={{ position: 'absolute', top: 0, left: c.start, width: c.size, height: ROW_H }}>
                {renderFooterCell(col)}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
