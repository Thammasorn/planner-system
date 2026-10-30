// src/server/services/account.ts — own password + sign out everywhere (FR-105, FR-107, M1-D9, M1-D10).
// Services take (tx, actor, input), never open transactions, never import 'server-only' modules, never read the
// clock (M1-D4); the audit row is their last statement (M1-D5). Passwords arrive hashed; never log hashes.
import { verifyPassword } from 'better-auth/crypto'
import { th } from '@/i18n/th'
import { displayName } from '@/lib/display-name'
import * as audit from '../audit'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'
import type { SessionUser } from '../session'

type Actor = Pick<SessionUser, 'id' | 'name' | 'nickname' | 'sessionToken'>

/** verifyPassword({ hash, password }) against the user's credential account (false when there is none). */
export async function verifyOwnPassword(tx: DbOrTx, userId: string, password: string): Promise<boolean> {
  const hash = await repo.accounts.getCredentialHash(tx, userId)
  if (!hash) return false
  return verifyPassword({ hash, password })
}

/** setCredentialHash; must_change_password=false; delete the actor's other sessions; audit `{ passwordChanged: true }`. */
export async function changeOwnPassword(
  tx: DbOrTx,
  actor: Actor,
  input: { passwordHash: string },
): Promise<void> {
  await repo.accounts.setCredentialHash(tx, actor.id, input.passwordHash)
  await repo.users.updateUser(tx, actor.id, { mustChangePassword: false })
  await repo.sessions.deleteOtherSessions(tx, actor.id, actor.sessionToken)
  await audit.log(tx, actor, {
    entity: 'user',
    entityId: actor.id,
    action: 'update',
    summary: th.audit.passwordChanged(displayName(actor)),
    after: { passwordChanged: true },
  })
}

/** Delete every session of the actor (this device too); audit `{ signedOutEverywhere: true }`. */
export async function signOutEverywhere(tx: DbOrTx, actor: Actor): Promise<void> {
  await repo.sessions.deleteAllSessions(tx, actor.id)
  await audit.log(tx, actor, {
    entity: 'user',
    entityId: actor.id,
    action: 'update',
    summary: th.audit.signedOutEverywhere(displayName(actor)),
    after: { signedOutEverywhere: true },
  })
}
