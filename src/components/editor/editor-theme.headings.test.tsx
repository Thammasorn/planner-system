// SPEC §8.12 / §4.16 / FR-1606: body headings sit on the token scale BELOW the document title (--font-3xl, or
// --font-2xl below 600 px — PageTitle / TaskPageScreen), on every width and in the task panel. Core sizes them in em
// (h1 = 3em), which made a heading-1 bigger than the title on phones. Cascades the real core Block.css +
// editor-theme.css in jsdom over BlockNote's heading markup and reads the winning --level / --prev-level.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const coreCss = readFileSync(path.resolve('node_modules/@blocknote/core/src/editor/Block.css'), 'utf8')
const themeCss = readFileSync(path.resolve('src/components/editor/editor-theme.css'), 'utf8')
const tokensCss = readFileSync(path.resolve('src/app/tokens.css'), 'utf8')

const px = (token: string): number => {
  const m = new RegExp(`${token.replace(/[-]/g, '\\-')}:\\s*(\\d+)px`).exec(tokensCss)
  if (!m) throw new Error(`token ${token} missing`)
  return Number(m[1])
}
const varPx = (value: string): number => {
  const m = /^var\((--font-[a-z0-9]+)\)$/.exec(value.trim())
  if (!m) throw new Error(`not a font token: "${value}"`)
  return px(m[1] as string)
}

/** The phone media block of editor-theme.css, unwrapped (jsdom does not match @media in the cascade). */
function phoneRules(): string {
  const at = themeCss.indexOf('@media (max-width: 599.95px)')
  expect(at).toBeGreaterThan(-1)
  const open = themeCss.indexOf('{', at)
  let depth = 0
  for (let i = open; i < themeCss.length; i++) {
    if (themeCss[i] === '{') depth++
    else if (themeCss[i] === '}' && --depth === 0) return themeCss.slice(open + 1, i)
  }
  throw new Error('unbalanced @media block')
}

function mount(variant: 'page' | 'compact', phone: boolean): void {
  const style = document.createElement('style')
  // the theme is imported BEFORE core (PageEditor); the overrides must win on specificity, not order
  style.textContent = `${themeCss}\n${coreCss}\n${phone ? phoneRules() : ''}`
  document.head.append(style)
  const block = (level: number | null, prev: number | null) => `
    <div class="bn-block-outer"${prev ? ` data-prev-type="heading" data-prev-level="${prev}"` : ''}>
      <div class="bn-block">
        <div class="bn-block-content" data-content-type="heading"${level ? ` data-level="${level}"` : ''}
          data-testid="h${level ?? 1}${prev ? `p${prev}` : ''}"><h1>x</h1></div>
      </div>
    </div>`
  document.body.innerHTML = `
    <div class="app-editor" data-variant="${variant}">
      <div class="bn-root" data-color-scheme="light"><div class="bn-editor bn-default-styles">
        ${block(null, null)}${block(2, null)}${block(3, null)}${block(4, null)}
        ${block(null, 1)}${block(null, 2)}${block(null, 3)}
      </div></div>
    </div>`
}

const level = (id: string): string =>
  getComputedStyle(document.querySelector(`[data-testid="${id}"]`) as Element).getPropertyValue('--level')
const prevLevel = (id: string): string =>
  getComputedStyle(
    document.querySelector(`[data-testid="${id}"]`)?.closest('.bn-block-outer') as Element,
  ).getPropertyValue('--prev-level')

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('editor-theme.css — heading scale under the title', () => {
  it.each([
    ['page', false, '--font-3xl', ['--font-2xl', '--font-xl', '--font-lg']],
    ['page', true, '--font-2xl', ['--font-xl', '--font-lg', '--font-lg']],
    ['compact', false, '--font-xl', ['--font-xl', '--font-lg', '--font-md']],
  ] as const)('%s (phone: %s): h1–h3 follow the token scale', (variant, phone, _title, expected) => {
    mount(variant, phone)
    expect([level('h1'), level('h2'), level('h3')].map((v) => v.trim())).toEqual(
      expected.map((t) => `var(${t})`),
    )
    // the block-type change animation uses the same scale
    expect([prevLevel('h1p1'), prevLevel('h1p2'), prevLevel('h1p3')].map((v) => v.trim())).toEqual(
      expected.map((t) => `var(${t})`),
    )
  })

  it.each([
    ['page', false, '--font-3xl'],
    ['page', true, '--font-2xl'],
  ] as const)('%s (phone: %s): the title is strictly larger than every heading', (variant, phone, title) => {
    mount(variant, phone)
    for (const id of ['h1', 'h2', 'h3']) expect(varPx(level(id))).toBeLessThan(px(title))
  })

  it('levels 4–6 keep core (em of the body), not the heading-1 size', () => {
    mount('page', false)
    expect(level('h4').trim()).toBe('1em')
  })
})
