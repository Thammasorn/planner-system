// src/server/repo/order.ts — fractional-index keys for user-ordered rows (X48, PLAN.md §3.4.5).
// Keys are generated only on the server, between the real neighbours, inside the caller's transaction while it holds
// the per-scope advisory lock. Columns use the orderKey type (COLLATE "C"); sort with ORDER BY position, id.
import { sql } from 'drizzle-orm'
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'
import type { DbOrTx } from '../db/types'

/** Serialises key generation for one sibling scope until the transaction ends (e.g. 'positions'). */
export async function lockOrderScope(tx: DbOrTx, scope: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${scope}))`)
}

/** Key after `last` (or the first key when the scope is empty). */
export function keyAfter(last: string | null): string {
  return generateKeyBetween(last, null)
}

/** Key strictly between `a` and `b` (null = open end). Throws when a >= b (equal neighbours → rekey first). */
export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b)
}

/** `n` fresh, evenly spread, strictly increasing keys (re-keying a scope whose neighbours collided). */
export function rekey(n: number): string[] {
  return generateNKeysBetween(null, null, n)
}
