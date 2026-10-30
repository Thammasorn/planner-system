/** Display names and avatar initials (FR-210, M1-D20, PLAN §3.7). Isomorphic. */

export interface NamedUser {
  name: string
  nickname?: string | null
}

/** The nickname when it has any non-space text, otherwise the full name. */
export function displayName(u: NamedUser): string {
  const nick = u.nickname?.trim()
  return nick ? nick : u.name
}

const graphemes = new Intl.Segmenter('th', { granularity: 'grapheme' })

/** First grapheme of the display name (Thai base + vowel + tone mark stay together), upper-cased; '?' if empty. */
export function initialOf(u: NamedUser): string {
  const s = displayName(u).trim()
  const first = graphemes.segment(s)[Symbol.iterator]().next()
  return first.done ? '?' : first.value.segment.toUpperCase()
}
