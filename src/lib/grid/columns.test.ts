import { describe, expect, it } from 'vitest'
import {
  buildColumns,
  chunksForRange,
  chunkStartOf,
  columnIndexOfPeriod,
  FOOTER_ROWS,
  FROZEN_COLS,
  gridContentHeight,
  HEADER_H,
  HEADER_ROWS,
  HEADER_TOTAL_H,
  MS_ROW_H,
  initialScrollIndex,
  MONTH_H,
  periodColIndex,
  ROW_H,
  stickyTotalWidth,
  totalColIndex,
  timelineStart,
  timelineWeeks,
  TOTAL_W,
  WEEK_W,
} from './columns'
import { frozenWidths } from './frozen'

/** The default desktop frozen area (both frozen columns at their default widths, M7.1-D8). */
const defaultFrozen = frozenWidths(1600, undefined, true)
const NAME_W = defaultFrozen.task + defaultFrozen.assignee

const today = '2026-09-30'
const cols = buildColumns(timelineWeeks(today), new Set(), new Map())

describe('header / frozen bookkeeping (M7.1-D8, M7.1-D10, X85)', () => {
  it('M8 (M8-D26 via the M7.1 forward note): three header rows (◆ + month + period); the block is MS_ROW_H + MONTH_H + HEADER_H tall', () => {
    expect(HEADER_ROWS).toBe(3)
    expect(MS_ROW_H).toBe(28)
    expect(HEADER_TOTAL_H).toBe(MS_ROW_H + MONTH_H + HEADER_H)
    expect(FOOTER_ROWS).toBe(3)
  })
  it('period columns start after the two frozen columns; รวม is last', () => {
    expect(FROZEN_COLS).toBe(2)
    expect(periodColIndex(0)).toBe(3)
    expect(totalColIndex(313)).toBe(316)
  })
  it('the default desktop frozen area = งาน 240 + ผู้รับผิดชอบ 112', () => {
    expect(NAME_W).toBe(352)
  })
  it('a phone still shows one whole week column beside both frozen columns', () => {
    const vw = 358 // 390 px viewport − 2 × 16 px page padding
    const w = frozenWidths(vw, undefined, true)
    expect(vw - w.task - w.assignee - TOTAL_W).toBeGreaterThanOrEqual(WEEK_W)
  })
})

describe('columns (FR-801, M6-D15, M6-D35)', () => {
  it('builds 313 week columns of 64 px from today − 156 w to today + 157 w (exclusive)', () => {
    expect(cols).toHaveLength(313)
    expect(cols.every((c) => c.kind === 'W' && c.role === 'week' && c.width === WEEK_W)).toBe(true)
    expect(cols[0]?.key).toBe('W:2023-10-02')
    expect(cols[312]?.key).toBe('W:2029-09-24')
    expect(timelineStart(today)).toBe('2023-10-02')
  })

  it('offsets are cumulative from 0 and date = weekStart', () => {
    expect(cols.slice(0, 3).map((c) => c.offset)).toEqual([0, 64, 128])
    expect(cols[5]?.date).toBe(cols[5]?.weekStart)
  })

  it('finds columns by period key', () => {
    expect(columnIndexOfPeriod(cols, 'W:2026-09-28')).toBe(156)
    expect(columnIndexOfPeriod(cols, 'W:2030-01-07')).toBe(-1)
    expect(columnIndexOfPeriod(cols, 'D:2026-09-30')).toBe(-1)
  })

  it('opens at weekStart(today) − 4 w', () => {
    expect(initialScrollIndex(cols, today)).toBe(152)
    expect(cols[152]?.key).toBe('W:2026-08-31')
  })

  it('aligns chunks to the timeline start in 8-week steps', () => {
    expect(chunkStartOf(today, '2026-09-28')).toBe('2026-08-31')
    expect(chunkStartOf(today, '2026-08-31')).toBe('2026-08-31')
    expect(chunkStartOf(today, '2026-10-26')).toBe('2026-10-26')
    expect(chunkStartOf(today, '2026-10-29')).toBe('2026-10-26')
  })

  it('chunksForRange covers the visible weeks plus one chunk each side', () => {
    expect(chunksForRange(today, '2026-08-31', '2026-12-14')).toEqual([
      '2026-07-06',
      '2026-08-31',
      '2026-10-26',
      '2026-12-21',
    ])
  })

  it('chunksForRange clamps to the timeline', () => {
    expect(chunksForRange(today, '2023-10-02', '2023-10-09')).toEqual(['2023-10-02', '2023-11-27'])
    const last = chunksForRange(today, '2029-09-17', '2029-09-24')
    // 2029-09-17 is in chunk 38 (304 weeks in), 2029-09-24 starts chunk 39 (the last); chunk 40 is past the end
    expect(last).toEqual(['2029-06-04', '2029-07-30', '2029-09-24'])
  })
})

describe('stickyTotalWidth (SPEC §8.12 / D19: รวม abuts the last whole column, no clipped sliver)', () => {
  it('is TOTAL_W before the grid is measured', () => {
    expect(stickyTotalWidth(cols, 0, 0, NAME_W)).toBe(TOTAL_W)
  })
  it('absorbs the leftover at 1920 px (week zoom, scroll aligned to a column)', () => {
    const vw = 1620 // ≈ the plan grid at 1920 × 1080 after the sidebar
    const whole = Math.floor((vw - NAME_W - TOTAL_W) / WEEK_W) // 20
    const w = stickyTotalWidth(cols, 10 * WEEK_W, vw, NAME_W)
    expect(w).toBe(vw - NAME_W - whole * WEEK_W) // 1620 − 260 − 1280 = 80
    expect(NAME_W + whole * WEEK_W + w).toBe(vw) // name + whole weeks + รวม fill the container exactly
  })
  it('equals TOTAL_W when the columns fit exactly', () => {
    expect(stickyTotalWidth(cols, 0, NAME_W + 10 * WEEK_W + TOTAL_W, NAME_W)).toBe(TOTAL_W)
  })
  it('covers a partly scrolled column at the right edge (wheel scroll, any offset)', () => {
    const vw = 1000
    for (const sl of [0, 7, 31.5, 63, 640, 1001]) {
      const w = stickyTotalWidth(cols, sl, vw, NAME_W)
      expect(w).toBeGreaterThanOrEqual(TOTAL_W)
      // the column under the left edge of รวม ends at or before it, i.e. no visible sliver of a later column
      const totalLeft = sl + vw - NAME_W - w // in column-offset space
      const under = cols.find((c) => c.offset < totalLeft && c.offset + c.width >= totalLeft + 1) // sub-pixel overlap ok
      expect(under).toBeUndefined()
      expect(w).toBeLessThan(TOTAL_W + WEEK_W + 1)
    }
  })
  it('works with mixed day / week-total widths (day zoom at 1280)', () => {
    const weeks = timelineWeeks(today)
    const dcols = buildColumns(weeks, new Set(weeks.slice(150, 160)), new Map())
    const start = dcols.findIndex((c) => c.role === 'day')
    const sl = dcols[start]!.offset
    const vw = 980
    const w = stickyTotalWidth(dcols, sl, vw, NAME_W)
    const totalLeft = sl + vw - NAME_W - w
    expect(dcols.some((c) => c.offset + c.width === totalLeft)).toBe(true) // abuts a column boundary
    expect(w).toBeGreaterThanOrEqual(TOTAL_W)
  })
  it('falls back to TOTAL_W when no whole column fits beside the name column', () => {
    expect(stickyTotalWidth(cols, 0, NAME_W + TOTAL_W + 10, NAME_W)).toBe(TOTAL_W)
  })
})

describe('gridContentHeight (§8.12 / D19: the scroller hugs a short plan)', () => {
  it('header + rows + footer + borders (+ scrollbar)', () => {
    expect(gridContentHeight(HEADER_TOTAL_H + 4 * ROW_H)).toBe(HEADER_TOTAL_H + (4 + FOOTER_ROWS) * ROW_H + 4)
    expect(gridContentHeight(HEADER_TOTAL_H + 4 * ROW_H, 15)).toBe(HEADER_TOTAL_H + (4 + FOOTER_ROWS) * ROW_H + 19)
  })
  it('an empty body still has the header', () => {
    expect(gridContentHeight(0)).toBe(HEADER_TOTAL_H + FOOTER_ROWS * ROW_H + 4)
  })
})
