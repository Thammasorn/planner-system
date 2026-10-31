// src/lib/people/sort.ts — people lists sorted by display name with the shared Thai collator (M2-D18).
import { sortByThai } from '@/lib/collate'
import type { PersonOption } from '@/lib/contracts/people'
import { displayName } from '@/lib/display-name'

export function sortPeople(options: readonly PersonOption[]): PersonOption[] {
  return sortByThai(options, (p) => displayName(p))
}
