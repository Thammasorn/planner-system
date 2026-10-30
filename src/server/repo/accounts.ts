// src/server/repo/accounts.ts — the credential account Better Auth signs in against (r2 §7.2):
// providerId = 'credential', accountId = userId, password = scrypt hash from better-auth/crypto.
// Hashes never leave this layer except to verifyPassword; never log them.
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { account } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'

const CREDENTIAL = 'credential'

export async function insertCredentialAccount(tx: DbOrTx, userId: string, passwordHash: string): Promise<void> {
  await tx
    .insert(account)
    .values({ id: randomUUID(), userId, accountId: userId, providerId: CREDENTIAL, password: passwordHash })
}

/** The stored hash, or null when the user has no credential account / no password. */
export async function getCredentialHash(tx: DbOrTx, userId: string): Promise<string | null> {
  const [row] = await tx
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, CREDENTIAL)))
  return row?.password ?? null
}

/** Replaces the hash; NotFoundError when the user has no credential account. */
export async function setCredentialHash(tx: DbOrTx, userId: string, passwordHash: string): Promise<void> {
  const rows = await tx
    .update(account)
    .set({ password: passwordHash })
    .where(and(eq(account.userId, userId), eq(account.providerId, CREDENTIAL)))
    .returning({ id: account.id })
  if (rows.length === 0) throw new NotFoundError()
}
