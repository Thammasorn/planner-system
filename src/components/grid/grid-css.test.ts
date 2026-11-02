// src/components/grid/grid-css.test.ts — static guards on grid.module.css for §8.9 rules jsdom cannot see (no cascade
// in jsdom): the --today red is never text colour (3.76:1 on white), selected / fill cells keep a non-colour marker
// and outrank the row-hover tint, a selected tentative row keeps its selection ring, faded text keeps ≥ 4.5:1 on the
// selection tint and on leave stripes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FOOTER_ROWS, HEADER_TOTAL_H, ROW_H } from '@/lib/grid/columns'
import { contrastRatio, parseTokenBlocks, type TokenSet } from '@/lib/theme/contrast'

const css = readFileSync(fileURLToPath(new URL('./grid.module.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

interface Rule {
  selector: string
  body: string
  order: number
}

const rules: Rule[] = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m, order) =>
  m[1]!
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((selector) => ({ selector, body: m[2]!, order })),
)

/** [ids, classes + attributes + pseudo-classes, elements] — enough for the simple selectors of this file. */
function specificity(sel: string): [number, number, number] {
  const ids = (sel.match(/#[\w-]+/g) ?? []).length
  const cls = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length
  const el = (sel.replace(/\[[^\]]+\]/g, '').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return [ids, cls, el]
}
const beats = (a: Rule, b: Rule) => {
  const x = specificity(a.selector)
  const y = specificity(b.selector)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!
  return a.order > b.order
}
const decl = (r: Rule, prop: string) => new RegExp(`(^|;|\\s)${prop}\\s*:([^;]*)`).exec(r.body)?.[2]?.trim()
const find = (selector: string) => {
  const r = rules.find((x) => x.selector === selector)
  expect(r, selector).toBeDefined()
  return r!
}

const tokens = parseTokenBlocks(
  readFileSync(fileURLToPath(new URL('../../app/tokens.css', import.meta.url)), 'utf8'),
)

/** CSS `color-mix(in srgb, a p%, b)`: per-channel interpolation of the gamma-encoded values. */
function mintHex(a: string, b: string, p: number): string {
  const ch = (h: string, i: number) => Number.parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16)
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(ch(a, i) * p + ch(b, i) * (1 - p))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

describe('grid.module.css (§8.9)', () => {
  it('--faded-fg text on the selection / fill tint is ≥ 4.5:1 in light and dark', () => {
    const mint = /^color-mix\(in srgb, var\(--([a-z-]+)\) (\d+)%, var\(--([a-z-]+)\)\)$/.exec(
      decl(find('.root'), '--grid-select-bg') ?? '',
    )
    expect(mint, '--grid-select-bg is a color-mix of two tokens').not.toBeNull()
    const [, a = '', pct = '', b = ''] = mix!
    for (const [scheme, t] of Object.entries<TokenSet>(tokens)) {
      const bg = mintHex(t[a]!, t[b]!, Number(pct) / 100)
      for (const fg of ['faded-fg', 'brand-navy'])
        expect(contrastRatio(t[fg]!, bg), `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('selected / fill cells and selected row headers use the tint, never plain --brand-light', () => {
    const marks = rules.filter(
      (r) =>
        /\.(cell|rowHeader)\[(aria-selected|data-fill)='true'\]$/.test(r.selector) &&
        (decl(r, 'background-color') ?? decl(r, 'background')) !== undefined,
    )
    expect(marks.length).toBeGreaterThanOrEqual(3)
    for (const r of marks)
      expect(decl(r, 'background-color') ?? decl(r, 'background'), r.selector).toBe('var(--grid-select-bg)')
    for (const r of rules.filter((x) => /\.(cell|rowHeader)\b/.test(x.selector)))
      expect(r.body, r.selector).not.toMatch(/background(-color)?\s*:\s*var\(--brand-light\)/)
  })

  it('leave stripes: while faded text on --timeoff is < 4.5:1, the number sits on the cell colour', () => {
    const low = [tokens.light, tokens.dark].some((t) => contrastRatio(t['faded-fg']!, t.timeoff!) < 4.5)
    if (!low) return
    const backing = find(".cell[data-leave='true'] > [data-cell-value]:not(:empty)")
    expect(decl(backing, 'background-color')).toBe('inherit')
  })

  it('the --today red is never a text colour (contrast < 4.5:1); this week stays marked by its line', () => {
    for (const r of rules) expect(decl(r, 'color') ?? '', r.selector).not.toContain('--today')
    const today = find(".colHeader[data-today='true']")
    expect(decl(today, 'box-shadow')).toContain('var(--today)')
    expect(decl(today, 'font-weight')).toBe('700')
  })

  it('selected and fill-preview cells: a ring as well as the tint, and they outrank the row-hover tint', () => {
    const hover = rules.find((r) => r.selector === '.row:hover .cell')!
    expect(hover).toBeDefined()
    const marks = rules.filter(
      (r) =>
        /\.cell\[(aria-selected|data-fill)='true'\]$/.test(r.selector) &&
        decl(r, 'background-color') !== undefined,
    )
    expect(marks.length).toBeGreaterThanOrEqual(2)
    for (const r of marks) {
      expect(beats(r, hover), `${r.selector} beats ${hover.selector}`).toBe(true)
      expect(decl(r, 'box-shadow'), r.selector).toMatch(/inset 0 0 0 1px var\(--brand-blue\)/)
    }
  })

  it('the focus ring is not overridden by the selection ring', () => {
    const selected = rules.find((r) => /\.cell\[aria-selected='true'\]$/.test(r.selector))!
    const focused = rules.find((r) => /\.cell\[data-focused='true'\]$/.test(r.selector))!
    expect(beats(focused, selected)).toBe(true)
    expect(decl(focused, 'box-shadow')).toContain('2px var(--brand-blue)')
  })

  it('a selected tentative row header keeps both the amber bar and the 2px selection ring', () => {
    const tentative = find(".row[data-tentative='true'] .rowHeader")
    const both = find(".row[data-tentative='true'] .rowHeader[aria-selected='true']")
    expect(beats(both, tentative)).toBe(true)
    const shadow = decl(both, 'box-shadow') ?? ''
    expect(shadow).toContain('inset 4px 0 0 var(--tentative-fg)')
    expect(shadow).toContain('inset 0 0 0 2px var(--brand-blue)')
  })

  it('the กราฟภาระ pane never squeezes the grid below header + 6 rows + footer; the pane container scrolls instead', () => {
    // min(<floor>, content height): a short plan is not padded up to the floor (§8.12 / D19)
    const minDecl = decl(find(".root[data-chart-open='true'] > .scroller"), 'min-height') ?? ''
    expect(minDecl).toMatch(/^min\(\d+px, var\(--grid-content-h/)
    const minH = Number.parseFloat(/\d+px/.exec(minDecl)?.[0] ?? '')
    // + 2 px: the scroller's 1 px border top and bottom
    expect(minH).toBeGreaterThanOrEqual(HEADER_TOTAL_H + (6 + FOOTER_ROWS) * ROW_H + 2)
    expect(decl(find(".root[data-chart-open='true']"), 'overflow-y')).toBe('auto')
    expect(Number.parseFloat(decl(find('.chartPane'), 'max-height') ?? '')).toBeLessThanOrEqual(320)
  })

  it('toolbar: ‹ วันนี้ › never wrap apart; the footer switch has its own regular-weight slot (M7.1 review §8.12)', () => {
    expect(decl(find('.toolbarNav'), 'flex-wrap')).toBe('nowrap')
    expect(decl(find('.toolbarNav'), 'flex')).toBe('none')
    const slot = find('.footerSwitch')
    expect(decl(slot, 'margin-left')).toBe('auto')
    expect(decl(slot, 'font-weight')).toBe('var(--weight-regular)')
    expect(decl(find('.footerSwitchText'), 'white-space')).toBe('nowrap')
  })

  it('the scroller is sized to its content and only shrinks to fit (§8.12 / D19: no empty slab at 1920/2560)', () => {
    const fit = find(".scroller[data-fit='content']")
    expect(decl(fit, 'height')).toBe('var(--grid-content-h)')
    expect(decl(fit, 'flex')).toBe('0 1 auto')
  })

  it('month label: ellipsis inside its span, never a clipped glyph (FR-818, §8.12)', () => {
    const l = find('.monthLabel')
    expect(decl(l, 'overflow')).toBe('hidden')
    expect(decl(l, 'text-overflow')).toBe('ellipsis')
    expect(decl(l, 'max-width')).toBe('100%')
  })

  it('the sticky total columns stack above the month-start lines of cells scrolled under them (FR-818, §8.12)', () => {
    const line = Number(decl(find('.footerCell[data-month-start]::before'), 'z-index'))
    const zOf = (sel: string) =>
      Number(
        rules
          .filter((r) => r.selector === sel && decl(r, 'z-index') !== undefined)
          .sort((a, b) => b.order - a.order)[0]
          ?.body.match(/z-index\s*:\s*(\d+)/)?.[1] ?? 0,
      )
    expect(zOf('.footerTotal'), '.footerTotal').toBeGreaterThan(line)
  })
})
