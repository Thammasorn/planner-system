// src/lib/editor/side-menu-offset.ts — where BlockNote's side menu (+ and ⠿) sits next to a block (owner bug
// 2026-11-03: the menu sat above the title of database / equation / live blocks and below the app's headings).
// VERIFIED 0.55.0 (SideMenuController.tsx): the menu (30 px) is placed `left-start` against the block element and
// shifted down by a per-type constant ported from core's own heading sizes (h1 39 / h2 27 / h3 18.5, table 15, …);
// custom blocks get 0. The app's headings use the token scale (editor-theme.css) and custom blocks put their title
// below a frame, so constants cannot fit. Instead the offset is MEASURED: the menu's centre goes on the centre of the
// block's first line —
//   1. an element inside the block content marked `data-side-menu-anchor` (custom blocks mark their title line:
//      database title, equation box, live-block title) → the centre of that element's box;
//   2. otherwise the block's own inline content (paragraph, heading, list item, quote, code…) → its top padding plus
//      half of its computed line-height (the FIRST line, whatever the number of lines);
//   3. otherwise (table, image, file, audio…) core's constant, unchanged.
import type { FloatingUIOptions } from '@blocknote/react'

/** floating-ui's Middleware, reached through BlockNote's exported options type (floating-ui is not a direct dep). */
type Middleware = Exclude<
  NonNullable<NonNullable<FloatingUIOptions['useFloatingOptions']>['middleware']>[number],
  false | null | undefined
>

/** The attribute a custom block puts on the element that is its "first line" for the side menu. */
export const SIDE_MENU_ANCHOR = 'data-side-menu-anchor'
/** Spread on that element: `<div {...sideMenuAnchor}>`. */
export const sideMenuAnchor = { [SIDE_MENU_ANCHOR]: '' } as const

export interface LineBox {
  /** Viewport y of the line's centre. */
  centre: number
}

/** Pure: the cross-axis (vertical) shift that centres a `menuHeight` menu on `line`, from the block's top. */
export function sideMenuShift(blockTop: number, line: LineBox, menuHeight: number): number {
  return Math.round((line.centre - blockTop - menuHeight / 2) * 2) / 2
}

/** Pure: a computed line-height in px ('normal' → 1.2 × font size, as browsers lay it out). */
export function lineHeightPx(lineHeight: string, fontSize: string): number {
  const lh = Number.parseFloat(lineHeight)
  const fs = Number.parseFloat(fontSize)
  if (lineHeight.endsWith('px') && Number.isFinite(lh)) return lh
  if (Number.isFinite(lh) && !lineHeight.endsWith('%')) return lh * (Number.isFinite(fs) ? fs : 16) // unitless
  return 1.2 * (Number.isFinite(fs) ? fs : 16)
}

/** The block content (`.bn-block-content`) of the block the side menu is attached to. */
function blockContentOf(reference: Element): Element | null {
  // VERIFIED 0.55.0: BlockPopover's reference is `domAtPos(posBeforeNode + 1)` — the block's .bn-block-outer
  const block = reference.closest('.bn-block') ?? reference.querySelector(':scope > .bn-block') ?? reference
  // React (custom) blocks wrap their content in a node-view renderer div
  return block.querySelector(
    ':scope > .bn-block-content, :scope > .bn-react-node-view-renderer > .bn-block-content',
  )
}

/** DOM: the first line of the block whose element BlockNote uses as the menu's reference; null → core's constant. */
export function firstLineOf(reference: Element): LineBox | null {
  const content = blockContentOf(reference)
  if (!content) return null
  // nested blocks live in .bn-block-group, never inside .bn-block-content, so this finds this block's own anchor
  const anchor = content.querySelector(`[${SIDE_MENU_ANCHOR}]`)
  if (anchor) {
    const r = anchor.getBoundingClientRect()
    return { centre: r.top + r.height / 2 }
  }
  if (content.getAttribute('data-content-type') === 'table') return null // inline content of cells, not a line
  const inline = content.querySelector('.bn-inline-content')
  if (!inline) return null
  const cs = getComputedStyle(inline)
  const top = inline.getBoundingClientRect().top + (Number.parseFloat(cs.paddingTop) || 0)
  return { centre: top + lineHeightPx(cs.lineHeight, cs.fontSize) / 2 }
}

/** VERIFIED 0.55.0: core's getBlockOffset for the blocks the app does not measure (not exported by core). */
export function coreBlockOffset(type: string, fileWithoutUrl: boolean): number {
  if (fileWithoutUrl) return 12
  if (type === 'file') return 4
  if (type === 'audio' || type === 'table') return 15
  return 0
}

/**
 * floating-ui middleware replacing core's `offset({ crossAxis })` (placement `left-start` → the cross axis is y).
 * `fallback` gives core's constant for blocks without a measurable first line.
 */
export function sideMenuOffsetMiddleware(fallback: (reference: Element) => number): Middleware {
  return {
    name: 'appSideMenuOffset',
    fn(state) {
      // VERIFIED 0.55.0: GenericPopover sets a virtual position reference whose `contextElement` is the block element
      const r = state.elements.reference
      const ref = r instanceof Element ? r : r.contextElement
      if (!(ref instanceof Element)) return {}
      const line = firstLineOf(ref)
      const shift = line
        ? sideMenuShift(ref.getBoundingClientRect().top, line, state.rects.floating.height)
        : fallback(ref)
      return shift === 0 ? {} : { y: state.y + shift }
    },
  }
}
