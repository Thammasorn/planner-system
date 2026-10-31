// src/server/repo/people.ts — the people directory (X09, M2-D16). "Active" for pickers and member lists =
// not banned and no deactivated_on; deactivated users are still listed (existing members render). Never email.
import { eq, sql } from 'drizzle-orm'
import type { PersonOption } from '@/lib/contracts/people'
import { positions, user } from '../db/schema'
import type { DbOrTx } from '../db/types'

/** M2-D16 activity flag as a boolean SQL expression (shared with repo.members). */
export const personActive = sql<boolean>`(${user.banned} is not true and ${user.deactivatedOn} is null)`

/** Every user (active and deactivated), unordered (the service sorts by display name). Exactly the PersonOption keys. */
export async function listPeople(tx: DbOrTx): Promise<PersonOption[]> {
  return tx
    .select({
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      positionName: positions.name,
      color: user.color,
      active: personActive,
    })
    .from(user)
    .leftJoin(positions, eq(positions.id, user.positionId))
}

/** One user's picker fields, or null (addMember / createProject LEAD validation). */
export async function getPerson(tx: DbOrTx, id: string): Promise<PersonOption | null> {
  const [row] = await tx
    .select({
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      positionName: positions.name,
      color: user.color,
      active: personActive,
    })
    .from(user)
    .leftJoin(positions, eq(positions.id, user.positionId))
    .where(eq(user.id, id))
  return row ?? null
}
