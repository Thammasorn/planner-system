// src/server/services/people.ts — the people directory for pickers (X09, X12, M2-D16).
// Every logged-in user may call it; the payload has no email. Sorted by compareThai(displayName).
import type { PersonOption } from '@/lib/contracts/people'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'
import { compareByDisplayName } from './shared'

/** Every user (deactivated ones with `active: false`); exactly the PersonOption keys (no email). */
export async function listPeopleOptions(tx: DbOrTx): Promise<PersonOption[]> {
  const rows = await repo.people.listPeople(tx)
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      nickname: r.nickname,
      positionId: r.positionId,
      positionName: r.positionName,
      color: r.color,
      active: r.active,
    }))
    .sort(compareByDisplayName)
}
