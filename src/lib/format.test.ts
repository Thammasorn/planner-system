import { describe, expect, it, vi } from 'vitest'
import { formatThaiDate, formatThaiInstantDate, formatWeekHeader } from './format'

describe('formatThaiDate', () => {
  it.each([
    ['2026-09-30', '30 ก.ย. 2569'],
    ['2026-12-28', '28 ธ.ค. 2569'],
    ['2027-01-04', '4 ม.ค. 2570'],
    ['2028-02-29', '29 ก.พ. 2571'],
  ])('%s → %s', (iso, expected) => {
    expect(formatThaiDate(iso)).toBe(expected)
  })

  it('formats the long style', () => {
    expect(formatThaiDate('2026-09-30', 'long')).toBe('30 กันยายน 2569')
  })

  it.each(['2026-02-30', '2026-9-30', '', '2026-13-01', '2027-02-29', '2026-09-30T00:00'])(
    'rejects %j with RangeError',
    (bad) => {
      expect(() => formatThaiDate(bad)).toThrow(RangeError)
    },
  )

  it('does not depend on the process time zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(formatThaiDate('2026-09-30')).toBe('30 ก.ย. 2569')
  })
})

describe('formatWeekHeader', () => {
  it.each([
    ['2026-09-28', '28/9'],
    ['2027-01-04', '4/1'],
  ])('%s → %s', (iso, expected) => {
    expect(formatWeekHeader(iso)).toBe(expected)
  })

  it('rejects invalid dates', () => {
    expect(() => formatWeekHeader('2026-02-30')).toThrow(RangeError)
  })
})

describe('formatThaiInstantDate', () => {
  it.each([
    ['2026-09-29T23:30:00Z', '30 ก.ย. 2569'],
    ['2026-09-30T16:59:59Z', '30 ก.ย. 2569'],
    ['2026-09-30T17:00:00Z', '1 ต.ค. 2569'],
  ])('%s → %s (Asia/Bangkok)', (instant, expected) => {
    expect(formatThaiInstantDate(new Date(instant))).toBe(expected)
  })

  it('formats the long style', () => {
    expect(formatThaiInstantDate(new Date('2026-09-30T05:00:00Z'), 'long')).toBe('30 กันยายน 2569')
  })
})
