// Token-scale scanner (plan/m06.1 S0.12, M6.1-D24, FR-1605 / AC-1605). Fixtures: ./__fixtures__/token-scale/*.txt.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectTokenScale, expectTokenScale, scanSource, scanSourceDetailed } from './token-scale'

const fixture = (name: string): string =>
  readFileSync(path.resolve('src/lib/theme/__fixtures__/token-scale', `${name}.txt`), 'utf8')
const lineRules = (v: { line: number; rule: string }[]): [number, string][] =>
  v.map((x) => [x.line, x.rule] as [number, string]).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))

describe('scanSource — TS/TSX (TypeScript compiler API)', () => {
  it('flags every off-scale font, spacing, radius and colour literal with its line', () => {
    const v = scanSource('src/components/x/Bad.tsx', fixture('violations.tsx'))
    expect(lineRules(v)).toEqual([
      [1, 'spacing'], // p: 2.5
      [2, 'font'], // fontSize: 13
      [3, 'colour'], // '#fff'
      [4, 'spacing'], // '4px 8px'
      [5, 'spacing'], // mt: -0.75
      [6, 'font'], // lineHeight '20px'
      [7, 'radius'], // '6px'
      [8, 'spacing'], // responsive md: 2.5
      [9, 'spacing'], // conditional branch 5
      [10, 'colour'], // rgba()
      [11, 'spacing'], // 'margin-top': '1rem'
      [12, 'spacing'], // px: 7
      [13, 'radius'], // borderRadius: 3
      [14, 'font'], // '0.875rem'
      [15, 'spacing'], // `${x}px`
      [16, 'colour'], // hsl() in a JSX style
      [17, 'spacing'], // escape hatch without a 10-char reason is rejected
      [18, 'spacing'], // array value 2.25
    ])
    expect(v[0]).toMatchObject({ path: 'src/components/x/Bad.tsx', snippet: 'export const a = { p: 2.5 }' })
  })

  it('accepts tokens, scale factors, unitless line-height, layout sizes and a reasoned escape hatch', () => {
    const r = scanSourceDetailed('src/components/x/Clean.tsx', fixture('clean.tsx'))
    expect(r.violations).toEqual([])
    expect(r.escapes).toEqual([
      { path: 'src/components/x/Clean.tsx', line: 11, reason: 'aligns with the 20 px BlockNote gutter' },
    ])
  })

  it('plain .ts files are scanned too; unparsable input does not throw', () => {
    expect(lineRules(scanSource('a.ts', "export const s = { gap: '3px' }"))).toEqual([[1, 'spacing']])
    expect(() => scanSource('broken.tsx', 'export const = {{{')).not.toThrow()
  })
})

describe('scanSource — CSS (line regex)', () => {
  it('flags px/rem/em spacing, font sizes, radii and every hex/rgb/hsl colour', () => {
    expect(lineRules(scanSource('src/components/x/a.module.css', fixture('violations.css')))).toEqual([
      [2, 'spacing'],
      [3, 'font'],
      [4, 'font'],
      [5, 'radius'],
      [6, 'spacing'],
      [7, 'spacing'],
      [8, 'colour'],
      [9, 'colour'],
      [10, 'colour'],
      [11, 'spacing'], // var() with a px fallback
      [13, 'spacing'],
      [15, 'spacing'], // escape without a reason
    ])
  })

  it('accepts var()/calc() of vars, 0/auto, percentages for radii, widths, comments and reasoned escapes', () => {
    const r = scanSourceDetailed('src/components/x/a.module.css', fixture('clean.css'))
    expect(r.violations).toEqual([])
    expect(r.escapes).toEqual([
      { path: 'src/components/x/a.module.css', line: 18, reason: 'BlockNote side menu needs 52 px' },
    ])
  })
})

describe('collectTokenScale / expectTokenScale (co-located tests, M6.1-D24)', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  function tree(files: Record<string, string>): string {
    dir = mkdtempSync(path.join(os.tmpdir(), 'token-scale-'))
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      writeFileSync(path.join(dir, rel), text)
    }
    return dir
  }

  it('walks recursively; skips tests, fixtures, declaration files and non-source files', () => {
    const root = tree({
      'A.tsx': 'export const a = { p: 2.5 }',
      'nested/b.module.css': '.b { padding: 4px; }',
      'nested/ok.ts': 'export const ok = { p: 1 }',
      'A.test.tsx': "export const t = { color: '#fff' }",
      'x.int.test.ts': "export const t = { color: '#fff' }",
      'render.test.helper.tsx': "export const t = { color: '#fff' }",
      'fixtures.test.data.ts': "export const t = { color: '#fff' }",
      'grid.test.mocks.ts': "export const t = { color: '#fff' }",
      '__fixtures__/f.tsx': "export const t = { color: '#fff' }",
      'types.d.ts': "declare const t: '#fff'",
      'notes.md': 'padding: 4px; #fff',
    })
    const r = collectTokenScale(root)
    expect(r.violations.map((v) => [path.relative(root, v.path), v.rule]).sort()).toEqual([
      ['A.tsx', 'spacing'],
      [path.join('nested', 'b.module.css'), 'spacing'],
    ])
    expect(r.files).toBe(3)
  })

  it('applies the M6.1-D24 exclusions and custom ones', () => {
    const root = tree({
      'src/app/tokens.css': ':root { --x: #fff; }',
      'src/app/global-error.tsx': "export const e = { color: '#c00' }",
      'src/lib/theme/theme.ts': "export const t = { color: '#fff' }",
      'src/app/page.tsx': 'export const p = { p: 1 }',
      'src/app/skip/me.tsx': "export const s = { color: '#fff' }",
    })
    expect(collectTokenScale(root, { exclude: ['src/app/skip/'] }).violations).toEqual([])
    expect(collectTokenScale(root).violations.map((v) => path.relative(root, v.path))).toEqual([
      path.join('src', 'app', 'skip', 'me.tsx'),
    ])
  })

  it('expectTokenScale throws with every violation listed; passes on a clean tree', () => {
    const bad = tree({ 'A.tsx': 'export const a = {\n  p: 2.5,\n}' })
    expect(() => expectTokenScale(bad)).toThrow(/A\.tsx:2 spacing/)
    rmSync(bad, { recursive: true, force: true })
    const good = tree({ 'B.tsx': 'export const b = { p: 2 }' })
    expect(() => expectTokenScale(good)).not.toThrow()
  })
})
