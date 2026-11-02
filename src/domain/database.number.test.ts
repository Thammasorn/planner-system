// BR-91 numbers, BR-92 dates, FR-1410 links, FR-1475 limits (plan/m11 S1.1, S1.2, S1.4, S1.5).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DB_LIMITS as LIB_LIMITS } from '@/lib/schemas/db-limits'
import {
  CANONICAL_DECIMAL_RE,
  DB_LIMITS,
  DbDomainError,
  ME_TOKEN,
  OPTION_COLORS,
  compareDecimal,
  formatNumberCell,
  isCanonicalDecimal,
  isDbUrl,
  parseDateInput,
  parseNumberInput,
  roundDecimalString,
  toScaled,
} from './database'

/** Canonical decimals: random BigInt scaled by 10^6, rendered by hand (independent of the code under test). */
const scaledArb = fc.bigInt({ min: -(10n ** 21n) + 1n, max: 10n ** 21n - 1n })
function render(scaled: bigint): string {
  const neg = scaled < 0n
  const mag = neg ? -scaled : scaled
  const int = (mag / 1_000_000n).toString()
  const frac = (mag % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  if (mag === 0n) return '0'
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '')
}
const canonicalArb = scaledArb.map(render)

describe('limits (S1.1, M11-D37)', () => {
  it('re-exports the single DB_LIMITS source', () => {
    expect(DB_LIMITS).toBe(LIB_LIMITS)
    expect(DB_LIMITS.rows).toBe(1000)
    expect(DB_LIMITS.columns).toBe(30)
  })
  it('ME_TOKEN is "@me"', () => expect(ME_TOKEN).toBe('@me'))
  it('OPTION_COLORS are the 10 token names in palette order (M11-D35)', () => {
    expect(OPTION_COLORS).toEqual([
      'gray',
      'brown',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'pink',
      'red',
      'teal',
    ])
  })
  it('DbDomainError carries a code', () => {
    const e = new DbDomainError('TITLE')
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('TITLE')
    expect(e.name).toBe('DbDomainError')
  })
})

describe('isCanonicalDecimal (BR-91 regex)', () => {
  it.each([
    ['0', true],
    ['12', true],
    ['-12', true],
    ['1234567.891234', true],
    ['999999999999999', true],
    ['0.000001', true],
    ['-0.5', true],
    ['-0', false],
    ['01', false],
    ['1.0', false],
    ['1.', false],
    ['.5', false],
    ['+1', false],
    ['1,000', false],
    ['1000000000000000', false],
    ['0.0000001', false],
    ['1e5', false],
    ['', false],
  ])('%j → %s', (s, ok) => {
    expect(isCanonicalDecimal(s)).toBe(ok)
    if (s !== '-0') expect(CANONICAL_DECIMAL_RE.test(s)).toBe(ok)
  })
})

describe('parseNumberInput (BR-91 typed input)', () => {
  it.each([
    ['12', '12'],
    ['  12  ', '12'],
    ['1,500', '1500'],
    ['1 500 000', '1500000'],
    ['๑๒๓', '123'],
    ['๑,๐๐๐.๕', '1000.5'],
    ['+7', '7'],
    ['-0', '0'],
    ['-0.000', '0'],
    ['+0', '0'],
    ['007', '7'],
    ['1.500', '1.5'],
    ['1.', '1'],
    ['.5', '0.5'],
    ['-.5', '-0.5'],
    ['1234567.891234', '1234567.891234'],
    ['0.1', '0.1'],
    ['1.1234560', '1.123456'],
    ['999999999999999.999999', '999999999999999.999999'],
  ])('%j → %j', (raw, value) => {
    expect(parseNumberInput(raw)).toEqual({ ok: true, value })
  })
  it.each([[''], ['   '], [' , ']])('empty %j → null', (raw) => {
    expect(parseNumberInput(raw)).toEqual({ ok: true, value: null })
  })
  it.each([
    ['abc'],
    ['1.2.3'],
    ['--1'],
    ['+-1'],
    ['-'],
    ['.'],
    ['1e5'],
    ['1000000000000000'],
    ['0.1234567'],
    ['12a'],
    ['½'],
  ])('%j → fail', (raw) => {
    expect(parseNumberInput(raw)).toEqual({ ok: false })
  })
  it('property: canonical strings parse to themselves', () => {
    fc.assert(
      fc.property(canonicalArb, (s) => {
        expect(isCanonicalDecimal(s)).toBe(true)
        expect(parseNumberInput(s)).toEqual({ ok: true, value: s })
      }),
    )
  })
})

describe('toScaled / compareDecimal', () => {
  it.each([
    ['0', 0n],
    ['1', 1_000_000n],
    ['-1.5', -1_500_000n],
    ['0.000001', 1n],
    ['1234567.891234', 1_234_567_891_234n],
  ])('toScaled(%j) = %s', (s, n) => expect(toScaled(s)).toBe(n))
  it('toScaled rejects non-canonical input', () => {
    expect(() => toScaled('1.0')).toThrow(RangeError)
  })
  it('orders as numbers, not strings', () => {
    expect(compareDecimal('9', '10')).toBe(-1)
    expect(compareDecimal('-2', '-10')).toBe(1)
    expect(compareDecimal('1.5', '1.5')).toBe(0)
  })
  it('property: compareDecimal agrees with BigInt', () => {
    fc.assert(
      fc.property(scaledArb, scaledArb, (a, b) => {
        const expected = a < b ? -1 : a > b ? 1 : 0
        expect(compareDecimal(render(a), render(b))).toBe(expected)
        expect(toScaled(render(a))).toBe(a)
      }),
    )
  })
})

describe('roundDecimalString (half-up away from zero on the digits)', () => {
  it.each([
    ['0.1', 2, '0.10'],
    ['1234567.891234', 2, '1234567.89'],
    ['9.995', 2, '10.00'],
    ['9.994', 2, '9.99'],
    ['0.5', 0, '1'],
    ['1.5', 0, '2'],
    ['2.5', 0, '3'],
    ['-0.5', 0, '-1'],
    ['-1.25', 1, '-1.3'],
    ['-0.001', 2, '0.00'],
    ['12', 3, '12.000'],
    ['0.000001', 6, '0.000001'],
    ['999999999999999.999999', 0, '1000000000000000'],
  ])('%j at %i decimals → %j', (v, d, out) => expect(roundDecimalString(v, d)).toBe(out))
  it('rejects decimals outside 0..6', () => {
    expect(() => roundDecimalString('1', 7)).toThrow(RangeError)
    expect(() => roundDecimalString('1', -1)).toThrow(RangeError)
  })
})

describe('formatNumberCell (M11-D36)', () => {
  it.each([
    ['1234567.891234', null, true, '1,234,567.891234'],
    ['1234567.891234', null, false, '1234567.891234'],
    ['1234567.891234', 2, true, '1,234,567.89'],
    ['0.1', 2, true, '0.10'],
    ['-1234', 0, true, '-1,234'],
    ['999', 0, true, '999'],
    ['-999.5', 0, true, '-1,000'],
  ] as const)('%j decimals=%j thousands=%j → %j', (v, decimals, thousands, out) => {
    expect(formatNumberCell(v, { decimals, thousands })).toBe(out)
  })
  it('returns a non-canonical stored value unchanged', () => {
    expect(formatNumberCell('abc', { decimals: 2, thousands: true })).toBe('abc')
  })
  it('property: parse ∘ format(decimals = null) = identity', () => {
    fc.assert(
      fc.property(canonicalArb, fc.boolean(), (s, thousands) => {
        expect(parseNumberInput(formatNumberCell(s, { decimals: null, thousands }))).toEqual({
          ok: true,
          value: s,
        })
      }),
    )
  })
})

describe('parseDateInput (BR-92)', () => {
  const today = '2026-09-30'
  it.each([
    ['2026-11-05', '2026-11-05'],
    [' 2026-11-05 ', '2026-11-05'],
    ['5/11/2569', '2026-11-05'],
    ['05/11/2026', '2026-11-05'],
    ['5/11', '2026-11-05'],
    ['๕/๑๑/๒๕๖๙', '2026-11-05'],
    ['29/2/2567', '2024-02-29'],
    ['1/1/2400', '1857-01-01'],
    ['1/1/2399', '2399-01-01'],
  ])('%j → %j', (raw, out) => expect(parseDateInput(raw, today)).toBe(out))
  it.each([[''], ['  ']])('empty %j → null', (raw) => expect(parseDateInput(raw, today)).toBeNull())
  it.each([
    ['31/2'],
    ['31/2/2026'],
    ['29/2/2566'],
    ['2026-02-30'],
    ['2026-1-5'],
    ['tomorrow'],
    ['5/13'],
    ['0/1/2026'],
    ['5/11/26'],
  ])('%j → invalid', (raw) => expect(parseDateInput(raw, today)).toBe('invalid'))
  it('D/M takes the year of today', () => {
    expect(parseDateInput('29/2', '2028-01-10')).toBe('2028-02-29')
    expect(parseDateInput('29/2', '2027-01-10')).toBe('invalid')
  })
})

describe('isDbUrl (FR-1410)', () => {
  it.each([
    ['https://example.com', true],
    ['http://example.com/a?b=c#d', true],
    ['HTTPS://EXAMPLE.COM', true],
    ['mailto:cindy@example.com', true],
    ['javascript:alert(1)', false],
    ['JavaScript:alert(1)', false],
    ['data:text/html,x', false],
    ['ftp://example.com', false],
    ['https://', false],
    ['mailto:', false],
    ['example.com', false],
    [' https://example.com', false],
    ['https://exa\nmple.com', false],
    ['https://exa\u0000mple.com', false],
    ['https://example.com/\u007f', false],
    ['', false],
  ])('%j → %s', (s, ok) => expect(isDbUrl(s)).toBe(ok))
  it('rejects links longer than the text limit', () => {
    expect(isDbUrl('https://e.com/' + 'a'.repeat(DB_LIMITS.text))).toBe(false)
  })
})
