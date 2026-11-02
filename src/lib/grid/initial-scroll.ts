// src/lib/grid/initial-scroll.ts — the grid opens with this week in view (SPEC §7, M6-D15) and keeps it there while
// it settles (M7.1 review: the first scrollToColumn could be lost — a scroller not laid out yet, a re-measure after the
// frozen widths / day columns arrive — and the grid stayed at the timeline start, 3 years back). Pure; no DOM.
import type { GridColumn } from './columns'

/** How long the open position is held at most (ms), and the least once the first data has arrived. */
export const INITIAL_HOLD_MAX_MS = 5000
export const INITIAL_HOLD_SETTLE_MS = 1200

/**
 * The scrollLeft that puts the column `key` first after the frozen columns (the column virtualizer's paddingStart and
 * scrollPaddingStart are both the frozen width, so it is the column's own offset), clamped to the scroll range.
 * null = the column is not in `cols`.
 */
export function initialColumnLeft(
  cols: readonly GridColumn[],
  key: string,
  scrollWidth: number,
  clientWidth: number,
): { index: number; left: number } | null {
  const index = cols.findIndex((c) => c.key === key)
  const col = cols[index]
  if (!col) return null
  return { index, left: Math.min(col.offset, Math.max(0, scrollWidth - clientWidth)) }
}

export type InitialHoldStep = 'keep' | 'correct' | 'release'

/**
 * One check of the held open position. `left` = scrollLeft now, `seen` = scrollLeft at the previous check, `want` =
 * initialColumnLeft (null = column unknown yet).
 * - moved by someone else to a place that is not the timeline start (the user, the keyboard, ◀ ▶ วันนี้, a history
 *   restore) → release: never fight a real scroll;
 * - otherwise (still where it was, or dropped back to 0) and not at `want` → correct;
 * - else keep.
 */
export function initialHoldStep(s: { left: number; seen: number; want: number | null }): InitialHoldStep {
  const moved = Math.abs(s.left - s.seen) > 1
  if (moved && s.left > 1) return 'release'
  if (s.want === null) return 'keep'
  return Math.abs(s.left - s.want) > 1 ? 'correct' : 'keep'
}
