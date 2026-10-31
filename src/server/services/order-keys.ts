// src/server/services/order-keys.ts — "insert after this sibling" keying shared by tasks and task statuses (X48,
// M3-D11). The caller holds the scope's advisory lock and passes the live siblings in ORDER BY position, id.
import { th } from '@/i18n/th'
import { ConflictError } from '../errors'
import * as repo from '../repo'

/**
 * Key for a row placed among `siblings` (the row itself excluded): afterId undefined → append · null → first ·
 * id → right after that sibling; a stale id → CONFLICT treeChanged. Equal neighbour keys → every sibling is re-keyed
 * in order through `rekeyRow` first (X48).
 */
export async function keyAmong(
  siblings: readonly { id: string; position: string }[],
  afterId: string | null | undefined,
  rekeyRow: (id: string, position: string) => Promise<void>,
): Promise<string> {
  let list = [...siblings]
  const neighbours = (): [string | null, string | null] => {
    if (afterId === undefined) return [list.at(-1)?.position ?? null, null]
    if (afterId === null) return [null, list[0]?.position ?? null]
    const i = list.findIndex((s) => s.id === afterId)
    if (i < 0) throw new ConflictError('CONFLICT', th.tasks.errors.treeChanged)
    return [list[i]!.position, list[i + 1]?.position ?? null]
  }
  let [lo, hi] = neighbours()
  if (lo !== null && hi !== null && lo >= hi) {
    const keys = repo.order.rekey(list.length)
    for (const [i, s] of list.entries()) await rekeyRow(s.id, keys[i]!)
    list = list.map((s, i) => ({ ...s, position: keys[i]! }))
    ;[lo, hi] = neighbours()
  }
  return repo.order.keyBetween(lo, hi)
}
