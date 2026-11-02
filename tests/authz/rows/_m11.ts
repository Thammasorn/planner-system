// tests/authz/rows/_m11.ts — shared helpers for the M11 rows files (databases.ts, row-pages.ts), the masking block
// `databases (M11)`, the BR-98 golden isolation test and the database race test (plan/m11-database-views.md S6.1–S6.6,
// §7.2). No rows here. Expectations follow SPEC §3.2 PERM-24…26 (database = the owner page's view / edit permission;
// copy = view source + edit target), X41/X42 (invisible → 404 with one body, visible but not allowed → 403) and
// M6.1-D4 / FR-682 (page APIs addressed at a DB_ROW page → 404 for everyone).
// Setup helpers insert with plain Drizzle (never through src/server/repo/**) so a row's precondition never depends on
// the implementation under test; counts come from DB_LIMITS (one number per limit, M11-D37).
import { and, desc, eq, isNull } from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import { GET as GET_ROW_BODY } from '@/app/api/database-rows/[id]/body/route'
import { GET as GET_DATABASE } from '@/app/api/pages/[id]/databases/[databaseId]/route'
import { DB_LIMITS } from '@/lib/schemas/db-limits'
import { db } from '@/server/db/client'
import {
  databaseColumns,
  databaseRows,
  databases,
  databaseViews,
  pages,
  type DatabaseRow,
  type DbColumnRow,
  type DbRowRow,
  type DbViewRow,
  type PageRow,
} from '@/server/db/schema'
import type { World, WorldPart } from '../../helpers/world'
import { callRoute } from '../_support/http'
import type { Outcome, Role } from '../types'

export { ALL, ARCH_WRITE, auditFileP, auditPageP, auditPageWiki, each, MGR, PROJ } from './_m4'
export { DB_LIMITS }

/** World parts of every M11 row: 'databases' implies pages, taskBodies, files (X91, S0.17). */
export const DBS = ['databases'] as const satisfies readonly WorldPart[]
/** FW-ROW-* rows also carry 'taskBodies' literally: the M6.1 meta test reads `with` of every `FW-*` row unexpanded. */
export const DBS_FW = ['databases', 'taskBodies'] as const satisfies readonly WorldPart[]

/** A visible owner page whose input the service rejects: 400 for the team, 404 for W (authz first, X41). */
export const PROJ_400 = { M: '400', L: '400', Me: '400', W: '404' } as const satisfies Record<Role, Outcome>
/** FR-1463 stale baseVersion on a P object: 409 for the team, 404 for W. */
export const PROJ_409 = { M: '409', L: '409', Me: '409', W: '404' } as const satisfies Record<Role, Outcome>
/** A Q owner page: the manager and Q's member (the outsider); lead and member are not in Q. */
export const Q_ONLY = { M: 'allow', L: '404', Me: '404', W: 'allow' } as const satisfies Record<Role, Outcome>
/** Locked wiki owner page, input rejected after authz (M 400, workers 403 — the wiki is visible). */
export const MGR_400 = { M: '400', L: '403', Me: '403', W: '403' } as const satisfies Record<Role, Outcome>

/** M11-D5: one `database` audit row with the owner page's project (omitted projectId ⇒ null = wiki). */
export const auditDbP = { entity: 'database', projectId: (w: World) => w.P.id } as const
export const auditDbQ = { entity: 'database', projectId: (w: World) => w.Q.id } as const
export const auditDbA = { entity: 'database', projectId: (w: World) => w.A.id } as const
export const auditDbWiki = { entity: 'database' } as const
export const auditPageA = { entity: 'page', projectId: (w: World) => w.A.id } as const
export const auditFileA = { entity: 'file', projectId: (w: World) => w.A.id } as const

/** The exported action names of src/server/actions/databases.ts (§7.9, names verbatim) + ensureRowBody (row-pages.ts). */
export const M11_DATABASE_ACTIONS = [
  'createDatabase',
  'copyDatabase',
  'renameDatabase',
  'createDatabaseRows',
  'updateDatabaseRow',
  'deleteDatabaseRows',
  'restoreDatabaseRowBatch',
  'createDatabaseColumn',
  'updateDatabaseColumn',
  'duplicateDatabaseColumn',
  'changeDatabaseColumnType',
  'revertDatabaseColumnType',
  'deleteDatabaseColumn',
  'restoreDatabaseColumnBatch',
  'createDatabaseView',
  'updateDatabaseView',
  'deleteDatabaseView',
  'restoreDatabaseViewBatch',
] as const
export const DB_ROUTE = 'GET /api/pages/[id]/databases/[databaseId]'
export const ROW_BODY_ROUTE = 'GET /api/database-rows/[id]/body'
export const ROW_PAGE_LOADER = 'services.rowPages.getRowPageView'
/** The two routes M11 adds (AZ-2). */
export const M11_ROUTES = [DB_ROUTE, ROW_BODY_ROUTE] as const

/** `GET /api/pages/{pageId}/databases/{databaseId}` as the current asUser() session (M11-D7). */
export const dbGet = (pageId: string, databaseId: string): Promise<Response> =>
  callRoute(GET_DATABASE, `/api/pages/${encodeURIComponent(pageId)}/databases/${encodeURIComponent(databaseId)}`, {
    id: pageId,
    databaseId,
  })

/** `GET /api/database-rows/{rowId}/body` (M11-D8). */
export const rowBodyGet = (rowId: string): Promise<Response> =>
  callRoute(GET_ROW_BODY, `/api/database-rows/${encodeURIComponent(rowId)}/body`, { id: rowId })

/** Every secret string of the P / A databases (titles, row titles, row body text, a cell value) — 'P-ลับ2' covers
 *  P-ลับ20…29 (dbP title, pRow1 title, pRowBody text, the TEXT cell). */
export const pDbSecrets = (w: World): string[] => [
  'P-ลับ2',
  'A-ลับ2',
  'ฐานข้อมูลหลุด P',
  'ฐานข้อมูลงาน P',
  'แถวลบแล้ว P',
  w.databases.dbP.id,
  w.databases.pRow1.id,
  w.databases.pRow2.id,
  w.databases.pRowBody.id,
  w.databases.dbPColumns.status.id,
  w.databases.dbPViews.table.id,
  w.databases.dbA.id,
]
/** Everything of the Q database P's team must never receive. */
export const qDbSecrets = (w: World): string[] => ['Q-ลับ2', w.databases.dbQ.id, w.databases.qRow.id]

// ── reads of the current state (plain Drizzle) ──

export async function databaseById(id: string): Promise<DatabaseRow> {
  const [row] = await db.select().from(databases).where(eq(databases.id, id))
  if (!row) throw new Error(`databaseById: no database ${id}`)
  return row
}

export async function dbRowById(id: string): Promise<DbRowRow> {
  const [row] = await db.select().from(databaseRows).where(eq(databaseRows.id, id))
  if (!row) throw new Error(`dbRowById: no row ${id}`)
  return row
}

export async function dbColumnById(id: string): Promise<DbColumnRow> {
  const [row] = await db.select().from(databaseColumns).where(eq(databaseColumns.id, id))
  if (!row) throw new Error(`dbColumnById: no column ${id}`)
  return row
}

export async function dbViewById(id: string): Promise<DbViewRow> {
  const [row] = await db.select().from(databaseViews).where(eq(databaseViews.id, id))
  if (!row) throw new Error(`dbViewById: no view ${id}`)
  return row
}

/** Live columns of a database in position order (TITLE first). */
export async function liveColumns(databaseId: string): Promise<DbColumnRow[]> {
  return db
    .select()
    .from(databaseColumns)
    .where(and(eq(databaseColumns.databaseId, databaseId), isNull(databaseColumns.deletedAt)))
    .orderBy(databaseColumns.position, databaseColumns.id)
}

/** Live views of a database in position order. */
export async function liveViews(databaseId: string): Promise<DbViewRow[]> {
  return db
    .select()
    .from(databaseViews)
    .where(and(eq(databaseViews.databaseId, databaseId), isNull(databaseViews.deletedAt)))
    .orderBy(databaseViews.position, databaseViews.id)
}

/** Live rows of a database. */
export async function liveRows(databaseId: string): Promise<DbRowRow[]> {
  return db
    .select()
    .from(databaseRows)
    .where(and(eq(databaseRows.databaseId, databaseId), isNull(databaseRows.deletedAt)))
    .orderBy(databaseRows.position, databaseRows.id)
}

/** Databases owned by a page (attached and detached). */
export async function databasesOfPage(pageId: string): Promise<DatabaseRow[]> {
  return db.select().from(databases).where(eq(databases.pageId, pageId))
}

/** Attached (detached_at null) databases of a page. */
export async function attachedOf(pageId: string): Promise<DatabaseRow[]> {
  return db
    .select()
    .from(databases)
    .where(and(eq(databases.pageId, pageId), isNull(databases.detachedAt)))
}

/** Every DB_ROW page of a row (0 or 1 by pages_database_row_id_unique). */
export async function rowBodiesOf(rowId: string): Promise<PageRow[]> {
  return db.select().from(pages).where(eq(pages.databaseRowId, rowId))
}

// ── limit fillers (FR-1475): bulk inserts after the current last position ──

type Positioned = typeof databaseRows | typeof databaseColumns | typeof databaseViews

async function nextKeys(table: Positioned, databaseId: string, n: number): Promise<string[]> {
  const [last] = await db
    .select({ position: table.position })
    .from(table)
    .where(eq(table.databaseId, databaseId))
    .orderBy(desc(table.position))
    .limit(1)
  return generateNKeysBetween(last?.position ?? null, null, n)
}

/** Live rows until the database holds `total` live rows (no-op when it already does). */
export async function fillRowsTo(databaseId: string, total: number, by: { id: string }): Promise<void> {
  const n = total - (await liveRows(databaseId)).length
  if (n <= 0) return
  const keys = await nextKeys(databaseRows, databaseId, n)
  for (let i = 0; i < n; i += 500)
    await db.insert(databaseRows).values(
      keys.slice(i, i + 500).map((position, j) => ({
        databaseId,
        title: `เติม ${i + j + 1}`,
        position,
        createdBy: by.id,
        updatedBy: by.id,
      })),
    )
}

/** Live TEXT columns until the database holds `total` live columns (TITLE included). */
export async function fillColumnsTo(databaseId: string, total: number): Promise<void> {
  const n = total - (await liveColumns(databaseId)).length
  if (n <= 0) return
  const keys = await nextKeys(databaseColumns, databaseId, n)
  await db
    .insert(databaseColumns)
    .values(keys.map((position, i) => ({ databaseId, type: 'TEXT' as const, name: `เติม ${i + 1}`, position })))
}

/** Live TABLE views until the database holds `total` live views. */
export async function fillViewsTo(databaseId: string, total: number): Promise<void> {
  const n = total - (await liveViews(databaseId)).length
  if (n <= 0) return
  const keys = await nextKeys(databaseViews, databaseId, n)
  await db
    .insert(databaseViews)
    .values(keys.map((position, i) => ({ databaseId, type: 'TABLE' as const, name: `เติม ${i + 1}`, position })))
}

/** Attached databases until the page owns `total` attached ones (bare rows: no columns are needed to count). */
export async function fillDatabasesTo(pageId: string, total: number, by: { id: string }): Promise<void> {
  const n = total - (await attachedOf(pageId)).length
  if (n <= 0) return
  await db
    .insert(databases)
    .values(Array.from({ length: n }, (_, i) => ({ pageId, title: `เติม ${i + 1}`, createdBy: by.id, updatedBy: by.id })))
}

/** A `database` block (props.databaseId only, §7.7). */
export const databaseBlock = (databaseId: string): { type: 'database'; props: { databaseId: string } } => ({
  type: 'database',
  props: { databaseId },
})
