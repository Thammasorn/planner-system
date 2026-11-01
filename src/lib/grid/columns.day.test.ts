// plan/m07 S3.1 — day and "รวม" columns of expanded weeks (M7-D10, M6-D35).
import { describe, expect, it } from 'vitest'
import { buildColumns, columnIndexOfPeriod, DAY_W, WEEK_TOTAL_W, WEEK_W, WIDTH } from './columns'

const weeks = ['2026-09-21', '2026-09-28', '2026-10-05']

describe('buildColumns — expanded weeks (S3.1)', () => {
  it('Mon–Fri placeholders + รวม when no D: dates are loaded', () => {
    const cols = buildColumns(weeks, new Set(['2026-09-28']), new Map())
    expect(cols.map((c) => c.key)).toEqual([
      'W:2026-09-21',
      'D:2026-09-28',
      'D:2026-09-29',
      'D:2026-09-30',
      'D:2026-10-01',
      'D:2026-10-02',
      'W:2026-09-28',
      'W:2026-10-05',
    ])
    expect(cols.map((c) => c.kind)).toEqual(['W', 'D', 'D', 'D', 'D', 'D', 'W', 'W'])
    expect(cols.map((c) => c.role)).toEqual(['week', 'day', 'day', 'day', 'day', 'day', 'weekTotal', 'week'])
    expect(cols.map((c) => c.width)).toEqual([64, 44, 44, 44, 44, 44, 52, 64])
    let offset = 0
    for (const c of cols) {
      expect(c.offset).toBe(offset)
      offset += c.width
    }
    expect(cols.slice(1, 7).every((c) => c.weekStart === '2026-09-28')).toBe(true)
    expect(cols[3]!.date).toBe('2026-09-30')
    expect(cols[6]!.date).toBe('2026-09-28')
  })

  it('loaded dates win (a Sunday with a DAY row → 6 day columns)', () => {
    const dates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-04']
    const cols = buildColumns(weeks, new Set(['2026-09-28']), new Map([['2026-09-28', dates]]))
    expect(cols.filter((c) => c.kind === 'D').map((c) => c.date)).toEqual(dates)
    expect(cols).toHaveLength(2 + 6 + 1)
  })

  it('columnIndexOfPeriod finds a day column', () => {
    const cols = buildColumns(weeks, new Set(['2026-09-28']), new Map())
    expect(columnIndexOfPeriod(cols, 'D:2026-09-30')).toBe(3)
  })

  it('widths', () => {
    expect(WIDTH.week).toBe(WEEK_W)
    expect(WIDTH.day).toBe(DAY_W)
    expect(WIDTH.weekTotal).toBe(WEEK_TOTAL_W)
    expect([DAY_W, WEEK_TOTAL_W]).toEqual([44, 52])
  })

  it('nothing expanded → M6 output (regression)', () => {
    const cols = buildColumns(weeks, new Set(), new Map([['2026-09-28', ['2026-09-28']]]))
    expect(cols).toEqual(
      weeks.map((w, i) => ({ key: `W:${w}`, kind: 'W', role: 'week', weekStart: w, date: w, width: 64, offset: 64 * i })),
    )
  })
})
