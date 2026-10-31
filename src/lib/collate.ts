// src/lib/collate.ts — one isomorphic Thai comparator (M2-D18): sidebar, /projects, /clients, client detail and member
// lists sort the same on the server and the client (Node 22 ships full ICU).
const collator = new Intl.Collator('th')

export const compareThai = (a: string, b: string): number => collator.compare(a, b)

/** A sorted copy; the input is not mutated. */
export const sortByThai = <T>(items: readonly T[], key: (t: T) => string): T[] =>
  [...items].sort((a, b) => compareThai(key(a), key(b)))
