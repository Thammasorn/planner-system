'use client'
// src/components/grid/VirtualGrid.tsx — one scroll container with a row and a column virtualizer (PLAN §3.10;
// plan/research/snippets/r4/client/components/grid/VirtualGrid.tsx, verified in Chromium, r4 §12–§16).
// Sticky name column, sticky header row, sticky "รวม" column (right: 0) and a sticky footer that is an in-flow sibling
// after the sized body. Rows are absolutely positioned via `top`. ARIA row / column indexes derive from HEADER_ROWS /
// FOOTER_ROWS (C27) so M8's ◆ header row needs no other change.
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import {
  FOOTER_ROWS,
  HEADER_H,
  HEADER_ROWS,
  NAME_COMPACT_W,
  NAME_W,
  nameColumnWidth,
  ROW_H,
  TOTAL_W,
  WEEK_W,
  type GridColumn,
} from '@/lib/grid/columns'
import styles from './grid.module.css'

export interface VirtualGridHandle {
  scrollToColumn: (index: number) => void
  scrollToCell: (r: number, c: number) => void
  /** the first column right of the sticky name column */
  firstVisibleColumn: () => number
  /** whole week columns that fit beside the frozen columns (0 = not measured) */
  fittingColumns: () => number
  element: () => HTMLDivElement | null
}

export interface VirtualGridProps {
  label: string
  saveState: string
  cols: readonly GridColumn[]
  /** body rows (view rows + the quick-add row) */
  rowCount: number
  rowKey: (i: number) => string
  renderRow: (i: number, vCols: readonly VirtualItem[], top: number, totalWidth: number) => ReactNode
  renderHeader: (vCols: readonly VirtualItem[], totalWidth: number) => ReactNode
  renderFooter: (vCols: readonly VirtualItem[], totalWidth: number, firstRowIndex: number) => ReactNode
  /** shown in the body (loading / empty), below the rows when there are some (the quick-add row of an empty grid) */
  message?: ReactNode
  onRangeChange: (firstIdx: number, lastIdx: number) => void
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (e: PointerEvent<HTMLDivElement>) => void
  onCopy?: (e: ClipboardEvent<HTMLDivElement>) => void
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => void
  onBlur?: (e: FocusEvent<HTMLDivElement>) => void
  /** store changes that can move the roving cell (re-checks the root's tab stop, see below) */
  subscribeTabStop?: (fn: () => void) => () => void
  /** Tab reached the root because the roving cell is not rendered: bring it into view and focus it */
  onEnter?: () => void
  ref?: Ref<VirtualGridHandle>
}

/** A rendered roving tab stop of the body (cell or selected row header). */
const TAB_STOP = '[data-cell][tabindex="0"], [data-row-header][tabindex="0"]'

export function VirtualGrid(p: VirtualGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { cols, rowKey } = p
  // The frozen name column shrinks with the grid (phones / narrow tablets) so week columns stay visible (SPEC §7).
  // Its width reaches the sticky cells through --grid-name-w; the virtualizer needs the number.
  const [nameW, setNameW] = useState(NAME_W)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setNameW(nameColumnWidth(el.clientWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rowV = useVirtualizer({
    count: p.rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    getItemKey: useCallback((i: number) => rowKey(i), [rowKey]),
    paddingStart: HEADER_H,
    scrollPaddingStart: HEADER_H,
    scrollPaddingEnd: FOOTER_ROWS * ROW_H,
    overscan: 8,
    useFlushSync: false, // React 19: no "flushSync was called from inside a lifecycle method" (r4 §15)
  })

  const colV = useVirtualizer({
    horizontal: true,
    count: cols.length,
    getScrollElement: () => scrollRef.current,
    // a NEW getItemKey identity (deps [cols]) is what makes the virtualizer re-measure (r4 §14)
    estimateSize: (i) => cols[i]?.width ?? WEEK_W,
    getItemKey: useCallback((i: number) => cols[i]?.key ?? i, [cols]),
    paddingStart: nameW,
    paddingEnd: TOTAL_W,
    scrollPaddingStart: nameW,
    scrollPaddingEnd: TOTAL_W,
    overscan: 4,
    useFlushSync: false,
  })

  useImperativeHandle(p.ref, () => ({
    scrollToColumn: (index) =>
      colV.scrollToIndex(Math.max(0, Math.min(cols.length - 1, index)), { align: 'start' }),
    scrollToCell: (r, c) => {
      if (r >= 0 && r < p.rowCount) rowV.scrollToIndex(r, { align: 'auto' })
      if (c >= 0 && c < cols.length) colV.scrollToIndex(c, { align: 'auto' })
    },
    firstVisibleColumn: () => {
      const left = scrollRef.current?.scrollLeft ?? 0
      return Math.round(left / WEEK_W)
    },
    fittingColumns: () => {
      const w = scrollRef.current?.clientWidth ?? 0
      return w > 0 ? Math.max(1, Math.floor((w - nameColumnWidth(w) - TOTAL_W) / WEEK_W)) : 0
    },
    element: () => scrollRef.current,
  }))

  const vCols = colV.getVirtualItems()
  const vRows = rowV.getVirtualItems()
  const firstCol = vCols[0]?.index
  const lastCol = vCols[vCols.length - 1]?.index
  const { onRangeChange } = p
  useEffect(() => {
    if (firstCol === undefined || lastCol === undefined) return
    const id = requestAnimationFrame(() => onRangeChange(firstCol, lastCol)) // one update per frame
    return () => cancelAnimationFrame(id)
  }, [firstCol, lastCol, onRangeChange])

  // ★ the grid always keeps one Tab stop (§8.9, S3.15): the roving cell is virtualised, so once it scrolls out of the
  // rendered window (◀/▶, wheel, long lists) the root itself becomes tabbable and hands focus on to that cell. Managed
  // on the DOM (not a prop) so moving the roving cell never re-renders the whole grid (M6-D26).
  const syncTabStop = useCallback(() => {
    const el = scrollRef.current
    if (el) el.tabIndex = el.querySelector(TAB_STOP) ? -1 : 0
  }, [])
  useEffect(syncTabStop) // after every render: scrolling changes the rendered window
  const { subscribeTabStop } = p
  useEffect(() => {
    if (!subscribeTabStop) return
    let id: ReturnType<typeof setTimeout> | undefined
    // after the cells re-rendered from the same store change
    const unsub = subscribeTabStop(() => {
      clearTimeout(id)
      id = setTimeout(syncTabStop, 0)
    })
    return () => {
      unsub()
      clearTimeout(id)
    }
  }, [subscribeTabStop, syncTabStop])
  const pointerFocus = useRef(false)
  const { onEnter } = p
  const onFocus = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      const root = e.currentTarget
      const viaPointer = pointerFocus.current
      pointerFocus.current = false
      if (e.target !== root || viaPointer || root.tabIndex !== 0) return
      const from = e.relatedTarget
      if (from instanceof Node && root.contains(from)) return // focus parked on the root from inside the grid
      onEnter?.()
    },
    [onEnter],
  )

  const totalW = colV.getTotalSize()
  const totalH = rowV.getTotalSize()

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={p.label}
      aria-rowcount={HEADER_ROWS + p.rowCount + FOOTER_ROWS}
      aria-colcount={cols.length + 2}
      aria-multiselectable="true"
      data-save-state={p.saveState}
      // initial value only: syncTabStop owns it afterwards (React never rewrites an unchanged prop)
      tabIndex={-1}
      className={styles.scroller}
      style={{ '--grid-name-w': `${nameW}px` } as CSSProperties}
      data-compact={nameW < NAME_COMPACT_W ? 'true' : undefined}
      onKeyDown={p.onKeyDown}
      onFocus={onFocus}
      onPointerDownCapture={() => {
        pointerFocus.current = true
        setTimeout(() => (pointerFocus.current = false), 0)
      }}
      onPointerDown={p.onPointerDown}
      onPointerMove={p.onPointerMove}
      onPointerUp={p.onPointerUp}
      onCopy={p.onCopy}
      onPaste={p.onPaste}
      onBlur={p.onBlur}
    >
      <div
        className={styles.sized}
        // with a message the box grows with it (in flow, sticky-left) instead of clipping it
        style={
          p.message
            ? { width: totalW, minHeight: Math.max(totalH, HEADER_H) }
            : { width: totalW, height: Math.max(totalH, HEADER_H) }
        }
      >
        {p.renderHeader(vCols, totalW)}
        {p.message ? (
          <div className={styles.message} style={{ marginTop: Math.max(0, totalH - HEADER_H) }}>
            {p.message}
          </div>
        ) : null}
        {vRows.map((r) => p.renderRow(r.index, vCols, r.start, totalW))}
      </div>
      {p.renderFooter(vCols, totalW, HEADER_ROWS + p.rowCount + 1)}
    </div>
  )
}
