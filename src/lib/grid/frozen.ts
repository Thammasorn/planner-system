// src/lib/grid/frozen.ts — widths of the two frozen columns งาน / ผู้รับผิดชอบ (SPEC FR-814/816, M7.1-D8/D9). Pure;
// integer px. The task column is 160–640 px (phones 120) and the frozen area (task + assignee) at most 60 % of the
// grid's width; the minimum wins when the grid is too narrow for both.

export const TASK_W_DEFAULT = 240
export const TASK_W_MIN = 160
export const TASK_W_MIN_PHONE = 120
export const TASK_W_MAX = 640
export const ASSIGNEE_W = 112
export const ASSIGNEE_W_PHONE = 72
export const RESIZE_STEP = 16
export const RESIZE_STEP_BIG = 64
/** Widest phone layout (px), same breakpoint as the calendar's agenda (< 600). */
export const PHONE_MAX = 599
/** Frozen share of the grid = NUM / DEN (60 %), integer arithmetic. */
export const FROZEN_SHARE_NUM = 3
export const FROZEN_SHARE_DEN = 5

export function isPhoneWidth(gridWidth: number): boolean {
  return gridWidth > 0 && gridWidth <= PHONE_MAX
}

function assigneeWidth(showAssignees: boolean, phone: boolean): number {
  if (!showAssignees) return 0
  return phone ? ASSIGNEE_W_PHONE : ASSIGNEE_W
}

/** A task width within [min, min(640, 60 % of the grid − assignee)]; 0 / unmeasured grid → only [min, 640]. */
export function clampTaskWidth(
  w: number,
  gridWidth: number,
  showAssignees: boolean,
  phone: boolean = isPhoneWidth(gridWidth),
): number {
  const min = phone ? TASK_W_MIN_PHONE : TASK_W_MIN
  let max = TASK_W_MAX
  if (gridWidth > 0) {
    const share = Math.floor((gridWidth * FROZEN_SHARE_NUM) / FROZEN_SHARE_DEN)
    max = Math.min(max, share - assigneeWidth(showAssignees, phone))
  }
  const v = Number.isFinite(w) ? Math.round(w) : TASK_W_DEFAULT
  return Math.max(min, Math.min(max, v))
}

/** `pref` = the `grid.taskColumnWidth` preference (undefined / invalid → 240). `phone` defaults to the width rule. */
export function frozenWidths(
  gridWidth: number,
  pref: number | undefined,
  showAssignees: boolean,
  phone: boolean = isPhoneWidth(gridWidth),
): { task: number; assignee: number } {
  const want = pref !== undefined && Number.isFinite(pref) ? pref : TASK_W_DEFAULT
  return {
    task: clampTaskWidth(want, gridWidth, showAssignees, phone),
    assignee: assigneeWidth(showAssignees, phone),
  }
}

/**
 * Keyboard on the resize separator: ←/→ ±16 (Shift ±64), Home/End = 160/640, Enter = 240; other keys → null.
 * The result is unclamped against the grid; pass it through clampTaskWidth.
 */
export function nudgeWidth(w: number, key: string, shift: boolean): number | null {
  const step = shift ? RESIZE_STEP_BIG : RESIZE_STEP
  switch (key) {
    case 'ArrowRight':
      return w + step
    case 'ArrowLeft':
      return w - step
    case 'Home':
      return TASK_W_MIN
    case 'End':
      return TASK_W_MAX
    case 'Enter':
      return TASK_W_DEFAULT
    default:
      return null
  }
}
