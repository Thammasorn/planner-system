// src/server/repo/sessions.ts — Better Auth `session` rows. With the cookie cache off, deleting rows is authoritative
// (AC-104, R-M1-2): the next request with that cookie finds no session.
import { and, eq, ne } from 'drizzle-orm'
import { session } from '../db/schema'
import type { DbOrTx } from '../db/types'

/** FR-107, FR-204, AC-104. Returns the number of deleted sessions. */
export async function deleteAllSessions(tx: DbOrTx, userId: string): Promise<number> {
  const rows = await tx.delete(session).where(eq(session.userId, userId)).returning({ id: session.id })
  return rows.length
}

/** FR-105: every session of the user except the one with `keepToken`. */
export async function deleteOtherSessions(tx: DbOrTx, userId: string, keepToken: string): Promise<number> {
  const rows = await tx
    .delete(session)
    .where(and(eq(session.userId, userId), ne(session.token, keepToken)))
    .returning({ id: session.id })
  return rows.length
}
