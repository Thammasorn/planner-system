// src/server/services/users.ts — user reads shared by later pickers (AC-203 M1 part, X12).
import type { AssignableUser } from '@/lib/contracts/users'
import { displayName } from '@/lib/display-name'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'

const collator = new Intl.Collator('th')

/** Active users only (`banned is not true`), any role, ordered by display name (Intl.Collator('th')). */
export async function listAssignableUsers(tx: DbOrTx): Promise<AssignableUser[]> {
  const rows = await repo.users.listActiveUsers(tx)
  return rows
    .map((r) => ({ row: r, key: displayName(r) }))
    .sort((x, y) => collator.compare(x.key, y.key))
    .map(({ row }) => ({
      id: row.id,
      name: row.name,
      nickname: row.nickname,
      color: row.color,
      positionName: row.positionName,
    }))
}
