import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FONT,
  LAYOUT,
  LEADING,
  RADIUS,
  SPACE,
  SPACING_FACTORS,
  SURFACE,
  WEIGHT,
  BORDER_MONTH,
  CHART,
  MILESTONE_LINE,
  OPTION_COLOR_NAMES,
  OPTION_COLORS,
  chartVar,
  fontVar,
  milestoneColorVar,
  optionColorVars,
  spaceVar,
} from './tokens'

const css = readFileSync(path.resolve('src/app/tokens.css'), 'utf8')

/** Every `--name: value;` of one block (one declaration per line). */
function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const line of body.split('\n')) {
    const m = /^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/i.exec(line)
    if (m?.[1] && m[2]) out[m[1]] = m[2].trim()
  }
  return out
}

const root = declarations(':root')
const dark = declarations('.dark')

const prefixed = (prefix: string, o: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [`${prefix}${k}`, v]))

describe('tokens.ts ↔ tokens.css (SPEC §8.12, M6.1-D21)', () => {
  it('typography, spacing, radius and layout match :root exactly', () => {
    const want = {
      ...prefixed('font-', FONT),
      ...prefixed('leading-', LEADING),
      ...prefixed('weight-', WEIGHT),
      ...prefixed('space-', SPACE),
      ...prefixed('radius-', RADIUS),
      ...LAYOUT,
    }
    for (const [name, value] of Object.entries(want)) expect(root[name], `--${name}`).toBe(value)
  })

  it('SPEC §8.12 values verbatim (scale and layout)', () => {
    expect(FONT).toEqual({
      xs: '12px',
      sm: '13px',
      md: '14px',
      lg: '16px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '32px',
    })
    expect(Object.keys(SPACE).map(Number)).toEqual([1, 2, 3, 4, 6, 8, 12])
    expect(LAYOUT['doc-column']).toBe('760px')
    expect(LAYOUT['header-height']).toBe('48px')
  })

  it('layout and typography are declared once (same in dark); surfaces have light and dark values', () => {
    for (const name of Object.keys({ ...prefixed('font-', FONT), ...prefixed('space-', SPACE), ...LAYOUT }))
      expect(dark[name], `--${name} in .dark`).toBeUndefined()
    for (const [name, value] of Object.entries(SURFACE.light)) expect(root[name], `--${name}`).toBe(value)
    for (const [name, value] of Object.entries(SURFACE.dark))
      expect(dark[name], `.dark --${name}`).toBe(value)
  })

  it('spaceVar maps scale factors to --space-n and everything else to calc()', () => {
    expect(SPACING_FACTORS.map(spaceVar)).toEqual([
      '0',
      'var(--space-1)',
      'var(--space-2)',
      'var(--space-3)',
      'var(--space-4)',
      'var(--space-6)',
      'var(--space-8)',
      'var(--space-12)',
    ])
    expect(spaceVar(-1)).toBe('calc(-1 * var(--space-2))')
    expect(spaceVar(2.5)).toBe('calc(2.5 * var(--space-2))')
    // every factor's token exists in tokens.css
    for (const f of SPACING_FACTORS.slice(1)) expect(root[spaceVar(f).slice(6, -1)]).toBeDefined()
  })

  it('fontVar', () => {
    expect(fontVar('3xl')).toBe('var(--font-3xl)')
  })
})

describe('M7.1 colours ↔ tokens.css (X51)', () => {
  it('CHART, MILESTONE_LINE and BORDER_MONTH mirror :root and .dark', () => {
    CHART.light.forEach((v, i) => expect(root[`chart-${i + 1}`], `--chart-${i + 1}`).toBe(v))
    CHART.dark.forEach((v, i) => expect(dark[`chart-${i + 1}`], `.dark --chart-${i + 1}`).toBe(v))
    for (const [name, value] of Object.entries(MILESTONE_LINE.light))
      expect(root[name], `--${name}`).toBe(value)
    for (const [name, value] of Object.entries(MILESTONE_LINE.dark))
      expect(dark[name], `.dark --${name}`).toBe(value)
    expect(root['border-month']).toBe(BORDER_MONTH.light)
    expect(dark['border-month']).toBe(BORDER_MONTH.dark)
  })

  it('chartVar wraps every 8 series; milestoneColorVar maps the milestone colour enum (PURPLE = --milestone)', () => {
    expect(chartVar(0)).toBe('var(--chart-1)')
    expect(chartVar(7)).toBe('var(--chart-8)')
    expect(chartVar(8)).toBe('var(--chart-1)')
    expect(chartVar(-1)).toBe('var(--chart-8)')
    expect(milestoneColorVar('PURPLE')).toBe('var(--milestone)')
    expect(milestoneColorVar('RED')).toBe('var(--milestone-red)')
    expect(milestoneColorVar('YELLOW')).toBe('var(--milestone-yellow)')
    expect(milestoneColorVar('GREEN')).toBe('var(--milestone-green)')
    expect(milestoneColorVar('BLUE')).toBe('var(--milestone-blue)')
  })
})

describe('M11 option colours ↔ tokens.css (M11-D35)', () => {
  it('OPTION_COLORS mirror :root and .dark for all 10 names', () => {
    expect(OPTION_COLOR_NAMES).toHaveLength(10)
    for (const scheme of ['light', 'dark'] as const) {
      const block = scheme === 'light' ? root : dark
      for (const name of OPTION_COLOR_NAMES) {
        expect(block[`option-${name}-bg`], `${scheme} --option-${name}-bg`).toBe(
          OPTION_COLORS[scheme][name].bg,
        )
        expect(block[`option-${name}-fg`], `${scheme} --option-${name}-fg`).toBe(
          OPTION_COLORS[scheme][name].fg,
        )
      }
    }
  })

  it('optionColorVars', () => {
    expect(optionColorVars('teal')).toEqual({ bg: 'var(--option-teal-bg)', fg: 'var(--option-teal-fg)' })
  })
})
