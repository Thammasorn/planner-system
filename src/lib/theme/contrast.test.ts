import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NON_TEXT_BACKGROUNDS,
  NON_TEXT_MIN_RATIO,
  NON_TEXT_TOKENS,
  TEXT_PAIRS,
  contrastRatio,
  parseTokenBlocks,
} from './contrast'

/** SPEC §8.7 token names (21). */
const SPEC_TOKENS = [
  'brand-navy',
  'brand-blue',
  'brand-light',
  'load-over-bg',
  'load-over-fg',
  'load-full-bg',
  'load-full-fg',
  'load-light-bg',
  'load-light-fg',
  'heat-0',
  'heat-50',
  'heat-100',
  'certain-bg',
  'certain-fg',
  'tentative-bg',
  'tentative-fg',
  'nonworking',
  'holiday',
  'timeoff',
  'today',
  'milestone',
] as const

/** SPEC §8.7 light values verbatim (before the X51 fixes). */
const SPEC_LIGHT: Record<(typeof SPEC_TOKENS)[number], string> = {
  'brand-navy': '#1F3864',
  'brand-blue': '#2F5597',
  'brand-light': '#D9E2F3',
  'load-over-bg': '#FFC7CE',
  'load-over-fg': '#9C0006',
  'load-full-bg': '#C6EFCE',
  'load-full-fg': '#006100',
  'load-light-bg': '#FFEB9C',
  'load-light-fg': '#9C6500',
  'heat-0': '#FFFFFF',
  'heat-50': '#BDD7EE',
  'heat-100': '#2E75B6',
  'certain-bg': '#E2EFDA',
  'certain-fg': '#006100',
  'tentative-bg': '#FFEB9C',
  'tentative-fg': '#9C6500',
  nonworking: '#F1F5F9',
  holiday: '#E2E8F0',
  timeoff: '#CBD5E1',
  today: '#EF4444',
  milestone: '#7C3AED',
}
const X51_FIXES: Record<string, string> = { 'load-light-fg': '#8F5C00', 'tentative-fg': '#8F5C00' }

const css = readFileSync(path.resolve('src/app/tokens.css'), 'utf8')
const blocks = parseTokenBlocks(css)

describe('design tokens', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 2)
    expect(contrastRatio('#9C6500', '#FFEB9C')).toBeCloseTo(4.12, 2)
    expect(contrastRatio('#8F5C00', '#FFEB9C')).toBeCloseTo(4.76, 2)
  })

  it('defines every SPEC §8.7 token in light and dark', () => {
    const expected = [
      ...SPEC_TOKENS,
      'surface',
      'faded-fg',
      // M6.1 (SPEC §8.12)
      'border-subtle',
      'hover-bg',
      'text-secondary',
      'surface-muted',
      // M7.1 (X51)
      ...NON_TEXT_TOKENS,
    ]
    for (const name of expected) {
      expect(blocks.light, `light --${name}`).toHaveProperty([name])
      expect(blocks.dark, `dark --${name}`).toHaveProperty([name])
    }
    expect(Object.keys(blocks.dark).sort()).toEqual(Object.keys(blocks.light).sort())
  })

  it('keeps SPEC light values except the X51 fixes', () => {
    for (const name of SPEC_TOKENS) {
      const want = X51_FIXES[name] ?? SPEC_LIGHT[name]
      expect(blocks.light[name]?.toUpperCase(), `--${name}`).toBe(want.toUpperCase())
    }
  })

  const cases = TEXT_PAIRS.flatMap(([fg, bg]) =>
    (['light', 'dark'] as const).map((scheme) => [`${fg} on ${bg} (${scheme})`, fg, bg, scheme] as const),
  )
  it.each(cases)('%s ≥ 4.5:1', (_label, fg, bg, scheme) => {
    const set = blocks[scheme]
    const f = set[fg]
    const b = set[bg]
    expect(f).toBeDefined()
    expect(b).toBeDefined()
    expect(contrastRatio(f ?? '', b ?? '')).toBeGreaterThanOrEqual(4.5)
  })

  it('M6.1 §8.12 light values verbatim except the M6.1-D21 --text-secondary deviation', () => {
    expect(blocks.light).toMatchObject({
      'border-subtle': '#e5e7eb',
      'hover-bg': '#f3f4f6',
      surface: '#ffffff',
      'surface-muted': '#f9fafb',
      'text-secondary': '#646a75',
    })
    // why the deviation exists: the SPEC sample fails 4.5:1 on the hover background
    expect(contrastRatio('#6B7280', '#F3F4F6')).toBeLessThan(4.5)
  })

  it('rejects malformed colours', () => {
    expect(() => contrastRatio('#FFF', '#000000')).toThrow(RangeError)
  })
})

describe('M7.1 non-text tokens (X51: chart series, plan markers, month boundary)', () => {
  const cases = NON_TEXT_TOKENS.flatMap((fg) =>
    NON_TEXT_BACKGROUNDS.flatMap((bg) =>
      (['light', 'dark'] as const).map((scheme) => [`${fg} on ${bg} (${scheme})`, fg, bg, scheme] as const),
    ),
  )
  it.each(cases)('%s ≥ 3:1', (_label, fg, bg, scheme) => {
    const f = blocks[scheme][fg]
    const b = blocks[scheme][bg]
    expect(f, `--${fg}`).toBeDefined()
    expect(b, `--${bg}`).toBeDefined()
    expect(contrastRatio(f ?? '', b ?? '')).toBeGreaterThanOrEqual(NON_TEXT_MIN_RATIO)
  })

  it('marker colours are the plan values; --border-month deviates because the plan sample fails 3:1', () => {
    expect(blocks.light).toMatchObject({
      'marker-red': '#dc2626',
      'marker-yellow': '#a16207',
      'marker-green': '#15803d',
    })
    expect(blocks.dark).toMatchObject({
      'marker-red': '#f87171',
      'marker-yellow': '#facc15',
      'marker-green': '#4ade80',
    })
    expect(contrastRatio('#94A3B8', '#FFFFFF')).toBeLessThan(3)
    expect(contrastRatio('#64748B', '#273449')).toBeLessThan(3)
  })

  it('the eight chart colours are distinct in each theme', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const values = NON_TEXT_TOKENS.filter((t) => t.startsWith('chart-')).map((t) => blocks[scheme][t])
      expect(new Set(values).size, scheme).toBe(8)
    }
  })
})
