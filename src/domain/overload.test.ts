// SPEC §5.6 BR-40 (levels) and BR-45 (integer tone bands, X51/X67) — plan/m07 §5.S1.10. BR-41 is M9.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { loadTone, overloadLevel, worstLevel, type LoadTone, type OverloadLevel } from './overload'

describe('overloadLevel (BR-40)', () => {
  it.each<[string, number, number, number, OverloadLevel]>([
    ['load = cap is OK (boundary)', 100, 100, 100, 'OK'],
    ['committed just over cap', 101, 101, 100, 'OVER'],
    ['F4 Cindy day: tentative over cap', 125, 0, 100, 'RISK'],
    ['F2 Jack day', 125, 125, 100, 'OVER'],
    ['half-day leave + 1.0 DAY (r5 M7-10)', 100, 100, 50, 'OVER'],
    ['F3 Peter day', 167, 167, 100, 'OVER'],
    ['nothing on a cap-0 day', 0, 0, 0, 'OK'],
    ['tentative on a cap-0 day', 50, 0, 0, 'RISK'],
    ['committed on a cap-0 day', 50, 50, 0, 'OVER'],
    ['week: committed over', 625, 500, 400, 'OVER'],
    ['week: total over, committed fits', 625, 0, 500, 'RISK'],
  ])('%s: (%i, %i | %i) → %s', (_n, total, committed, cap, level) => {
    expect(overloadLevel({ total, committed }, cap)).toBe(level)
  })

  it('property: OVER ⇔ committed > cap; RISK ⇔ total > cap ≥ committed', () => {
    fc.assert(
      fc.property(fc.nat(2000), fc.nat(2000), fc.nat(1000), (a, b, cap) => {
        const committed = Math.min(a, b)
        const total = Math.max(a, b)
        const level = overloadLevel({ total, committed }, cap)
        expect(level === 'OVER').toBe(committed > cap)
        expect(level === 'RISK').toBe(total > cap && cap >= committed)
      }),
    )
  })
})

describe('loadTone (BR-45)', () => {
  it.each<[number, number, LoadTone]>([
    [0, 0, 'noCapacity'],
    [50, 0, 'over'],
    [0, 100, 'empty'],
    [79, 100, 'light'],
    [80, 100, 'full'],
    [100, 100, 'full'],
    [101, 100, 'over'],
    [150, 300, 'light'],
    [240, 300, 'full'],
    [250, 200, 'over'],
  ])('loadTone(%i, %i) = %s', (load, cap, tone) => {
    expect(loadTone(load, cap)).toBe(tone)
  })

  it("property: 'over' ⇔ (cap > 0 ? load > cap : load > 0)", () => {
    fc.assert(
      fc.property(fc.nat(2000), fc.nat(1000), (load, cap) => {
        expect(loadTone(load, cap) === 'over').toBe(cap > 0 ? load > cap : load > 0)
      }),
    )
  })
})

describe('worstLevel', () => {
  it.each<[OverloadLevel[], OverloadLevel]>([
    [[], 'OK'],
    [['OK', 'OK'], 'OK'],
    [['OK', 'RISK'], 'RISK'],
    [['RISK', 'OVER', 'OK'], 'OVER'],
  ])('worstLevel(%j) = %s', (levels, worst) => {
    expect(worstLevel(levels)).toBe(worst)
  })

  it('accepts any iterable', () => {
    expect(worstLevel(new Set<OverloadLevel>(['RISK']))).toBe('RISK')
  })

  it('property: order-independent', () => {
    const arbLevels = fc.array(fc.constantFrom<OverloadLevel>('OK', 'RISK', 'OVER'), { maxLength: 10 })
    fc.assert(
      fc.property(arbLevels, (levels) => {
        expect(worstLevel([...levels].reverse())).toBe(worstLevel(levels))
        expect(worstLevel([...levels].sort())).toBe(worstLevel(levels))
      }),
    )
  })
})
