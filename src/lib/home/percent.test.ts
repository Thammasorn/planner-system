import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { formatPercentTenths, percentTenths } from './percent'

describe('percentTenths (M10-D18, half-up integer tenths)', () => {
  it.each([
    [7250, 10000, 725],
    [1625, 2500, 650],
    [1875, 2500, 750],
    [5875, 10000, 588],
    [7400, 10000, 740],
    [1, 3, 333],
    [2, 3, 667],
    [0, 500, 0],
    [100, 0, null],
    [100, -5, null],
  ] as const)('(%i, %i) → %s', (l, c, out) => {
    expect(percentTenths(l, c)).toBe(out)
  })
})

describe('formatPercentTenths', () => {
  it('formats tenths, null → th.home.manager.noCapacity', () => {
    expect(formatPercentTenths(725)).toBe('72.5%')
    expect(formatPercentTenths(740)).toBe('74.0%')
    expect(formatPercentTenths(0)).toBe('0.0%')
    expect(formatPercentTenths(1234)).toBe('123.4%')
    expect(formatPercentTenths(null)).toBe(th.home.manager.noCapacity)
    expect(formatPercentTenths(null)).toBe('—')
  })
})
