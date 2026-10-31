// src/server/repo/projects.ts — typed queries on `projects` (FR-401..FR-407). Every read filters
// `deleted_at is null` (M2-D11). S0: the insert used by the golden seed and the services (M2-D13); S1 adds the rest.
import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import type { Certainty } from '@/domain/types'
import { projects, type ProjectRow } from '../db/schema'
import type { DbOrTx } from '../db/types'

export async function insertProject(
  tx: DbOrTx,
  v: {
    name: string
    clientId?: string | null
    code?: string | null
    color?: string
    certainty?: Certainty
    certaintyNote?: string | null
    archivedAt?: Date | null
    createdBy: string
  },
): Promise<ProjectRow> {
  const [row] = await tx.insert(projects).values(v).returning()
  if (!row) throw new Error('insert failed')
  return row
}

const live = isNull(projects.deletedAt)

/** `id` must be a valid uuid (authz.projectAccess rejects malformed ids before any lookup). */
export async function getProject(tx: DbOrTx, id: string): Promise<ProjectRow | null> {
  const [row] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), live))
  return row ?? null
}

export type ProjectPatch = Partial<
  Pick<ProjectRow, 'name' | 'clientId' | 'code' | 'color' | 'certainty' | 'certaintyNote'>
>

export async function updateProjectRow(tx: DbOrTx, id: string, patch: ProjectPatch): Promise<ProjectRow> {
  const [row] = await tx
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, id), live))
    .returning()
  if (!row) throw new Error('update failed')
  return row
}

/** archived_at = now() | null. */
export async function setProjectArchivedAt(tx: DbOrTx, id: string, archived: boolean): Promise<ProjectRow> {
  const [row] = await tx
    .update(projects)
    .set({ archivedAt: archived ? sql`now()` : null })
    .where(and(eq(projects.id, id), live))
    .returning()
  if (!row) throw new Error('update failed')
  return row
}

/** Hard DELETE … RETURNING (M2-D11); FKs cascade to project_members (and later tables). */
export async function deleteProject(tx: DbOrTx, id: string): Promise<ProjectRow | null> {
  const [row] = await tx
    .delete(projects)
    .where(and(eq(projects.id, id), live))
    .returning()
  return row ?? null
}

/** Unordered (services sort with compareThai). `archived` undefined = both; an empty id set yields []. */
export async function listProjects(
  tx: DbOrTx,
  f: { ids: 'ALL' | ReadonlySet<string>; archived?: boolean; clientId?: string },
): Promise<ProjectRow[]> {
  if (f.ids !== 'ALL' && f.ids.size === 0) return []
  const where: SQL[] = [live]
  if (f.ids !== 'ALL') where.push(inArray(projects.id, [...f.ids]))
  if (f.archived === true) where.push(isNotNull(projects.archivedAt))
  if (f.archived === false) where.push(isNull(projects.archivedAt))
  if (f.clientId !== undefined) where.push(eq(projects.clientId, f.clientId))
  return tx
    .select()
    .from(projects)
    .where(and(...where))
    .orderBy(asc(projects.name), asc(projects.id))
}

/** At least one archived (non-deleted) project among `ids` (sidebar "ดูโปรเจคที่ archive" link). */
export async function existsArchivedVisible(tx: DbOrTx, ids: 'ALL' | ReadonlySet<string>): Promise<boolean> {
  if (ids !== 'ALL' && ids.size === 0) return false
  const where: SQL[] = [live, isNotNull(projects.archivedAt)]
  if (ids !== 'ALL') where.push(inArray(projects.id, [...ids]))
  const [row] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(...where))
    .limit(1)
  return row !== undefined
}
