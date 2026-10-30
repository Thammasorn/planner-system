// src/server/repo/positions.ts — positions (FR-208). Ordered by `position` (COLLATE "C"), then id (X48).
import { asc, count, desc, eq } from 'drizzle-orm'
import type { DeletedPosition, PositionRow } from '@/lib/contracts/users'
import { positions, user } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'

/** All positions in display order; userCount counts active and deactivated users. */
export async function listPositions(tx: DbOrTx): Promise<PositionRow[]> {
  const rows = await tx
    .select({ id: positions.id, name: positions.name, position: positions.position, userCount: count(user.id) })
    .from(positions)
    .leftJoin(user, eq(user.positionId, positions.id))
    .groupBy(positions.id)
    .orderBy(asc(positions.position), asc(positions.id))
  return rows.map((r) => ({ ...r, userCount: Number(r.userCount) }))
}

export async function getPositionOrNotFound(tx: DbOrTx, id: string): Promise<DeletedPosition> {
  const [row] = await tx
    .select({ id: positions.id, name: positions.name, position: positions.position })
    .from(positions)
    .where(eq(positions.id, id))
  if (!row) throw new NotFoundError()
  return row
}

export async function findPositionIdByName(tx: DbOrTx, name: string): Promise<string | null> {
  const [row] = await tx.select({ id: positions.id }).from(positions).where(eq(positions.name, name))
  return row?.id ?? null
}

/** Key of the last position in display order (null when empty). */
export async function lastPositionKey(tx: DbOrTx): Promise<string | null> {
  const [row] = await tx
    .select({ position: positions.position })
    .from(positions)
    .orderBy(desc(positions.position), desc(positions.id))
    .limit(1)
  return row?.position ?? null
}

export async function countPositions(tx: DbOrTx): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(positions)
  return Number(row?.n ?? 0)
}

/** Inserts with an explicit id when given (restore, M1-D14); returns the id. */
export async function insertPosition(
  tx: DbOrTx,
  values: { id?: string; name: string; position: string },
): Promise<string> {
  const [row] = await tx.insert(positions).values(values).returning({ id: positions.id })
  return row!.id
}

export async function updatePosition(
  tx: DbOrTx,
  id: string,
  values: { name?: string; position?: string },
): Promise<void> {
  await tx.update(positions).set(values).where(eq(positions.id, id))
}

export async function deletePosition(tx: DbOrTx, id: string): Promise<void> {
  await tx.delete(positions).where(eq(positions.id, id))
}
