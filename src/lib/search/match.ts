// src/lib/search/match.ts — local substring matcher for the palette's index categories (projects, people, clients;
// M10-D21). Same folding as the server patterns (M10-D26). Pure, isomorphic.
import { foldForMatch, SEARCH_LIMIT_PER_CATEGORY } from './normalize'

export interface LocalMatchable {
  id: string
  /** e.g. [name, nickname, positionName]; keys[0] is the display name used for tie-breaking. */
  keys: readonly string[]
}

const collator = new Intl.Collator('th')
const WORD_CHAR = /[\p{L}\p{N}]/u

/** Rank of one key: 0 = starts with q, 1 = q at a word start inside the key, 2 = other substring; null = no match. */
function rankKey(key: string, q: string): { rank: 0 | 1 | 2; index: number } | null {
  const first = key.indexOf(q)
  if (first < 0) return null
  if (first === 0) return { rank: 0, index: 0 }
  for (let i = first; i >= 0; i = key.indexOf(q, i + 1)) {
    if (!WORD_CHAR.test(key[i - 1]!)) return { rank: 1, index: i }
  }
  return { rank: 2, index: first }
}

/**
 * Substring match on folded keys. Rank: any key starting with q (0) < word start inside a key (1) < other substring
 * (2); then the earliest match index, then Intl.Collator('th') on keys[0], then id. Returns at most `limit`.
 */
export function matchLocal<T extends LocalMatchable>(
  items: readonly T[],
  q: string,
  limit = SEARCH_LIMIT_PER_CATEGORY,
): T[] {
  const fq = foldForMatch(q)
  if (fq === '') return []
  const scored: { item: T; rank: number; index: number }[] = []
  for (const item of items) {
    let best: { rank: number; index: number } | null = null
    for (const key of item.keys) {
      const r = rankKey(foldForMatch(key), fq)
      if (r && (!best || r.rank < best.rank || (r.rank === best.rank && r.index < best.index))) best = r
    }
    if (best) scored.push({ item, ...best })
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.index - b.index ||
      collator.compare(a.item.keys[0] ?? '', b.item.keys[0] ?? '') ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  )
  return scored.slice(0, Math.max(0, limit)).map((s) => s.item)
}
