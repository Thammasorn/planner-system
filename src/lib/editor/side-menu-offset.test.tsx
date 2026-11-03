// Owner bug 2026-11-03: BlockNote's side menu (+ / ⠿) is centred on the block's FIRST LINE — the marked title line
// of custom blocks (database, equation, live blocks), the first text line of text blocks — and keeps core's constant
// for blocks without one (table, files). Also the anchor contract of every custom block.
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DatabaseNotFound, DatabaseSkeleton } from '@/components/database/DatabaseBlockView'
import { LiveBlockFrame } from '@/components/editor/blocks/live/LiveBlockFrame'
import { UndoContext, type UndoApi } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import {
  coreBlockOffset,
  firstLineOf,
  lineHeightPx,
  SIDE_MENU_ANCHOR,
  sideMenuOffsetMiddleware,
  sideMenuShift,
} from './side-menu-offset'

function rect(top: number, height: number): DOMRect {
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }
}
function at(el: Element, top: number, height: number): void {
  el.getBoundingClientRect = () => rect(top, height)
}

/** A BlockNote block as 0.55 renders it: .bn-block-outer > .bn-block > [react renderer >] .bn-block-content. */
function block(
  inner: string,
  o: { react?: boolean; type?: string } = {},
): { outer: HTMLElement; content: Element } {
  const outer = document.createElement('div')
  outer.className = 'bn-block-outer'
  const content = `<div class="bn-block-content" data-content-type="${o.type ?? 'x'}">${inner}</div>`
  outer.innerHTML = `<div class="bn-block" data-id="b1">${
    o.react ? `<div class="bn-react-node-view-renderer">${content}</div>` : content
  }<div class="bn-block-group"><div class="bn-block-outer"><div class="bn-block"><div class="bn-block-content"><p class="bn-inline-content" ${SIDE_MENU_ANCHOR}>child</p></div></div></div></div></div>`
  document.body.append(outer)
  return { outer, content: outer.querySelector('.bn-block-content')! }
}

describe('side menu offset (pure)', () => {
  it('centres a 30 px menu on the line centre, measured from the block top (½ px steps)', () => {
    expect(sideMenuShift(100, { centre: 130 }, 30)).toBe(15)
    expect(sideMenuShift(100, { centre: 113.6 }, 30)).toBe(-1.5)
    expect(sideMenuShift(0, { centre: 15 }, 30)).toBe(0)
  })
  it('reads px, unitless and normal line-heights', () => {
    expect(lineHeightPx('27.2px', '16px')).toBe(27.2)
    expect(lineHeightPx('1.7', '16px')).toBeCloseTo(27.2)
    expect(lineHeightPx('normal', '20px')).toBe(24)
  })
  it('keeps core constants for blocks the app does not measure', () => {
    expect(coreBlockOffset('table', false)).toBe(15)
    expect(coreBlockOffset('image', true)).toBe(12)
    expect(coreBlockOffset('file', false)).toBe(4)
    expect(coreBlockOffset('image', false)).toBe(0)
  })
})

describe('firstLineOf (DOM)', () => {
  it('a custom block: the centre of its marked anchor, inside the React renderer wrapper (not a child block)', () => {
    const { outer, content } = block(`<div><span ${SIDE_MENU_ANCHOR}>title</span></div>`, { react: true })
    at(content.querySelector(`[${SIDE_MENU_ANCHOR}]`)!, 140, 30)
    expect(firstLineOf(outer)).toEqual({ centre: 155 })
  })
  it('a text block: top padding + half the first line, whatever the number of lines', () => {
    const { outer, content } = block(
      '<h2 class="bn-inline-content" style="padding-top:2px;line-height:30px">a<br>b</h2>',
    )
    at(content.querySelector('.bn-inline-content')!, 200, 60)
    expect(firstLineOf(outer)).toEqual({ centre: 217 })
  })
  it('a table (cells hold inline content) or a block without either → null (core constant)', () => {
    expect(firstLineOf(block('<p class="bn-inline-content">cell</p>', { type: 'table' }).outer)).toBeNull()
    expect(firstLineOf(block('<img alt="" />').outer)).toBeNull()
  })
  it('the middleware reads the virtual reference’s contextElement and shifts y; no line → the fallback', () => {
    const { outer, content } = block(`<h3 ${SIDE_MENU_ANCHOR}>t</h3>`, { react: true })
    at(outer, 100, 200)
    at(content.querySelector(`[${SIDE_MENU_ANCHOR}]`)!, 120, 40)
    const mw = sideMenuOffsetMiddleware(() => 15)
    const state = (reference: unknown) =>
      ({ y: 100, rects: { floating: { height: 30 } }, elements: { reference } }) as unknown as Parameters<
        typeof mw.fn
      >[0]
    expect(mw.fn(state({ getBoundingClientRect: () => rect(100, 200), contextElement: outer }))).toEqual({
      y: 125,
    })
    const img = block('<img alt="" />').outer
    expect(mw.fn(state(img))).toEqual({ y: 115 })
  })
})

describe('anchor contract of the custom blocks', () => {
  it('live blocks mark their title, not the header that wraps on phones', () => {
    const undo: UndoApi = {
      push: vi.fn(),
      undo: vi.fn(() => Promise.resolve()),
      redo: vi.fn(() => Promise.resolve()),
      undoEntry: vi.fn(() => Promise.resolve()),
      canUndo: false,
      canRedo: false,
    }
    const { container } = render(
      <UndoContext value={undo}>
        <LiveBlockFrame title={th.editor.liveBlocks.taskViewTitle} actions={<button type="button">x</button>}>
          body
        </LiveBlockFrame>
      </UndoContext>,
    )
    const anchors = container.querySelectorAll(`[${SIDE_MENU_ANCHOR}]`)
    expect(anchors).toHaveLength(1)
    expect(anchors[0]).toHaveTextContent(th.editor.liveBlocks.taskViewTitle)
  })
  it('database skeleton and “not found” mark one line', () => {
    expect(render(<DatabaseSkeleton />).container.querySelectorAll(`[${SIDE_MENU_ANCHOR}]`)).toHaveLength(1)
    const nf = render(<DatabaseNotFound databaseId="d" />).container.querySelector(`[${SIDE_MENU_ANCHOR}]`)
    expect(nf).toHaveTextContent(th.database.notFound)
  })
})
