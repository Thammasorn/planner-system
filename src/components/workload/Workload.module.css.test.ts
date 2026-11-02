import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// jsdom does not apply CSS-module cascade, so guard the specificity contract textually: the shared th/td base rule must
// not outrank the single-class cell rules (.corner, .personCell, .weekHeader, .groupHeader) that set padding/alignment.
const css = readFileSync(join(__dirname, 'Workload.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function rules(): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim(),
    body: m[2] ?? '',
  }))
}

describe('Workload.module.css specificity', () => {
  it('no `.table th` / `.table td` rule (class + element) sets padding or text-align', () => {
    const offenders = rules().filter(
      (r) => /\.table\s+(th|td)\b/.test(r.selector) && /\b(padding|text-align)\s*:/.test(r.body),
    )
    expect(offenders.map((r) => r.selector)).toEqual([])
  })

  it('the single-class cell rules keep their own padding and alignment', () => {
    const byName = (sel: string) => rules().find((r) => r.selector === sel)?.body ?? ''
    expect(byName('.weekHeader')).toMatch(/text-align:\s*center/)
    expect(byName('.weekHeader')).toMatch(/padding:\s*var\(--space-1\) var\(--space-2\)/)
    expect(byName('.groupHeader')).toMatch(/padding:/)
    expect(byName('.corner,\n.personCell')).toMatch(/padding:/)
  })
})
