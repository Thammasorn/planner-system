// src/lib/people/filter.ts — person-picker search (FR-403: name, nickname, position). Isomorphic and pure.
import type { PersonOption } from '@/lib/contracts/people'

const fold = (s: string): string => s.normalize('NFC').toLocaleLowerCase('th')

/** Substring match on name, nickname and position (NFC + Thai lower case on both sides); blank query → all.
 *  Keeps the input order. */
export function filterPeople(options: readonly PersonOption[], q: string): PersonOption[] {
  const needle = fold(q.trim())
  if (needle === '') return [...options]
  return options.filter((o) =>
    [o.name, o.nickname, o.positionName].some((field) => field != null && fold(field).includes(needle)),
  )
}
