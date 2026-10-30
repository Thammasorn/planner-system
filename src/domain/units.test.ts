import fc from 'fast-check'
// eslint-disable-next-line no-restricted-imports -- test-only: U-UNIT-06 reads units.ts source to guard against float parsing
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cdToNumeric, numericToCd } from './units'

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
