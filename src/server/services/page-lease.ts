// src/server/services/page-lease.ts — one-editor-at-a-time edit lease (FR-540–542, X63, M4-D3). Not audited (X44).
// Upsert `WHERE user_id = me OR expires_at < now()`; takeover is unconditional; expiry uses the DB now() (X45).
// Callers authorise first: acquire → requirePage(edit); get / release → requirePage(view).
import type { LeaseState } from '@/lib/contracts/pages'
import { displayName } from '@/lib/display-name'
import type { DbOrTx, Tx } from '../db/types'
import { NotFoundError } from '../errors'
import * as locksRepo from '../repo/page-locks'
import * as pagesRepo from '../repo/pages'
import type { SessionUser } from '../session'

/** FR-541: 2 minutes; SQL `now() + make_interval(secs => ${LEASE_TTL_SECONDS})`. */
export const LEASE_TTL_SECONDS = 120

async function pageVersion(tx: DbOrTx, pageId: string): Promise<number> {
  const page = await pagesRepo.getPage(tx, pageId)
  if (!page) throw new NotFoundError()
  return page.version
}

export async function acquireLease(
  tx: Tx,
  user: SessionUser,
  pageId: string,
  opts: { takeover: boolean },
): Promise<LeaseState> {
  const got = await locksRepo.upsertLock(tx, pageId, user.id, LEASE_TTL_SECONDS, opts.takeover)
  if (!got) return getLease(tx, user, pageId) // held by someone else (fresh)
  return {
    mine: true,
    holder: { userId: user.id, name: displayName(user) },
    expiresAt: got.expiresAt.toISOString(),
    version: await pageVersion(tx, pageId),
  }
}

/** Expired rows count as "no holder". */
export async function getLease(tx: DbOrTx, user: SessionUser, pageId: string): Promise<LeaseState> {
  const version = await pageVersion(tx, pageId)
  const lock = await locksRepo.getLock(tx, pageId)
  if (!lock || !lock.live) return { mine: false, holder: null, expiresAt: null, version }
  return {
    mine: lock.userId === user.id,
    holder: { userId: lock.userId, name: lock.holderName },
    expiresAt: lock.expiresAt.toISOString(),
    version,
  }
}

/** Deletes the row only when this user holds it (a non-holder's DELETE is a no-op). */
export async function releaseLease(tx: DbOrTx, user: SessionUser, pageId: string): Promise<void> {
  await locksRepo.deleteLock(tx, pageId, user.id)
}

/** Deletes the lease rows of these pages (page delete, M4-D21). */
export async function clearLeases(tx: Tx, pageIds: readonly string[]): Promise<void> {
  await locksRepo.clearLocks(tx, pageIds)
}
