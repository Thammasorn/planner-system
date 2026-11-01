import { describe, expect, it } from 'vitest'
import {
  buildColumns,
  chunksForRange,
  chunkStartOf,
  columnIndexOfPeriod,
  initialScrollIndex,
  timelineStart,
  timelineWeeks,
  WEEK_W,
} from './columns'

const today = '2026-09-30'
const cols = buildColumns(timelineWeeks(today), new Set(), new Map())

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

  it('throws for expanded weeks until M7', () => {
    expect(() => buildColumns(timelineWeeks(today), new Set(['2026-09-28']), new Map())).toThrow(RangeError)
  })
})
