// src/server/repo/clients.ts — typed queries on `clients` (FR-301, FR-302). Every function takes `tx` first and never
// opens a transaction. S0: the insert used by the golden seed and the services (M2-D13); S1 adds the rest.
import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import { clients, projects, type ClientRow } from '../db/schema'
import type { DbOrTx } from '../db/types'

export async function insertClient(
  tx: DbOrTx,
  v: {
    name: string
    code?: string | null
    color?: string | null
    note?: string | null
    archivedAt?: Date | null
  },
): Promise<ClientRow> {
  const [row] = await tx.insert(clients).values(v).returning()
  if (!row) throw new Error('insert failed')
  return row
}

/** `id` must be a valid uuid (callers validate; authz.requireClient turns malformed ids into 404). */
export async function getClient(tx: DbOrTx, id: string): Promise<ClientRow | null> {
  const [row] = await tx.select().from(clients).where(eq(clients.id, id))
  return row ?? null
}

/** Exact match (names are stored trimmed); archived clients included (clients_name_unique, M2-D07). */
export async function findClientByName(tx: DbOrTx, name: string): Promise<ClientRow | null> {
  const [row] = await tx.select().from(clients).where(eq(clients.name, name))
  return row ?? null
}

export async function updateClientRow(
  tx: DbOrTx,
  id: string,
  patch: Partial<Pick<ClientRow, 'name' | 'code' | 'color' | 'note'>>,
): Promise<ClientRow> {
  const [row] = await tx.update(clients).set(patch).where(eq(clients.id, id)).returning()
  if (!row) throw new Error('update failed')
  return row
}

/** archived_at = now() | null. */
export async function setClientArchivedAt(tx: DbOrTx, id: string, archived: boolean): Promise<ClientRow> {
  const [row] = await tx
    .update(clients)
    .set({ archivedAt: archived ? sql`now()` : null })
    .where(eq(clients.id, id))
    .returning()
  if (!row) throw new Error('update failed')
  return row
}

/** Unordered (services sort with compareThai). `ids` restricts the result; an empty set yields []. */
export async function listClients(
  tx: DbOrTx,
  f: { ids?: ReadonlySet<string>; includeArchived: boolean },
): Promise<ClientRow[]> {
  if (f.ids && f.ids.size === 0) return []
  const where: SQL[] = []
  if (f.ids) where.push(inArray(clients.id, [...f.ids]))
  if (!f.includeArchived) where.push(isNull(clients.archivedAt))
  return tx
    .select()
    .from(clients)
    .where(and(...where))
    .orderBy(asc(clients.name), asc(clients.id))
}

/** Distinct client ids of the given (non-deleted) projects. */
export async function clientIdsOfProjects(
  tx: DbOrTx,
  projectIds: 'ALL' | ReadonlySet<string>,
): Promise<Set<string>> {
  if (projectIds !== 'ALL' && projectIds.size === 0) return new Set()
  const where: SQL[] = [isNull(projects.deletedAt), isNotNull(projects.clientId)]
  if (projectIds !== 'ALL') where.push(inArray(projects.id, [...projectIds]))
  const rows = await tx
    .selectDistinct({ clientId: projects.clientId })
    .from(projects)
    .where(and(...where))
  return new Set(rows.flatMap((r) => (r.clientId ? [r.clientId] : [])))
}
