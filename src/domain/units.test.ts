import fc from 'fast-check'
// eslint-disable-next-line no-restricted-imports -- test-only: U-UNIT-06 reads units.ts source to guard against float parsing
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  cdToNumeric,
  formatCd,
  fractionHundredths,
  fullCapacityCd,
  halfCapacityCd,
  normalizeNumericInput,
  numericToCd,
  parseCellInput,
  roundToQuarterCd,
  validateCellCd,
} from './units'

describe('numericToCd (BR-02, M1-D22)', () => {
  it.each([
    ['1.00', 100],
    ['1', 100],
    ['0.25', 25],
    ['0.5', 50],
    ['2.50', 250],
    ['0', 0],
    ['0.00', 0],
    ['10', 1000],
  ] as const)('U-UNIT-01 numericToCd(%j) = %i', (v, expected) => {
    expect(numericToCd(v)).toBe(expected)
  })

  it.each([
    ['4.35', 435],
    ['1.15', 115],
    ['0.07', 7],
    ['0.29', 29],
    ['99.99', 9999],
  ] as const)('U-UNIT-02 float traps: numericToCd(%j) = %i', (v, expected) => {
    expect(numericToCd(v)).toBe(expected)
  })
})

describe('cdToNumeric', () => {
  it.each([
    [125, '1.25'],
    [100, '1.00'],
    [5, '0.05'],
    [0, '0.00'],
    [700, '7.00'],
    [9999, '99.99'],
  ] as const)('U-UNIT-03 cdToNumeric(%i) = %j', (cd, expected) => {
    expect(cdToNumeric(cd)).toBe(expected)
  })
})

describe('invalid input', () => {
  it.each(['', 'abc', '-1', '1.234', '1e2', ' 1', '1 ', '.5', '1.', '1000', 'NaN', '0x10'])(
    'U-UNIT-04 numericToCd(%j) throws RangeError',
    (v) => {
      expect(() => numericToCd(v)).toThrow(RangeError)
    },
  )

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'U-UNIT-04 cdToNumeric(%d) throws RangeError',
    (cd) => {
      expect(() => cdToNumeric(cd)).toThrow(RangeError)
    },
  )
})

describe('round trip', () => {
  it('U-UNIT-05 property ∀ cd ∈ [0, 9999]: numericToCd(cdToNumeric(cd)) === cd', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9999 }), (cd) => {
        const s = cdToNumeric(cd)
        expect(s).toMatch(/^\d+\.\d{2}$/)
        expect(numericToCd(s)).toBe(cd)
      }),
      { numRuns: 2000 },
    )
  })
})

describe('no float arithmetic', () => {
  it('U-UNIT-06 implementation uses no parseFloat / Number( / toFixed', () => {
    const src = readFileSync(fileURLToPath(new URL('./units.ts', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/parseFloat|Number\(|toFixed|Math\.round/)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// M6 part (X02, X65, M6-D9/D10; plan/m06 S1.1)
// ---------------------------------------------------------------------------------------------------------------

const DAYS = (capCd = 500, maxCd = 700) => ({ unit: 'DAYS' as const, capCd, maxCd })
const FRAC = (capCd = 500, maxCd = 700) => ({ unit: 'FRACTION' as const, capCd, maxCd })

describe('normalizeNumericInput', () => {
  it.each([
    ['  1,5 ', '1.5'],
    ['๑.๕', '1.5'],
    ['๐๑๒๓๔๕๖๗๘๙', '0123456789'],
    ['ด', 'f'],
    ['้', 'h'],
    ['F', 'f'],
    ['H', 'h'],
    ['50%', '50%'],
  ] as const)('normalizeNumericInput(%j) = %j', (raw, expected) => {
    expect(normalizeNumericInput(raw)).toBe(expected)
  })
})

describe('parseCellInput — DAYS (BR-26, BR-27, M6-D10)', () => {
  it('AC-801 "3" → 300', () => {
    expect(parseCellInput('3', DAYS())).toEqual({ kind: 'value', cd: 300 })
  })

  it.each([
    ['0.125', 25],
    ['0.375', 50],
    [',5', 50],
    ['1,5', 150],
    ['๑.๕', 150],
    [' 2 ', 200],
    ['1.13', 125],
    ['1.12', 100],
    ['7', 700],
    ['.25', 25],
    ['1.', null],
  ] as const)('parseCellInput(%j) → value %j', (raw, cd) => {
    if (cd === null) expect(parseCellInput(raw, DAYS())).toEqual({ kind: 'invalid', reason: 'FORMAT' })
    else expect(parseCellInput(raw, DAYS())).toEqual({ kind: 'value', cd })
  })

  it.each(['0.1', '', '0', '0.0', '   ', '0.12'])('parseCellInput(%j) → clear', (raw) => {
    expect(parseCellInput(raw, DAYS())).toEqual({ kind: 'clear' })
  })

  it.each([
    ['7.25', 'MAX'],
    ['8', 'MAX'],
    ['-1', 'NEGATIVE'],
    ['-0.5', 'NEGATIVE'],
    ['abc', 'FORMAT'],
    ['1.2.3', 'FORMAT'],
    ['1234', 'FORMAT'],
    ['0.12345', 'FORMAT'],
    ['.', 'FORMAT'],
    ['%', 'FORMAT'],
    ['50%', 'FORMAT'], // % only in FRACTION
    ['-x', 'FORMAT'],
    ['1e2', 'FORMAT'],
  ] as const)('parseCellInput(%j) → invalid %s', (raw, reason) => {
    expect(parseCellInput(raw, DAYS())).toEqual({ kind: 'invalid', reason })
  })

  it('a DAY cell max (100) rejects 1.25', () => {
    expect(parseCellInput('1.25', DAYS(100, 100))).toEqual({ kind: 'invalid', reason: 'MAX' })
    expect(parseCellInput('1', DAYS(100, 100))).toEqual({ kind: 'value', cd: 100 })
  })

  it('FR-612 total: 37 100 cd max accepts 371 days', () => {
    expect(parseCellInput('371', DAYS(0, 37_100))).toEqual({ kind: 'value', cd: 37_100 })
    expect(parseCellInput('372', DAYS(0, 37_100))).toEqual({ kind: 'invalid', reason: 'MAX' })
  })
})

describe('parseCellInput — FRACTION (FR-804, AC-803, M6-D9)', () => {
  it.each([
    ['0.5', 500, 250],
    ['1', 500, 500],
    ['0.75', 500, 375],
    ['0.25', 500, 125],
    ['0.33', 500, 175],
    ['50%', 500, 250],
    ['50 %', 500, 250],
    ['0.5', 400, 200],
    ['100%', 400, 400],
    ['12.5%', 400, 50],
  ] as const)('parseCellInput(%j, FRACTION, cap %i) → %i', (raw, cap, cd) => {
    expect(parseCellInput(raw, FRAC(cap))).toEqual({ kind: 'value', cd })
  })

  it('cap 0 parses as days', () => {
    expect(parseCellInput('2', FRAC(0))).toEqual({ kind: 'value', cd: 200 })
    expect(parseCellInput('50%', FRAC(0))).toEqual({ kind: 'invalid', reason: 'FORMAT' })
  })

  it('a fraction above max is MAX; a fraction that rounds to 0 clears', () => {
    expect(parseCellInput('2', FRAC(500))).toEqual({ kind: 'invalid', reason: 'MAX' })
    expect(parseCellInput('0.01', FRAC(500))).toEqual({ kind: 'clear' })
  })
})

describe('parseCellInput — f / h (AC-802, X65)', () => {
  it.each([
    ['f', 300, 300],
    ['h', 300, 150],
    ['ด', 300, 300],
    ['้', 300, 150],
    ['F', 450, 450],
    ['h', 450, 225],
  ] as const)('parseCellInput(%j, cap %i) → %i', (raw, cap, cd) => {
    expect(parseCellInput(raw, DAYS(cap))).toEqual({ kind: 'value', cd })
    expect(parseCellInput(raw, FRAC(cap))).toEqual({ kind: 'value', cd })
  })

  it.each(['f', 'h', 'ด'])('parseCellInput(%j, cap 0) → skip NO_CAPACITY', (raw) => {
    expect(parseCellInput(raw, DAYS(0))).toEqual({ kind: 'skip', reason: 'NO_CAPACITY' })
  })

  it('f above max is MAX', () => {
    expect(parseCellInput('f', DAYS(500, 100))).toEqual({ kind: 'invalid', reason: 'MAX' })
  })
})

describe('fullCapacityCd / halfCapacityCd', () => {
  it.each([
    [450, 225],
    [75, 50],
    [500, 250],
    [25, 25],
    [300, 150],
    [0, 0],
  ] as const)('halfCapacityCd(%i) = %i', (cap, half) => {
    expect(halfCapacityCd(cap)).toBe(half)
  })

  it.each([0, 25, 450, 700])('fullCapacityCd(%i) is exact', (cap) => {
    expect(fullCapacityCd(cap)).toBe(cap)
  })

  it('rejects negative / non-integer capacity', () => {
    expect(() => halfCapacityCd(-25)).toThrow(RangeError)
    expect(() => fullCapacityCd(1.5)).toThrow(RangeError)
  })
})

describe('roundToQuarterCd (BR-27)', () => {
  it.each([
    [12, 0],
    [13, 25],
    [37, 25],
    [38, 50],
    [0, 0],
    [125, 125],
    [699, 700],
  ] as const)('roundToQuarterCd(%i) = %i', (cd, expected) => {
    expect(roundToQuarterCd(cd)).toBe(expected)
  })

  it('rejects negative input', () => {
    expect(() => roundToQuarterCd(-1)).toThrow(RangeError)
  })
})

describe('validateCellCd (BR-26)', () => {
  it.each([
    ['WEEK', 700, 'ok'],
    ['WEEK', 701, 'MAX'],
    ['DAY', 101, 'MAX'],
    ['DAY', 100, 'ok'],
    ['DAY', 0, 'clear'],
    ['WEEK', 0, 'clear'],
    ['WEEK', -25, 'NEGATIVE'],
    ['DAY', 25, 'ok'],
  ] as const)('validateCellCd(%s, %i) = %s', (g, cd, expected) => {
    expect(validateCellCd(g, cd)).toBe(expected)
  })
})

describe('formatCd (§8.8, r8 G12)', () => {
  it.each([
    [375, '3.8'],
    [125, '1.3'],
    [625, '6.3'],
    [1875, '18.8'],
    [35, '0.4'],
    [15, '0.2'],
    [0, ''],
    [100, '1.0'],
    [4, '0.0'],
    [5, '0.1'],
  ] as const)('formatCd(%i, DAYS, 1) = %j', (cd, s) => {
    expect(formatCd(cd, { unit: 'DAYS', decimals: 1 })).toBe(s)
  })

  it.each([
    [375, '3.75'],
    [5, '0.05'],
    [0, ''],
    [1250, '12.50'],
  ] as const)('formatCd(%i, DAYS, 2) = %j', (cd, s) => {
    expect(formatCd(cd, { unit: 'DAYS', decimals: 2 })).toBe(s)
  })

  it.each([
    [250, 500, '0.50'],
    [375, 500, '0.75'],
    [125, 400, '0.31'],
    [500, 500, '1.00'],
    [700, 300, '2.33'],
  ] as const)('formatCd(%i, FRACTION, base %i, 2) = %j', (cd, baseCd, s) => {
    expect(formatCd(cd, { unit: 'FRACTION', baseCd, decimals: 2 })).toBe(s)
  })

  it('FRACTION with base 0 or no base falls back to days (1 decimal, M6-D9)', () => {
    expect(formatCd(500, { unit: 'FRACTION', baseCd: 0, decimals: 2 })).toBe('5.0')
    expect(formatCd(375, { unit: 'FRACTION', decimals: 2 })).toBe('3.8')
  })

  it('FRACTION with 1 decimal rounds half-up', () => {
    expect(formatCd(250, { unit: 'FRACTION', baseCd: 400, decimals: 1 })).toBe('0.6')
  })

  it('negative values carry a sign', () => {
    expect(formatCd(-125, { unit: 'DAYS', decimals: 2 })).toBe('-1.25')
  })

  it('rejects non-integers', () => {
    expect(() => formatCd(1.5, { unit: 'DAYS', decimals: 1 })).toThrow(RangeError)
  })
})

describe('fractionHundredths', () => {
  it.each([
    [250, 500, 50],
    [125, 400, 31],
    [100, 300, 33],
    [200, 300, 67],
  ] as const)('fractionHundredths(%i, %i) = %i', (cd, base, h) => {
    expect(fractionHundredths(cd, base)).toBe(h)
  })

  it('base must be > 0', () => {
    expect(() => fractionHundredths(100, 0)).toThrow(RangeError)
  })
})

/** Half-up rounding of the exact decimal string to 1 decimal, digit by digit (independent of formatCd's formula). */
function referenceOneDecimal(cd: number): string {
  if (cd === 0) return ''
  const s = cdToNumeric(cd) // 'I.DD'
  const [int, dec] = s.split('.') as [string, string]
  let digits = (int + dec[0]!).split('').map((c) => c.charCodeAt(0) - 48)
  if (dec[1]! >= '5') {
    let i = digits.length - 1
    while (i >= 0 && digits[i] === 9) digits[i--] = 0
    if (i < 0) digits = [1, ...digits]
    else digits[i]! += 1
  }
  const str = digits.join('')
  const head = str.slice(0, -1).replace(/^0+(?=\d)/, '')
  return `${head === '' ? '0' : head}.${str.slice(-1)}`
}

describe('units properties', () => {
  it('∀ x ∈ [0, 700]: parse(formatCd(x, DAYS, 2)) = roundToQuarterCd(x) or clear', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 700 }), (x) => {
        const r = parseCellInput(formatCd(x, { unit: 'DAYS', decimals: 2 }), DAYS())
        const q = roundToQuarterCd(x)
        expect(r).toEqual(q === 0 ? { kind: 'clear' } : { kind: 'value', cd: q })
      }),
      { numRuns: 1000 },
    )
  })

  it('every typed value result is a multiple of 25', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^\d{0,3}(\.\d{1,4})?%?$/),
        fc.constantFrom('DAYS' as const, 'FRACTION' as const),
        fc.integer({ min: 0, max: 700 }),
        (raw, unit, capCd) => {
          const r = parseCellInput(raw, { unit, capCd, maxCd: 70_000 })
          if (r.kind === 'value') expect(r.cd % 25).toBe(0)
        },
      ),
      { numRuns: 2000 },
    )
  })

  it('formatCd(x, DAYS, 1) equals the integer half-up reference for every x ∈ [0, 70 000]', () => {
    for (let x = 0; x <= 70_000; x++) {
      const got = formatCd(x, { unit: 'DAYS', decimals: 1 })
      if (got !== referenceOneDecimal(x)) expect(got).toBe(referenceOneDecimal(x))
    }
    expect(formatCd(70_000, { unit: 'DAYS', decimals: 1 })).toBe('700.0')
  })
})
