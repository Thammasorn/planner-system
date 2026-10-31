// src/server/repo/page-locks.ts — edit-lease rows (FR-540–542, X63; plan/m04 S0.4 / S1). `tx` first.
// Expiry always uses the DB clock (now(), X45); the TTL is passed in seconds.
import { and, eq, inArray, sql } from 'drizzle-orm'
import { pageLocks, user, type PageLockRow } from '../db/schema'
import type { DbOrTx } from '../db/types'

/** The lease row with the holder's display name = coalesce(nullif(nickname, ''), name) and whether it is still
 *  live (`expires_at >= now()`); null when none. */
export async function getLock(
  tx: DbOrTx,
  pageId: string,
): Promise<(PageLockRow & { holderName: string; live: boolean }) | null> {
  const [row] = await tx
    .select({
      pageId: pageLocks.pageId,
      userId: pageLocks.userId,
      expiresAt: pageLocks.expiresAt,
      holderName: sql<string>`coalesce(nullif(btrim(${user.nickname}), ''), ${user.name})`,
      live: sql<boolean>`${pageLocks.expiresAt} >= now()`,
    })
    .from(pageLocks)
    .innerJoin(user, eq(user.id, pageLocks.userId))
    .where(eq(pageLocks.pageId, pageId))
  return row ?? null
}

/**
 * r6a §5.4 upsert. Without takeover the row is taken only when it is ours or expired; takeover is unconditional.
 * Returns the row when this user now holds the lease, null otherwise.
 */
export async function upsertLock(
  tx: DbOrTx,
  pageId: string,
  userId: string,
  ttlSeconds: number,
  takeover: boolean,
): Promise<{ userId: string; expiresAt: Date } | null> {
  const rows = await tx.execute<{ user_id: string; expires_at: string | Date }>(sql`
    insert into page_locks (page_id, user_id, expires_at)
    values (${pageId}, ${userId}, now() + make_interval(secs => ${ttlSeconds}))
    on conflict (page_id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at
    ${takeover ? sql`` : sql`where page_locks.user_id = excluded.user_id or page_locks.expires_at < now()`}
    returning user_id, expires_at`)
  const r = rows[0]
  if (!r) return null
  return { userId: r.user_id, expiresAt: new Date(r.expires_at) }
}

/** Releases the lease only when `userId` holds it (a non-holder's DELETE is a no-op). */
export async function deleteLock(tx: DbOrTx, pageId: string, userId: string): Promise<void> {
  await tx.delete(pageLocks).where(and(eq(pageLocks.pageId, pageId), eq(pageLocks.userId, userId)))
}

export async function clearLocks(tx: DbOrTx, pageIds: readonly string[]): Promise<void> {
  if (pageIds.length === 0) return
  await tx.delete(pageLocks).where(inArray(pageLocks.pageId, [...pageIds]))
}
