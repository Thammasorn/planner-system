import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// jsdom does not lay out CSS, so guard the bar-chart sizing contract textually (review M9: the segments' % heights
// collapsed to 0 because .bar had no definite height, leaving a 1 px hairline).
const css = readFileSync(join(__dirname, 'ProjectLoad.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const body = (sel: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((m) => (m[1] ?? '').trim() === sel)?.[2] ?? ''

describe('ProjectLoad.module.css bar sizing', () => {
  it('.bars has a fixed height and .barCol / .bar fill it, so segment % heights resolve', () => {
    expect(body('.bars')).toMatch(/(^|\s|;)height:\s*\d+px/)
    expect(body('.barCol')).toMatch(/(^|\s|;)height:\s*100%/)
    expect(body('.bar')).toMatch(/(^|\s|;)height:\s*100%/)
  })

  it('bar columns and week labels share one minimum width wide enough for "dd/m" labels', () => {
    const basis = (sel: string) => body(sel).match(/flex:\s*1 0 (\d+)px/)?.[1]
    expect(basis('.barCol')).toBe(basis('.labels > span'))
    expect(Number(basis('.barCol'))).toBeGreaterThanOrEqual(36)
    expect(body('.labels > span')).toMatch(/white-space:\s*nowrap/)
  })
})
