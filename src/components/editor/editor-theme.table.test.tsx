// SPEC §8.12 / FR-1605: editor table cells use --border-subtle in light AND dark — core BlockNote hard-codes #ddd.
// Cascades the real core stylesheet + editor-theme.css in jsdom over BlockNote's table markup and checks the winner.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const coreCss = readFileSync(path.resolve('node_modules/@blocknote/core/src/editor/editor.css'), 'utf8')
const themeCss = readFileSync(path.resolve('src/components/editor/editor-theme.css'), 'utf8')
const tokensCss = readFileSync(path.resolve('src/app/tokens.css'), 'utf8')
// --border-subtle per scheme, read from src/app/tokens.css (`:root` = light, `.dark` = dark).
const tokenBlock = (sel: string) => tokensCss.slice(tokensCss.indexOf(`${sel} {`), tokensCss.indexOf('}', tokensCss.indexOf(`${sel} {`)))
const borderSubtle = (sel: string) => /--border-subtle:\s*(#[0-9a-f]{6})/i.exec(tokenBlock(sel))?.[1] ?? 'missing'
const TOKEN = { light: borderSubtle(':root'), dark: borderSubtle('.dark') } as const
const hexToRgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

function mount(order: 'theme-first' | 'core-first', scheme: 'light' | 'dark') {
  const style = document.createElement('style')
  // jsdom does not resolve var() inside the border-color shorthand (computes rgb(0, 0, 0)), so the scheme's token
  // value is substituted in; the cascade against core's `border: 1px solid #ddd` is still the real one.
  const theme = themeCss.replaceAll('var(--border-subtle)', TOKEN[scheme])
  style.textContent = order === 'theme-first' ? `${theme}\n${coreCss}` : `${coreCss}\n${theme}`
  document.head.append(style)
  document.body.innerHTML = `
    <div class="bn-root" data-color-scheme="${scheme}">
      <div class="bn-editor">
        <div class="bn-block-content" data-content-type="table">
          <div class="tableWrapper"><div class="tableWrapper-inner"><table><tbody>
            <tr><th>h</th></tr><tr><td>c</td></tr>
          </tbody></table></div></div>
        </div>
      </div>
    </div>`
}

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('editor-theme.css — table cell borders', () => {
  it.each([
    ['theme-first', 'light'],
    ['theme-first', 'dark'],
    ['core-first', 'light'],
    ['core-first', 'dark'],
  ] as const)('th/td border colour is --border-subtle (%s, %s)', (order, scheme) => {
    mount(order, scheme)
    for (const sel of ['th', 'td']) {
      const cell = document.querySelector(sel)
      expect(cell).not.toBeNull()
      const color = getComputedStyle(cell as Element).borderTopColor
      expect(color).toBe(hexToRgb(TOKEN[scheme]))
      expect(color).not.toBe('rgb(221, 221, 221)') // core's #ddd
    }
  })

  it('tokens differ per scheme and the dark one is not core grey', () => {
    expect(TOKEN).toEqual({ light: '#e5e7eb', dark: '#2e3238' })
  })

  it('core still declares the hard-coded #ddd this override exists for (re-check on BlockNote upgrade)', () => {
    expect(coreCss).toMatch(/\[data-content-type="table"\] td\s*\{\s*border: 1px solid #ddd;/)
  })
})
