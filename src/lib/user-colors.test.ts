import { describe, expect, it } from 'vitest'
import { USER_COLORS, contrastRatio, pickLeastUsedColor } from './user-colors'

describe('USER_COLORS (X51, M1-D20)', () => {
  it('has 12 distinct #RRGGBB colours', () => {
    expect(USER_COLORS).toHaveLength(12)
    expect(new Set(USER_COLORS).size).toBe(12)
    for (const c of USER_COLORS) expect(c).toMatch(/^#[0-9A-F]{6}$/)
  })

  it.each(USER_COLORS)('U-COL-01 %s has ≥ 4.5:1 contrast against white text', (c) => {
    expect(contrastRatio(c, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  it('contrastRatio is symmetric and spans 1…21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#2F5597', '#2F5597')).toBe(1)
  })
})

describe('pickLeastUsedColor (FR-210)', () => {
  it('U-COL-02 empty map → first palette colour', () => {
    expect(pickLeastUsedColor(new Map())).toBe('#2F5597')
  })

  it('U-COL-03 minimum count, ties in palette order', () => {
    expect(
      pickLeastUsedColor(
        new Map([
          ['#2F5597', 2],
          ['#7C3AED', 1],
        ]),
      ),
    ).toBe('#B91C1C')
  })

  it('U-COL-03 all 12 used once → first palette colour', () => {
    expect(pickLeastUsedColor(new Map(USER_COLORS.map((c) => [c, 1])))).toBe('#2F5597')
  })

  it('U-COL-03 unknown colours are ignored; keys match case-insensitively', () => {
    const counts = new Map<string, number>([
      ['#000000', 0],
      ['#123456', 0],
      ...USER_COLORS.filter((c) => c !== '#854D0E').map((c) => [c.toLowerCase(), 3] as [string, number]),
      ['#854d0e', 2],
    ])
    expect(pickLeastUsedColor(counts)).toBe('#854D0E')
  })
})
