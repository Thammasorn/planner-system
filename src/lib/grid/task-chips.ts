// src/lib/grid/task-chips.ts — how the chips after a task name collapse when the task column is short (owner
// feedback v3.9: "→◆ส่งงาน", "⚠ เลย milestone" and "รอ 1 งาน" overflowed into the ผู้รับผิดชอบ column). Pure.
// Priority: name (ellipsis, at least NAME_MIN_PX) > blocker chip > late chip > milestone label. Collapse order:
//   level 0 — everything full;
//   level 1 — the milestone label shrinks to "◆" (name in the tooltip);
//   level 2 — the late / blocker chips become icon-only (⚠ / ⊘ + count; full text in tooltip + aria-label).
// Below level 2 the name ellipsizes under NAME_MIN_PX and the task cell clips at its edge (never paints outside).

export const NAME_MIN_PX = 60
/** Flex gap between the name and each chip (--space-1). */
export const CHIP_GAP_PX = 4
/** Upper-bound widths (px, --font-xs) used to decide the level; the milestone label is capped at 96 px in CSS. */
export const CHIP_W = {
  msFull: 96,
  msIcon: 14,
  lateFull: 100,
  lateIcon: 24,
  blockerFull: 84,
  blockerIcon: 40,
} as const

export type ChipLevel = 0 | 1 | 2

export interface TaskChips {
  ms: boolean
  late: boolean
  blocker: boolean
  /** other fixed inline bits (tentative glyph, completed text, …) in px */
  extra?: number
}

/** Width the name + chips need at `level` (name at its minimum). */
export function chipsWidth(c: TaskChips, level: ChipLevel): number {
  let w = NAME_MIN_PX + (c.extra ?? 0)
  if (c.ms) w += CHIP_GAP_PX + (level >= 1 ? CHIP_W.msIcon : CHIP_W.msFull)
  if (c.late) w += CHIP_GAP_PX + (level >= 2 ? CHIP_W.lateIcon : CHIP_W.lateFull)
  if (c.blocker) w += CHIP_GAP_PX + (level >= 2 ? CHIP_W.blockerIcon : CHIP_W.blockerFull)
  return w
}

/** The least-collapsed level that fits `available` px (the name + chips box); an unmeasured box (≤ 0) → 0. */
export function taskChipLevel(available: number, c: TaskChips): ChipLevel {
  if (!(available > 0)) return 0
  if (chipsWidth(c, 0) <= available) return 0
  if (c.ms && chipsWidth(c, 1) <= available) return 1
  return 2
}

/** Right padding of the task cell (--space-2). */
export const TASK_PAD_RIGHT_PX = 8

/**
 * Width of the name + chips box in a task column `colW` px wide: minus the cell padding, the lead (`leadW` from
 * taskLeadLayout, starting after the 4 px left padding), the actions (`actionsW`, they keep their slot when hidden) and
 * the two flex gaps around the box. Never negative.
 */
export function taskMainWidth(colW: number, leadW: number, actionsW: number): number {
  return Math.max(0, colW - 4 - leadW - CHIP_GAP_PX - actionsW - CHIP_GAP_PX - TASK_PAD_RIGHT_PX)
}
