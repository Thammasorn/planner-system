// src/server/repo/databases.ts — the only module that queries databases / database_columns / database_views /
// database_rows (SPEC §6.2, §7.9; plan/m11 S0.7 signatures, S2 bodies). BR-98: never joins tasks, allocations,
// milestones or project_members. Every structural write locks the databases row first (M11-D18).
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  databaseColumns,
  databaseRows,
  databases,
  databaseViews,
  pages,
  user as userTable,
  type DatabaseRow,
  type DbColumnRow,
  type DbRowRow,
  type DbViewRow,
} from '../db/schema'
import type { DbOrTx } from '../db/types'
import { isUuid } from './pages'

/** `databases.page_id` by id — the only read allowed before the owner check (M11-D7); null when missing. */
export async function getDatabasePageId(tx: DbOrTx, databaseId: string): Promise<string | null> {
  if (!isUuid(databaseId)) return null
  const [row] = await tx
    .select({ pageId: databases.pageId })
    .from(databases)
    .where(eq(databases.id, databaseId))
  return row?.pageId ?? null
}

/** The databases row (`FOR UPDATE` when `lock`); null when missing. */
export async function getDatabase(
  tx: DbOrTx,
  databaseId: string,
  opts?: { lock?: boolean },
): Promise<DatabaseRow | null> {
  if (!isUuid(databaseId)) return null
  const q = tx.select().from(databases).where(eq(databases.id, databaseId))
  const [row] = opts?.lock ? await q.for('update') : await q
  return row ?? null
}

/** Live columns sorted (position, id). */
export function listColumns(tx: DbOrTx, databaseId: string): Promise<DbColumnRow[]> {
  return tx
    .select()
    .from(databaseColumns)
    .where(and(eq(databaseColumns.databaseId, databaseId), isNull(databaseColumns.deletedAt)))
    .orderBy(asc(databaseColumns.position), asc(databaseColumns.id))
}

/** Every column, live and soft-deleted (cell keys of deleted columns stay valid for restores). */
export function listAllColumns(tx: DbOrTx, databaseId: string): Promise<DbColumnRow[]> {
  return tx
    .select()
    .from(databaseColumns)
    .where(eq(databaseColumns.databaseId, databaseId))
    .orderBy(asc(databaseColumns.position), asc(databaseColumns.id))
}

/** Live views sorted (position, id). */
export function listViews(tx: DbOrTx, databaseId: string): Promise<DbViewRow[]> {
  return tx
    .select()
    .from(databaseViews)
    .where(and(eq(databaseViews.databaseId, databaseId), isNull(databaseViews.deletedAt)))
    .orderBy(asc(databaseViews.position), asc(databaseViews.id))
}

/** M11-D39 / M6.1-D11: a live DB_ROW body with text, or with an image / file block at any depth. */
export const rowHasBodySql = sql<boolean>`exists (select 1 from pages hb
    where hb.database_row_id = "database_rows"."id" and hb.deleted_at is null
      and (hb.content_text <> ''
           or jsonb_path_exists(hb.content, '$.** ? (@.type == "image" || @.type == "file")')))`.mapWith(Boolean)

/** Live rows sorted (position, id) with `hasBody` (non-blank DB_ROW page, M11-D19). */
export function listRows(tx: DbOrTx, databaseId: string): Promise<(DbRowRow & { hasBody: boolean })[]> {
  return tx
    .select({
      id: databaseRows.id,
      databaseId: databaseRows.databaseId,
      title: databaseRows.title,
      cells: databaseRows.cells,
      position: databaseRows.position,
      version: databaseRows.version,
      createdBy: databaseRows.createdBy,
      updatedBy: databaseRows.updatedBy,
      createdAt: databaseRows.createdAt,
      updatedAt: databaseRows.updatedAt,
      deletedAt: databaseRows.deletedAt,
      deletedBatch: databaseRows.deletedBatch,
      hasBody: rowHasBodySql,
    })
    .from(databaseRows)
    .where(and(eq(databaseRows.databaseId, databaseId), isNull(databaseRows.deletedAt)))
    .orderBy(asc(databaseRows.position), asc(databaseRows.id))
}

/** `hasBody` of some rows (results of writes). */
export async function hasBodyOf(tx: DbOrTx, rowIds: readonly string[]): Promise<Set<string>> {
  if (rowIds.length === 0) return new Set()
  const rows = await tx
    .select({ id: databaseRows.id, hasBody: rowHasBodySql })
    .from(databaseRows)
    .where(inArray(databaseRows.id, [...rowIds]))
  return new Set(rows.filter((r) => r.hasBody).map((r) => r.id))
}

/** Every row of a database, live and soft-deleted, in position order (type change converts them all, M11-D16). */
export function listAllRows(tx: DbOrTx, databaseId: string): Promise<DbRowRow[]> {
  return tx
    .select()
    .from(databaseRows)
    .where(eq(databaseRows.databaseId, databaseId))
    .orderBy(asc(databaseRows.position), asc(databaseRows.id))
}

export async function countLiveRows(tx: DbOrTx, databaseId: string): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(databaseRows)
    .where(and(eq(databaseRows.databaseId, databaseId), isNull(databaseRows.deletedAt)))
  return r?.n ?? 0
}

/** Attached databases of an owner page (FR-1475: ≤ 20). */
export async function countAttached(tx: DbOrTx, pageId: string): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(databases)
    .where(and(eq(databases.pageId, pageId), isNull(databases.detachedAt)))
  return r?.n ?? 0
}

/** Attached databases of a page (duplicatePage copies them, M11-D11). */
export function listAttached(tx: DbOrTx, pageId: string): Promise<DatabaseRow[]> {
  return tx
    .select()
    .from(databases)
    .where(and(eq(databases.pageId, pageId), isNull(databases.detachedAt)))
    .orderBy(asc(databases.createdAt), asc(databases.id))
}

/** One row (live unless `includeDeleted`); null when missing. */
export async function getRow(
  tx: DbOrTx,
  rowId: string,
  opts?: { includeDeleted?: boolean; lock?: 'update' | 'share' },
): Promise<DbRowRow | null> {
  if (!isUuid(rowId)) return null
  const where = opts?.includeDeleted
    ? eq(databaseRows.id, rowId)
    : and(eq(databaseRows.id, rowId), isNull(databaseRows.deletedAt))
  const q = tx.select().from(databaseRows).where(where)
  const [row] = opts?.lock ? await q.for(opts.lock) : await q
  return row ?? null
}

/** One column (live unless `includeDeleted`); null when missing. */
export async function getColumn(
  tx: DbOrTx,
  columnId: string,
  opts?: { includeDeleted?: boolean },
): Promise<DbColumnRow | null> {
  if (!isUuid(columnId)) return null
  const where = opts?.includeDeleted
    ? eq(databaseColumns.id, columnId)
    : and(eq(databaseColumns.id, columnId), isNull(databaseColumns.deletedAt))
  const [row] = await tx.select().from(databaseColumns).where(where)
  return row ?? null
}

/** One view (live unless `includeDeleted`); null when missing. */
export async function getView(
  tx: DbOrTx,
  viewId: string,
  opts?: { includeDeleted?: boolean },
): Promise<DbViewRow | null> {
  if (!isUuid(viewId)) return null
  const where = opts?.includeDeleted
    ? eq(databaseViews.id, viewId)
    : and(eq(databaseViews.id, viewId), isNull(databaseViews.deletedAt))
  const [row] = await tx.select().from(databaseViews).where(where)
  return row ?? null
}

/** People of a database response (§3.3: name / nickname / color / deactivated only). */
export async function peopleRefs(
  tx: DbOrTx,
  ids: readonly string[],
): Promise<{ id: string; name: string; nickname: string | null; color: string | null; deactivated: boolean }[]> {
  if (ids.length === 0) return []
  return tx
    .select({
      id: userTable.id,
      name: userTable.name,
      nickname: userTable.nickname,
      color: userTable.color,
      deactivated: sql<boolean>`coalesce(${userTable.banned}, false)`.mapWith(Boolean),
    })
    .from(userTable)
    .where(inArray(userTable.id, [...ids]))
}

/** The DB_ROW page of a row (live or soft-deleted) or null. */
export async function getRowBodyPage(
  tx: DbOrTx,
  rowId: string,
  o?: { forUpdate?: boolean },
): Promise<typeof pages.$inferSelect | null> {
  const q = tx.select().from(pages).where(eq(pages.databaseRowId, rowId))
  const [row] = o?.forUpdate ? await q.for('update') : await q
  return row ?? null
}

/** Ids among `ids` that are users; `activeOnly` → `banned is not true` (BR-90 PERSON). */
export async function userIdsAmong(
  tx: DbOrTx,
  ids: readonly string[],
  o: { activeOnly: boolean },
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await tx
    .select({ id: userTable.id })
    .from(userTable)
    .where(
      o.activeOnly
        ? and(inArray(userTable.id, [...ids]), sql`${userTable.banned} is not true`)
        : inArray(userTable.id, [...ids]),
    )
  return new Set(rows.map((r) => r.id))
}

/** Every user for BR-93 PERSON text matching (only active ones match, the domain decides). */
export function convertUsers(
  tx: DbOrTx,
): Promise<{ id: string; name: string; nickname: string | null; email: string; active: boolean }[]> {
  return tx
    .select({
      id: userTable.id,
      name: userTable.name,
      nickname: userTable.nickname,
      email: userTable.email,
      active: sql<boolean>`${userTable.banned} is not true`.mapWith(Boolean),
    })
    .from(userTable)
}
