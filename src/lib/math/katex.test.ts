import { describe, expect, it } from 'vitest'
import { KATEX_OPTIONS, LATEX_MAX, renderLatex } from './katex-runtime'
import { loadKatex } from './load-katex'

describe('renderLatex (FR-1505, M11-D29)', () => {
  it('renders valid LaTeX with HTML + MathML output', () => {
    const r = renderLatex(String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`, true)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.html).toContain('<math')
      expect(r.html).toContain('katex-display')
    }
  })

  it('inline mode has no display wrapper', () => {
    const r = renderLatex('E = mc^2', false)
    expect(r.ok && !r.html.includes('katex-display')).toBe(true)
  })

  it('a parse error is ok:false (throwOnError: true)', () => {
    const r = renderLatex(String.raw`\frac{1}{`, false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/parse error/i)
  })

  it('trust: false never emits a link for \\href', () => {
    const r = renderLatex(String.raw`\href{javascript:alert(1)}{x}`, false)
    // KaTeX 0.19.1 renders an untrusted command as error-coloured text (no throw); the source only survives
    // escaped inside the MathML <annotation>, never as an attribute.
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.html).not.toContain('<a ')
      expect(r.html).not.toContain('href=')
    }
  })

  it('rejects sources longer than 2,000 chars before rendering', () => {
    expect(LATEX_MAX).toBe(2000)
    expect(renderLatex('x'.repeat(2001), false).ok).toBe(false)
    expect(renderLatex('x'.repeat(2000), false).ok).toBe(true)
  })

  it('uses exactly the M11-D29 options', () => {
    expect(KATEX_OPTIONS).toEqual({
      throwOnError: true,
      trust: false,
      maxExpand: 1000,
      maxSize: 10,
      output: 'htmlAndMathml',
      strict: 'ignore',
    })
  })

  it('loadKatex is memoised', async () => {
    const a = loadKatex()
    const b = loadKatex()
    expect(a).toBe(b)
    const rt = await a
    expect(typeof rt.renderLatex).toBe('function')
  })
})
