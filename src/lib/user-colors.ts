// src/lib/user-colors.ts — avatar palette (FR-210, M1-D20, X51). S0 creates the constant; S1 adds the functions
// (contrastRatio, pickLeastUsedColor). Each colour has ≥ 4.5:1 contrast against white text.
export const USER_COLORS = [
  '#2F5597',
  '#7C3AED',
  '#B91C1C',
  '#C2410C',
  '#A16207',
  '#15803D',
  '#0F766E',
  '#0369A1',
  '#4338CA',
  '#BE185D',
  '#475569',
  '#854D0E',
] as const

export type UserColor = (typeof USER_COLORS)[number]

/** WCAG 2.x contrast ratio of two `#RRGGBB` colours (shared with the theme token checks). */
export { contrastRatio } from './theme/contrast'

/**
 * The palette colour with the smallest usage count (missing = 0); ties go to palette order. Keys are matched
 * case-insensitively and colours outside the palette are ignored (FR-210: new users get the least-used colour).
 */
export function pickLeastUsedColor(counts: ReadonlyMap<string, number>): UserColor {
  const used = new Map<string, number>()
  for (const [c, n] of counts) {
    const key = c.toUpperCase()
    used.set(key, (used.get(key) ?? 0) + n)
  }
  let best: UserColor = USER_COLORS[0]
  let bestCount = Number.POSITIVE_INFINITY
  for (const c of USER_COLORS) {
    const n = used.get(c) ?? 0
    if (n < bestCount) {
      best = c
      bestCount = n
    }
  }
  return best
}
