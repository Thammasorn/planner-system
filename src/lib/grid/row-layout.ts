// src/lib/grid/row-layout.ts — the lead of a task cell in the plan grid's row header (v3.9, owner feedback). Pure.
// [☐ select][⠿ handle][depth indent][▸/▾ caret slot][name]: the select / handle slots are a fixed gutter (reserved
// only when the grid offers them, so every row of one grid lines up), the depth indent sits AFTER the gutter, and the
// caret slot is one narrow fixed width (leaf rows keep it empty). A top-level leaf name therefore sits right after the
// narrow caret slot and each level adds exactly one INDENT step. The drop indicator uses the same x offsets.

/** Left padding of the task cell (--space-1). */
export const LEAD_PAD_PX = 4
/** ☐ multi-select checkbox slot. */
export const CHECK_W = 16
/** ⠿ drag handle slot. */
export const HANDLE_W = 14
/** ▸/▾ caret slot (empty on leaf rows). */
export const CARET_W = 16
/** Gap between the caret slot and the name (--space-1, the task cell's flex gap). */
export const NAME_GAP_PX = 4
/** Indent per depth level (--space-4) = the horizontal drag step (M7.1-D16). */
export const LEVEL_PX = 16

export interface LeadLayout {
  /** x of the checkbox slot (only meaningful when `check`) */
  checkX: number
  /** x of the handle slot (only meaningful when `handle`) */
  handleX: number
  /** width of the depth spacer */
  indentW: number
  /** x of the caret slot */
  caretX: number
  /** x of the name */
  nameX: number
  /** total width of the lead box (gutter + indent + caret), without the cell padding */
  leadW: number
}

/** x offsets (px from the task cell's left edge) of a task row's lead at `depth`. */
export function taskLeadLayout(depth: number, o: { check: boolean; handle: boolean }): LeadLayout {
  const checkX = LEAD_PAD_PX
  const handleX = checkX + (o.check ? CHECK_W : 0)
  const indentW = Math.max(0, depth) * LEVEL_PX
  const caretX = handleX + (o.handle ? HANDLE_W : 0) + indentW
  const nameX = caretX + CARET_W + NAME_GAP_PX
  return { checkX, handleX, indentW, caretX, nameX, leadW: caretX + CARET_W - LEAD_PAD_PX }
}
