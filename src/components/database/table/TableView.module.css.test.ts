import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// jsdom does not run the cascade, so guard the table's CSS contract textually (review M11).
const css = readFileSync(join(__dirname, 'TableView.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m, i) => ({
  i,
  selectors: (m[1] ?? '').split(',').map((x) => x.trim()),
  body: m[2] ?? '',
}))
/** Last top-level rule whose selector list contains `sel` and declares `prop` (the one that wins the cascade). */
const winning = (sel: string, prop: string) =>
  rules.filter((r) => r.selectors.includes(sel) && new RegExp(`(^|[\\s;])${prop}:`).test(r.body)).at(-1)

describe('TableView.module.css', () => {
  it('the title header is sticky at the body title cell offset (not shifted by .headCell position: relative)', () => {
    const head = winning('.headCell', 'position')!
    const title = winning('.headCell.titleCell', 'position')
    expect(title).toBeDefined()
    expect(title!.i).toBeGreaterThan(head.i)
    expect(title!.body).toMatch(/position:\s*sticky/)
    expect(title!.body).toMatch(/left:\s*var\(--db-lead\)/)
    expect(title!.body).toMatch(/background:\s*var\(--surface\)/)
  })

  it('the resize handle shows an outline on keyboard focus, not colour alone', () => {
    const focus = winning('.resize:focus-visible', 'outline')!
    expect(focus.body).toMatch(/outline:\s*2px solid/)
    expect(focus.body).not.toMatch(/outline:\s*none/)
  })
})
