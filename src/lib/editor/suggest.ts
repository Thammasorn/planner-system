// src/lib/editor/suggest.ts — ranked suggestion filter + word-start guards for the `/`, `:` and `@` menus
// (FR-520, FR-529, AC-504, r3 §5.1). Copied from plan/research/snippets/r3/harness/src/lib/suggest.ts.
// Pure: type-only BlockNote import (no prosemirror dependency under pnpm's strict node_modules).
import type { SuggestionMenuOptions } from '@blocknote/core/extensions'

type ShouldOpen = NonNullable<SuggestionMenuOptions['shouldOpen']>
/** The ProseMirror transaction BlockNote passes to `shouldOpen`. */
export type ShouldOpenTr = Parameters<ShouldOpen>[0]

type Item = { title: string; aliases?: readonly string[] | undefined; group?: string | undefined }

/**
 * Like BlockNote's `filterSuggestionItems` (case-insensitive substring on title | aliases) but RANKED, so "/หน้า"
 * puts "หน้า" (sub-page) before "ย่อหน้า" (paragraph) and "/table" finds "ตาราง" by its alias:
 *   0 exact title · 1 exact alias · 2 title prefix · 3 alias prefix · 4 title substring · 5 alias substring.
 * Groups stay contiguous (BlockNote renders a group label whenever `group` changes between consecutive items):
 * groups are ordered by their best-ranked item, items by rank, ties by input order. Empty query → input order.
 */
export function rankSuggestionItems<T extends Item>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...items]
  const scored: { item: T; rank: number; i: number }[] = []
  items.forEach((item, i) => {
    const title = item.title.toLowerCase()
    const aliases = (item.aliases ?? []).map((a) => a.toLowerCase())
    let rank = -1
    if (title === q) rank = 0
    else if (aliases.includes(q)) rank = 1
    else if (title.startsWith(q)) rank = 2
    else if (aliases.some((a) => a.startsWith(q))) rank = 3
    else if (title.includes(q)) rank = 4
    else if (aliases.some((a) => a.includes(q))) rank = 5
    if (rank >= 0) scored.push({ item, rank, i })
  })
  const groupKey = (x: { item: T }): string => x.item.group ?? ''
  const best = new Map<string, { rank: number; i: number }>()
  for (const x of scored) {
    const b = best.get(groupKey(x))
    if (!b || x.rank < b.rank || (x.rank === b.rank && x.i < b.i))
      best.set(groupKey(x), { rank: x.rank, i: x.i })
  }
  const fallback = { rank: 9, i: 0 }
  scored.sort((a, b) => {
    const ga = best.get(groupKey(a)) ?? fallback
    const gb = best.get(groupKey(b)) ?? fallback
    return ga.rank - gb.rank || ga.i - gb.i || a.rank - b.rank || a.i - b.i
  })
  return scored.map((x) => x.item)
}

/**
 * `shouldOpen` guard: BlockNote calls it BEFORE inserting the trigger character, so `$from.nodeBefore` is the text
 * right before the trigger. Open only at the start of a block, right after whitespace, or right after an inline atom
 * (a mention chip). Prevents "10:30" → 🕒, "1/2" → heading, "cindy@corp.co.th" → mention menu.
 */
export const atWordStart: ShouldOpen = (tr) => {
  const before = tr.selection.$from.nodeBefore
  if (!before) return true
  if (!before.isText) return true
  const text = before.text ?? ''
  return text === '' || /\s$/.test(text)
}

/** Slash menu: BlockNote's default guard (never inside table cells, where blocks cannot be inserted) + word start. */
export const slashShouldOpen: ShouldOpen = (tr) =>
  !tr.selection.$from.parent.type.isInGroup('tableContent') && atWordStart(tr)
