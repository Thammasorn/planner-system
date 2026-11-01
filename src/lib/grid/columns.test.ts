import { describe, expect, it } from 'vitest'
import {
  buildColumns,
  chunksForRange,
  chunkStartOf,
  columnIndexOfPeriod,
  initialScrollIndex,
  NAME_MIN_W,
  NAME_W,
  nameColumnWidth,
  stickyTotalWidth,
  timelineStart,
  timelineWeeks,
  TOTAL_W,
  WEEK_W,
} from './columns'

const today = '2026-09-30'
const cols = buildColumns(timelineWeeks(today), new Set(), new Map())

describe('nameColumnWidth (SPEC §7 browser support)', () => {
  it('keeps NAME_W on wide grids and before the grid is measured', () => {
    expect(nameColumnWidth(0)).toBe(NAME_W)
    expect(nameColumnWidth(1200)).toBe(NAME_W)
    expect(nameColumnWidth(736)).toBe(NAME_W)
  })
  it('takes 40 % on narrow grids, never below NAME_MIN_W', () => {
    expect(nameColumnWidth(358)).toBe(143)
    expect(nameColumnWidth(200)).toBe(NAME_MIN_W)
  })
  it('leaves room for at least one whole week column at phone width', () => {
    const w = 358 // 390 px viewport − 2 × 16 px page padding
    expect(w - nameColumnWidth(w) - TOTAL_W).toBeGreaterThanOrEqual(WEEK_W)
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
