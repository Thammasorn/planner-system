// src/lib/load/display.ts — load shown as % of capacity or as days (SPEC FR-813, FR-1002, BR-104; M11.1-D4/D5).
// Isomorphic, pure: integer cd in, strings out. The percent is the footer's "% ใช้กำลังคน" for one person —
// floor((200·load + cap) / (2·cap)), integer half-up, null when cap = 0 (M6-D8) — never a float division.
import type { Cd } from '@/domain/types'
import { th } from '@/i18n/th'
import type { LoadDisplay, Preferences } from '@/lib/schemas/preferences'
import { workloadCellText } from '@/lib/workload/format'

export type { LoadDisplay }
export const DEFAULT_LOAD_DISPLAY: LoadDisplay = 'PERCENT'

/** The stored `load.display`, or PERCENT. */
export function loadDisplay(prefs: Preferences): LoadDisplay {
  return prefs['load.display'] ?? DEFAULT_LOAD_DISPLAY
}

/** load ÷ capacity × 100, integer half-up; null when capacity is 0 (or less). */
export function loadPct(loadCd: Cd, capCd: Cd): number | null {
  if (capCd <= 0) return null
  const n = 200 * loadCd + capCd
  const d = 2 * capCd
  return (n - (n % d)) / d
}

/** "90%". */
export function percentText(pct: number): string {
  return th.loadDisplay.percent(pct)
}

/** A workload cell's visible text: load 0 → "–"; PERCENT → "90%"; DAYS or capacity 0 → "4.5/5" (M9-D6). */
export function workloadDisplayText(loadCd: Cd, capCd: Cd, display: LoadDisplay): string {
  if (loadCd === 0) return th.workload.cell.empty
  const pct = display === 'PERCENT' ? loadPct(loadCd, capCd) : null
  return pct === null ? workloadCellText(loadCd, capCd) : percentText(pct)
}
