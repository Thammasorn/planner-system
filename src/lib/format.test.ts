import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import {
  formatLeaveRange,
  formatThaiDate,
  formatThaiDateRange,
  formatThaiInstantDate,
  formatWeekHeader,
} from './format'

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

describe('formatThaiDateRange / formatLeaveRange (M5)', () => {
  it('two dates joined by an en dash; the same day once', () => {
    expect(formatThaiDateRange('2026-10-05', '2026-10-06')).toBe('5 ต.ค. 2569 – 6 ต.ค. 2569')
    expect(formatThaiDateRange('2026-10-05', '2026-10-05')).toBe('5 ต.ค. 2569')
  })

  it('half days add th.timeOff.halfLong in parentheses', () => {
    expect(formatLeaveRange('2026-10-20', '2026-10-20', 'AM')).toBe(
      `20 ต.ค. 2569 (${th.timeOff.halfLong.AM})`,
    )
    expect(formatLeaveRange('2026-10-20', '2026-10-20', 'AM')).toBe('20 ต.ค. 2569 (ครึ่งวันเช้า)')
    expect(formatLeaveRange('2026-10-20', '2026-10-20', 'PM')).toBe('20 ต.ค. 2569 (ครึ่งวันบ่าย)')
    expect(formatLeaveRange('2026-12-28', '2027-01-04', null)).toBe('28 ธ.ค. 2569 – 4 ม.ค. 2570')
  })

  it('invalid ISO → RangeError', () => {
    expect(() => formatThaiDateRange('2026-02-30', '2026-03-01')).toThrow(RangeError)
    expect(() => formatLeaveRange('2026-10-20', 'x', null)).toThrow(RangeError)
  })
})
