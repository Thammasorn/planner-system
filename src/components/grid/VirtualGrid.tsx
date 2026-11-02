'use client'
// src/components/grid/VirtualGrid.tsx — one scroll container with a row and a column virtualizer (PLAN §3.10;
// plan/research/snippets/r4/client/components/grid/VirtualGrid.tsx, verified in Chromium, r4 §12–§16).
// Sticky frozen columns, sticky header rows, sticky "รวม" column (right: 0) and a sticky footer that is an in-flow sibling
// after the sized body. Rows are absolutely positioned via `top`. ARIA row / column indexes derive from HEADER_ROWS /
// FOOTER_ROWS / FROZEN_COLS (C27, X85) so M8's ◆ header row needs no other change.
// M7.1 (M7.1-D8/D9/D10): two frozen columns งาน / ผู้รับผิดชอบ (frozenWidths → --grid-task-w / --grid-assignee-w /
// --grid-frozen-w on the root, the column virtualizer's paddingStart = their sum); the header block is HEADER_TOTAL_H
// (month row + period row); during a column resize the task width is written to the root's CSS variable in rAF
// (setLiveTaskWidth, no React render per pixel) and the virtualizer re-measures once the new width is committed.
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
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import {
  FOOTER_ROWS,
  gridContentHeight,
  HEADER_ROWS,
  HEADER_TOTAL_H,
  ROW_H,
  stickyTotalWidth,
  TASK_COMPACT_W,
  totalColIndex,
  TOTAL_W,
  WEEK_W,
  type GridColumn,
} from '@/lib/grid/columns'
import { frozenWidths } from '@/lib/grid/frozen'
import styles from './grid.module.css'

export interface VirtualGridHandle {
  scrollToColumn: (index: number) => void
  scrollToCell: (r: number, c: number) => void
  /** the first column right of the sticky name column */
  firstVisibleColumn: () => number
  /** whole week columns that fit beside the frozen columns (0 = not measured) */
  fittingColumns: () => number
  element: () => HTMLDivElement | null
  /** M7.1: the frozen widths in effect (task, assignee) and the scroller's clientWidth (0 = not measured) */
  frozen: () => { task: number; assignee: number; gridWidth: number }
  /** M7.1-D9: live task width during a resize drag — CSS variables only, next animation frame */
  setLiveTaskWidth: (px: number) => void
}

export interface VirtualGridProps {
  label: string
  saveState: string
  cols: readonly GridColumn[]
  /** body rows (view rows + the quick-add row) */
  rowCount: number
  rowKey: (i: number) => string
  renderRow: (i: number, vCols: readonly VirtualItem[], top: number, totalWidth: number) => ReactNode
  /** `view` = the visible period area in column-offset space (null until the scroller is measured) */
  renderHeader: (
    vCols: readonly VirtualItem[],
    totalWidth: number,
    view: { from: number; to: number } | null,
  ) => ReactNode
  renderFooter: (vCols: readonly VirtualItem[], totalWidth: number, firstRowIndex: number) => ReactNode
  /** M7.1: drawn inside the sized body after the rows (marker lines, the drop indicator); `frozenW` = task + assignee */
  renderOverlay?: (
    vCols: readonly VirtualItem[],
    totalWidth: number,
    bodyHeight: number,
    frozenW: number,
  ) => ReactNode
  /** M7.1 (FR-814): the `grid.taskColumnWidth` preference (clamped by frozenWidths); undefined = 240 */
  taskWidth?: number
  /** M7.1 (FR-816): false = no assignee column (the task cells span both frozen ARIA columns) */
  showAssignees?: boolean
  /** M7.1: the scroller's clientWidth after each measure (the resize handle clamps against it) */
  onWidthChange?: (width: number) => void
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
  /** M7: right click → the cell menu */
  onContextMenu?: (e: ReactMouseEvent<HTMLDivElement>) => void
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
  const showAssignees = p.showAssignees ?? true
  // the scroller's clientWidth (0 = not measured): the frozen columns are clamped against it (phones keep week columns
  // visible, SPEC §7) and the sticky "รวม" column absorbs the leftover (stickyTotalWidth)
  const [viewW, setViewW] = useState(0)
  // horizontal scrollbar thickness (0 with overlay scrollbars): part of the scroller's natural height
  const [scrollbarH, setScrollbarH] = useState(0)
  const fw = frozenWidths(viewW, p.taskWidth, showAssignees)
  const nameW = fw.task + fw.assignee
  const liveRaf = useRef(0)
  const { onWidthChange } = p
  useEffect(() => {
    onWidthChange?.(viewW)
  }, [viewW, onWidthChange])
  useEffect(() => () => cancelAnimationFrame(liveRaf.current), [])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // M7.1-D20: the plan page hides the grid with display:none while the calendar shows. A hidden scroller reports
    // scrollLeft/Top 0 (the virtualizers read that on resize and render the timeline start) and may come back with
    // its offsets dropped; nothing fires a scroll event when it is shown again. So the last visible position is
    // kept here, put back on show, and a synthetic scroll event resyncs the virtualizers with the real offsets.
    let hidden = false
    let last: { left: number; top: number } | null = null
    const measure = () => {
      const w = el.clientWidth
      if (w > 0 && hidden) {
        if (last) {
          el.scrollLeft = last.left
          el.scrollTop = last.top
        }
        el.dispatchEvent(new Event('scroll'))
      }
      hidden = w === 0
      setViewW(w)
      if (!hidden) setScrollbarH(Math.max(0, el.offsetHeight - el.clientHeight - el.clientTop * 2))
    }
    const remember = () => {
      if (!hidden && el.clientWidth > 0) last = { left: el.scrollLeft, top: el.scrollTop }
    }
    measure()
    el.addEventListener('scroll', remember, { passive: true })
    if (typeof ResizeObserver === 'undefined') return () => el.removeEventListener('scroll', remember)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', remember)
    }
  }, [])

  const rowV = useVirtualizer({
    count: p.rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    getItemKey: useCallback((i: number) => rowKey(i), [rowKey]),
    paddingStart: HEADER_TOTAL_H,
    scrollPaddingStart: HEADER_TOTAL_H,
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
      // columns have different widths since M7 (day 44 / รวม 52): the first one not scrolled past the name column
      const left = scrollRef.current?.scrollLeft ?? 0
      let lo = 0
      let hi = cols.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        const c = cols[mid]!
        if (c.offset + c.width / 2 <= left) lo = mid + 1
        else hi = mid
      }
      return lo
    },
    fittingColumns: () => {
      const w = scrollRef.current?.clientWidth ?? 0
      if (w <= 0) return 0
      const f = frozenWidths(w, p.taskWidth, showAssignees)
      return Math.max(1, Math.floor((w - f.task - f.assignee - TOTAL_W) / WEEK_W))
    },
    element: () => scrollRef.current,
    frozen: () => ({ task: fw.task, assignee: fw.assignee, gridWidth: viewW }),
    setLiveTaskWidth: (px) => {
      cancelAnimationFrame(liveRaf.current)
      liveRaf.current = requestAnimationFrame(() => {
        const el = scrollRef.current
        if (!el) return
        el.style.setProperty('--grid-task-w', `${px}px`)
        el.style.setProperty('--grid-frozen-w', `${px + fw.assignee}px`)
      })
    },
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
  // SPEC §8.12 / D19: no clipped sliver of a column beside "รวม" — it widens to abut the last whole column
  const totalColW = stickyTotalWidth(cols, colV.scrollOffset ?? 0, viewW, nameW)
  const totalH = rowV.getTotalSize()
  // SPEC §8.12 / D19: sized to its content (shrinking to fit the screen), so a short plan leaves no empty slab and the
  // กราฟภาระ pane sits right under it; with a message (loading / empty) the scroller fills as before
  const contentH = p.message ? undefined : gridContentHeight(totalH, scrollbarH)
  const scrollX = colV.scrollOffset ?? 0
  const headerView = viewW > 0 ? { from: scrollX, to: scrollX + viewW - nameW - totalColW } : null

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={p.label}
      aria-rowcount={HEADER_ROWS + p.rowCount + FOOTER_ROWS}
      aria-colcount={totalColIndex(cols.length)}
      aria-multiselectable="true"
      data-save-state={p.saveState}
      // initial value only: syncTabStop owns it afterwards (React never rewrites an unchanged prop)
      tabIndex={-1}
      className={styles.scroller}
      style={
        {
          '--grid-task-w': `${fw.task}px`,
          '--grid-assignee-w': `${fw.assignee}px`,
          '--grid-frozen-w': `${nameW}px`,
          '--grid-total-w': `${totalColW}px`,
          ...(contentH === undefined ? {} : { '--grid-content-h': `${contentH}px` }),
        } as CSSProperties
      }
      data-fit={contentH === undefined ? undefined : 'content'}
      data-compact={fw.task < TASK_COMPACT_W ? 'true' : undefined}
      data-assignees={showAssignees ? undefined : 'hidden'}
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
      onContextMenu={p.onContextMenu}
    >
      <div
        className={styles.sized}
        // with a message the box grows with it (in flow, sticky-left) instead of clipping it
        style={
          p.message
            ? { width: totalW, minHeight: Math.max(totalH, HEADER_TOTAL_H) }
            : { width: totalW, height: Math.max(totalH, HEADER_TOTAL_H) }
        }
      >
        {p.renderHeader(vCols, totalW, headerView)}
        {p.message ? (
          <div className={styles.message} style={{ marginTop: Math.max(0, totalH - HEADER_TOTAL_H) }}>
            {p.message}
          </div>
        ) : null}
        {vRows.map((r) => p.renderRow(r.index, vCols, r.start, totalW))}
        {p.renderOverlay?.(vCols, totalW, Math.max(0, totalH - HEADER_TOTAL_H), nameW)}
      </div>
      {p.renderFooter(vCols, totalW, HEADER_ROWS + p.rowCount + 1)}
    </div>
  )
}
