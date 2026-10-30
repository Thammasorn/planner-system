// src/server/services/positions.ts — position CRUD + ordering (FR-208, X48, M1-D14).
// Keys are generated here under pg_advisory_xact_lock(hashtext('positions')); ORDER BY position, id.
// Every mutation ends with exactly one audit row in the caller's tx (M1-D5); a move at either end is a no-op.
import { th } from '@/i18n/th'
import type { DeletedPosition, PositionRow } from '@/lib/contracts/users'
import * as audit from '../audit'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, pgErrorInfo } from '../errors'
import * as repo from '../repo'

export type Actor = { id: string } | null

const SCOPE = 'positions'

function nameTaken(): ConflictError {
  return new ConflictError('CONFLICT', th.positions.nameTaken, { fieldErrors: { name: [th.positions.nameTaken] } })
}

function isUniqueViolation(e: unknown): boolean {
  return pgErrorInfo(e).code === '23505'
}

export function listPositions(tx: DbOrTx): Promise<PositionRow[]> {
  return repo.positions.listPositions(tx)
}

/** Appends at the end; duplicate name → ConflictError('CONFLICT', th.positions.nameTaken, fieldErrors.name). */
export async function createPosition(tx: DbOrTx, actor: Actor, input: { name: string }): Promise<{ id: string }> {
  await repo.order.lockOrderScope(tx, SCOPE)
  if (await repo.positions.findPositionIdByName(tx, input.name)) throw nameTaken()
  const position = repo.order.keyAfter(await repo.positions.lastPositionKey(tx))
  let id: string
  try {
    id = await repo.positions.insertPosition(tx, { name: input.name, position })
  } catch (e) {
    if (isUniqueViolation(e)) throw nameTaken()
    throw e
  }
  await audit.log(tx, actor, {
    entity: 'position',
    entityId: id,
    action: 'create',
    summary: th.audit.positionCreated(input.name),
    after: { name: input.name, position },
  })
  return { id }
}

export async function renamePosition(tx: DbOrTx, actor: Actor, input: { id: string; name: string }): Promise<void> {
  const cur = await repo.positions.getPositionOrNotFound(tx, input.id)
  const other = await repo.positions.findPositionIdByName(tx, input.name)
  if (other && other !== cur.id) throw nameTaken()
  try {
    await repo.positions.updatePosition(tx, cur.id, { name: input.name })
  } catch (e) {
    if (isUniqueViolation(e)) throw nameTaken()
    throw e
  }
  await audit.log(tx, actor, {
    entity: 'position',
    entityId: cur.id,
    action: 'update',
    summary: th.audit.positionRenamed(cur.name, input.name),
    before: { name: cur.name },
    after: { name: input.name },
  })
}

/** No-op (no audit) at the ends; equal neighbour keys → re-key the siblings (keeping their order) first. */
export async function movePosition(
  tx: DbOrTx,
  actor: Actor,
  input: { id: string; direction: 'up' | 'down' },
): Promise<void> {
  await repo.order.lockOrderScope(tx, SCOPE)
  let rows = await repo.positions.listPositions(tx)
  const i = rows.findIndex((r) => r.id === input.id)
  if (i < 0) throw new NotFoundError()
  const target = rows[i]!
  if (input.direction === 'up' ? i === 0 : i === rows.length - 1) return

  const bounds = (list: PositionRow[]): [string | null, string | null] =>
    input.direction === 'up'
      ? [list[i - 2]?.position ?? null, list[i - 1]!.position]
      : [list[i + 1]!.position, list[i + 2]?.position ?? null]

  let [a, b] = bounds(rows)
  const collides = (x: string | null, y: string | null) => x !== null && y !== null && x >= y
  if (collides(a, b)) {
    const keys = repo.order.rekey(rows.length)
    for (const [j, r] of rows.entries()) await repo.positions.updatePosition(tx, r.id, { position: keys[j]! })
    rows = rows.map((r, j) => ({ ...r, position: keys[j]! }))
    ;[a, b] = bounds(rows)
  }
  const position = repo.order.keyBetween(a, b)
  await repo.positions.updatePosition(tx, target.id, { position })
  await audit.log(tx, actor, {
    entity: 'position',
    entityId: target.id,
    action: 'update',
    summary: th.audit.positionMoved(target.name),
    before: { position: target.position },
    after: { position },
  })
}

/** Hard delete of an unused position; in use (active or deactivated users) → ConflictError('IN_USE', th.positions.inUse(n)). */
export async function deletePosition(
  tx: DbOrTx,
  actor: Actor,
  input: { id: string },
): Promise<{ deleted: DeletedPosition }> {
  const cur = await repo.positions.getPositionOrNotFound(tx, input.id)
  const n = await repo.users.countUsersWithPosition(tx, cur.id)
  if (n > 0) throw new ConflictError('IN_USE', th.positions.inUse(n))
  try {
    await repo.positions.deletePosition(tx, cur.id)
  } catch (e) {
    if (pgErrorInfo(e).code === '23503') throw new ConflictError('IN_USE') // a user took it concurrently
    throw e
  }
  await audit.log(tx, actor, {
    entity: 'position',
    entityId: cur.id,
    action: 'delete',
    summary: th.audit.positionDeleted(cur.name),
    before: { name: cur.name, position: cur.position },
  })
  return { deleted: cur }
}

/** Re-inserts the same id/name/key (undo of delete); id or name taken → ConflictError('CONFLICT', th.positions.restoreConflict). */
export async function restorePosition(tx: DbOrTx, actor: Actor, input: DeletedPosition): Promise<void> {
  const conflict = () => new ConflictError('CONFLICT', th.positions.restoreConflict)
  await repo.order.lockOrderScope(tx, SCOPE)
  if (await repo.positions.findPositionIdByName(tx, input.name)) throw conflict()
  try {
    await repo.positions.insertPosition(tx, { id: input.id, name: input.name, position: input.position })
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict()
    throw e
  }
  await audit.log(tx, actor, {
    entity: 'position',
    entityId: input.id,
    action: 'restore',
    summary: th.audit.positionRestored(input.name),
    after: { name: input.name, position: input.position },
  })
}
