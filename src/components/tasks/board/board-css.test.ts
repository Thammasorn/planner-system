// src/components/tasks/board/board-css.test.ts — static guard on TaskBoard.module.css for NFR-07b (jsdom has no
// layout): the board is its own horizontal scroller AND the containing block of absolutely positioned descendants
// (VisuallyHidden status labels), so nothing in an off-screen column can widen the page.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./TaskBoard.module.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

function body(selector: string): string {
  const m = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((x) => x[1]!.trim() === selector)
  return m?.[2] ?? ''
}

describe('TaskBoard.module.css (NFR-07b — the board scrolls, never the page)', () => {
  it('.board scrolls horizontally inside itself and may shrink below its content', () => {
    const b = body('.board')
    expect(b).toMatch(/overflow-x:\s*auto/)
    expect(b).toMatch(/min-width:\s*0/)
    expect(b).toMatch(/max-width:\s*100%/)
  })

  it('.board is the containing block of absolutely positioned descendants (they are clipped with it)', () => {
    expect(body('.board')).toMatch(/position:\s*relative/)
  })
})
