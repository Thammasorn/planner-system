// src/server/services/databases.ts — databases inside pages (SPEC §4.14, §5.11, §7.9; plan/m11 S0.7 signatures, S2
// bodies). Every function runs authz (authz.requireDatabase / requireDbRow / requireDbColumn / requireDbView or
// requirePage for the owner) before touching data, writes inside the caller's transaction and logs exactly one audit
// row (entity 'database', M11-D5) per mutating call. BR-98: nothing here reads or writes planning tables.
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import {
  convertColumn,
  defaultColumnName,
  normalizeCellInput,
  type CellRejectReason,
} from '@/domain/database'
import type { CellValue, ColumnConfig, DbColumnType, ISODate, ViewConfig } from '@/domain/types'
import { th } from '@/i18n/th'
import type {
  ChangeColumnTypeResult,
  ColumnResult,
  CreateDatabaseResult,
  CreateDatabaseRowsResult,
  DatabaseResponse,
  DbColumnDTO,
  DbRowDTO,
  DbViewDTO,
  DeleteBatchResult,
  RenameDatabaseResult,
  RestoreColumnBatchResult,
  RestoreRowBatchResult,
  RestoreViewBatchResult,
  RevertColumnTypeResult,
  UpdateDatabaseRowResult,
  ViewResult,
} from '@/lib/contracts/databases'
import { collectDatabaseIds } from '@/lib/editor/content-text'
import {
  DB_LIMITS,
  numberConfigSchema,
  selectConfigSchema,
  type ChangeDatabaseColumnTypeInput,
  type CreateDatabaseColumnInput,
  type CreateDatabaseInput,
  type CreateDatabaseRowsInput,
  type CreateDatabaseViewInput,
  type DeleteDatabaseRowsInput,
  type RenameDatabaseInput,
  type RevertDatabaseColumnTypeInput,
  type UpdateDatabaseColumnInput,
  type UpdateDatabaseRowInput,
  type UpdateDatabaseViewInput,
} from '@/lib/schemas/databases'
import * as audit from '../audit'
import * as authz from '../authz'
import type { DatabaseAccess } from '../authz'
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
} from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'
import { ConflictError, NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import * as dbRepo from '../repo/databases'
import type { SessionUser } from '../session'
import { keyAmong } from './order-keys'
import { clearLeases } from './page-lease'

export { collectDatabaseIds } from '@/lib/editor/content-text'

const L = DB_LIMITS
const E = th.database.errors

// ── DTOs ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const columnDTO = (c: DbColumnRow): DbColumnDTO => ({
  id: c.id,
  type: c.type,
  name: c.name,
  config: c.config as ColumnConfig,
  position: c.position,
  version: c.version,
})

export const viewDTO = (v: DbViewRow): DbViewDTO => ({
  id: v.id,
  type: v.type,
  name: v.name,
  config: v.config,
  position: v.position,
  version: v.version,
})

export const rowDTO = (r: DbRowRow, hasBody: boolean): DbRowDTO => ({
  id: r.id,
  title: r.title,
  cells: r.cells as Record<string, CellValue>,
  position: r.position,
  version: r.version,
  hasBody,
  createdBy: r.createdBy,
  createdAt: r.createdAt.toISOString(),
  updatedBy: r.updatedBy,
  updatedAt: r.updatedAt.toISOString(),
})

async function rowDTOs(tx: DbOrTx, rows: readonly DbRowRow[]): Promise<DbRowDTO[]> {
  const withBody = await dbRepo.hasBodyOf(
    tx,
    rows.map((r) => r.id),
  )
  return rows.map((r) => rowDTO(r, withBody.has(r.id)))
}

/** The domain's view of a stored column (config is stored as plain JSON). */
const columnLike = (c: DbColumnRow): { id: string; type: DbColumnType; config: ColumnConfig } => ({
  id: c.id,
  type: c.type,
  config: c.config as ColumnConfig,
})

/** jsonb columns are typed Record<string, unknown>; config DTO types are closed interfaces. */
const asJson = (v: object): Record<string, unknown> => v as Record<string, unknown>

// ── errors ───────────────────────────────────────────────────────────────────────────────────────────────────────

const invalid = (msg: string, field = 'input'): ValidationError => new ValidationError({ [field]: [msg] }, msg)

const conflict = (target: 'database' | 'row' | 'column' | 'view', current: unknown): ConflictError =>
  new ConflictError('VERSION_CONFLICT', undefined, { target, current })

function reasonMessage(reason: CellRejectReason, type: DbColumnType): string {
  switch (reason) {
    case 'TITLE':
      return E.titleColumn
    case 'TOO_LONG':
      return E.limit.text(L.text)
    case 'URL':
      return E.badUrl
    case 'DUPLICATE':
      return E.duplicateIds
    case 'TOO_MANY':
      return type === 'PERSON' ? E.limit.people(L.people) : E.limit.multi(L.multi)
    case 'INACTIVE_USER':
      return E.inactivePerson
    default:
      return E.badValue
  }
}

// ── audit ────────────────────────────────────────────────────────────────────────────────────────────────────────

const idsForAudit = (ids: readonly string[]): { ids: string[]; count?: number } =>
  ids.length <= 50 ? { ids: [...ids] } : { ids: ids.slice(0, 50), count: ids.length }

function logDb(
  tx: Tx,
  user: SessionUser,
  a: { database: DatabaseRow; owner: authz.PageAccess },
  action: 'create' | 'update' | 'delete' | 'restore',
  summary: string,
  after: Record<string, unknown>,
): Promise<void> {
  return audit.log(tx, user, {
    entity: 'database',
    entityId: a.database.id,
    action,
    projectId: a.owner.page.projectId,
    summary,
    after,
  })
}

// ── reads ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The response of an authorised database: one SQL per table + one for people (M11-D19). */
export async function loadResponse(tx: DbOrTx, database: DatabaseRow, canEdit: boolean): Promise<DatabaseResponse> {
  const columns = await dbRepo.listColumns(tx, database.id)
  const views = await dbRepo.listViews(tx, database.id)
  const rows = await dbRepo.listRows(tx, database.id)
  const personCols = columns.filter((c) => c.type === 'PERSON').map((c) => c.id)
  const ids = new Set<string>()
  for (const r of rows) {
    ids.add(r.createdBy)
    ids.add(r.updatedBy)
    for (const c of personCols) {
      const v = r.cells[c]
      if (Array.isArray(v)) for (const id of v) if (typeof id === 'string') ids.add(id)
    }
  }
  const people: DatabaseResponse['people'] = {}
  for (const p of await dbRepo.peopleRefs(tx, [...ids])) {
    people[p.id] = { name: p.name, nickname: p.nickname, color: p.color, deactivated: p.deactivated }
  }
  return {
    id: database.id,
    pageId: database.pageId,
    title: database.title,
    version: database.version,
    canEdit,
    columns: columns.map(columnDTO),
    views: views.map(viewDTO),
    rows: rows.map((r) => rowDTO(r, r.hasBody)),
    people,
  }
}

/** GET /api/pages/[id]/databases/[databaseId] (M11-D7/D19): requireDatabase(view, { pageId }) → one SQL per table. */
export async function getDatabase(
  tx: DbOrTx,
  user: SessionUser,
  ids: { pageId: string; databaseId: string },
): Promise<DatabaseResponse> {
  const a = await authz.requireDatabase(tx, user, ids.databaseId, 'view', { pageId: ids.pageId })
  return loadResponse(tx, a.database, a.canEdit)
}

// ── database ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * FR-1475 (rev. 2026-11-03): a database of `height` levels (1 = no nested databases) placed on `owner` must stay within
 * DB_LIMITS.nestingLevels — DOC / TASK owners start at level 1, a row body at its database's level + 1. `edit` on the
 * owner is authorised by the caller.
 */
export function assertNestingAllowed(owner: authz.PageAccess, height: number, field = 'pageId'): void {
  if (authz.databaseLevelOn(owner) + height - 1 > L.nestingLevels) throw invalid(E.nesting(L.nestingLevels), field)
}

/** Lock the owner page row and check the FR-1475 attached-database limit. */
export async function lockOwnerForNewDatabase(tx: Tx, pageId: string): Promise<void> {
  await tx.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId)).for('update')
  if ((await dbRepo.countAttached(tx, pageId)) >= L.databasesPerPage) {
    throw invalid(E.limit.databases(L.databasesPerPage), 'pageId')
  }
}

const statusOptions = (): { id: string; name: string; color: 'gray' | 'blue' | 'green' }[] => {
  const [todo, doing, done] = th.database.defaults.statusOptions
  return [
    { id: randomUUID(), name: todo, color: 'gray' },
    { id: randomUUID(), name: doing, color: 'blue' },
    { id: randomUUID(), name: done, color: 'green' },
  ]
}

function defaultConfig(type: DbColumnType): Record<string, unknown> {
  if (type === 'SELECT' || type === 'MULTI_SELECT') return { options: [] }
  if (type === 'NUMBER') return { decimals: null, thousands: true }
  return {}
}

/** M11-D10: owner DOC/TASK or a row body under the nesting limit (FR-1475), page locked, ≤ 20 attached, default
 *  columns + first view; audit `database · create`. */
export async function createDatabase(
  tx: Tx,
  user: SessionUser,
  input: CreateDatabaseInput,
): Promise<CreateDatabaseResult> {
  const owner = await authz.requirePage(tx, user, input.pageId, 'edit') // W → 404, archived / locked → 403
  assertNestingAllowed(owner, 1)
  await lockOwnerForNewDatabase(tx, owner.page.id)
  const [database] = await tx
    .insert(databases)
    .values({ pageId: owner.page.id, title: '', createdBy: user.id, updatedBy: user.id })
    .returning()
  const keys = repo.order.rekey(3)
  const d = th.database.defaults
  const cols = await tx
    .insert(databaseColumns)
    .values([
      { databaseId: database!.id, type: 'TITLE', name: d.title, position: keys[0]! },
      { databaseId: database!.id, type: 'SELECT', name: d.status, position: keys[1]!, config: { options: statusOptions() } },
      { databaseId: database!.id, type: 'DATE', name: d.date, position: keys[2]! },
    ])
    .returning()
  const status = cols.find((c) => c.type === 'SELECT')!
  const date = cols.find((c) => c.type === 'DATE')!
  const config: ViewConfig =
    input.view === 'KANBAN'
      ? { groupByColumnId: status.id }
      : input.view === 'CALENDAR'
        ? { dateColumnId: date.id }
        : {}
  await tx.insert(databaseViews).values({
    databaseId: database!.id,
    type: input.view,
    name: th.database.views.defaultName(th.database.views[input.view], 1),
    config: asJson(config),
    position: repo.order.rekey(1)[0]!,
  })
  await logDb(tx, user, { database: database!, owner }, 'create', th.audit.dbCreated(database!.title), {
    target: 'database',
    ids: [database!.id],
    view: input.view,
  })
  return { databaseId: database!.id, database: await loadResponse(tx, database!, true) }
}

/** M11-D14: baseVersion check → VERSION_CONFLICT { current }. */
export async function renameDatabase(
  tx: Tx,
  user: SessionUser,
  input: RenameDatabaseInput,
): Promise<RenameDatabaseResult> {
  const a = await authz.requireDatabase(tx, user, input.databaseId, 'edit')
  const [row] = await tx
    .update(databases)
    .set({ title: input.title, version: sql`${databases.version} + 1`, updatedBy: user.id, updatedAt: sql`now()` })
    .where(and(eq(databases.id, a.database.id), eq(databases.version, input.baseVersion)))
    .returning()
  if (!row) {
    const cur = await dbRepo.getDatabase(tx, a.database.id)
    if (!cur) throw new NotFoundError()
    throw conflict('database', { id: cur.id, title: cur.title, version: cur.version })
  }
  await logDb(tx, user, { database: row, owner: a.owner }, 'update', th.audit.dbRenamed(row.title), {
    target: 'database',
    ids: [row.id],
    versions: [row.version],
  })
  return { databaseId: row.id, title: row.title, version: row.version }
}

// ── cells ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ids referenced by PERSON cells of an input (for the active-user lookup). */
function personIdsOf(cells: Record<string, unknown>, columns: ReadonlyMap<string, DbColumnRow>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(cells)) {
    if (columns.get(k)?.type === 'PERSON' && Array.isArray(v)) out.push(...v.filter((x) => typeof x === 'string'))
  }
  return out
}

/**
 * M11-D15: validate the sent keys against the **live** columns (unknown / soft-deleted → VALIDATION) and merge
 * them into `stored` (null / empty → delete the key). Returns the merged cells.
 */
function mergeCells(
  stored: Record<string, unknown>,
  patch: Record<string, unknown>,
  live: ReadonlyMap<string, DbColumnRow>,
  activeUserIds: ReadonlySet<string>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...stored }
  for (const [key, value] of Object.entries(patch)) {
    const col = live.get(key)
    if (!col) throw invalid(E.unknownColumn, 'cells')
    const res = normalizeCellInput(columnLike(col), value, { stored: stored[key], activeUserIds })
    if (!res.ok) throw invalid(reasonMessage(res.reason, col.type), 'cells')
    if (res.value === null) delete next[key]
    else next[key] = res.value
  }
  return next
}

async function liveColumnMap(tx: DbOrTx, databaseId: string): Promise<Map<string, DbColumnRow>> {
  return new Map((await dbRepo.listColumns(tx, databaseId)).map((c) => [c.id, c]))
}

/** Position among live rows (M11-D18): undefined = last, null = first, id = right after it (unknown id → last). */
async function rowKey(
  tx: Tx,
  siblings: { id: string; position: string }[],
  afterId: string | null | undefined,
): Promise<string> {
  const after = afterId !== undefined && afterId !== null && !siblings.some((s) => s.id === afterId) ? undefined : afterId
  return keyAmong(siblings, after, async (id, position) => {
    await tx.update(databaseRows).set({ position }).where(eq(databaseRows.id, id))
  })
}

// ── rows ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ≤ 50 rows per call, ≤ 1,000 live rows (FR-1475), cells via domain normalizeCellInput (M11-D15). */
export async function createRows(
  tx: Tx,
  user: SessionUser,
  input: CreateDatabaseRowsInput,
): Promise<CreateDatabaseRowsResult> {
  const a = await authz.requireDatabase(tx, user, input.databaseId, 'edit', { lock: true })
  if ((await dbRepo.countLiveRows(tx, a.database.id)) + input.rows.length > L.rows) {
    throw invalid(E.limit.rows(L.rows), 'rows')
  }
  const live = await liveColumnMap(tx, a.database.id)
  const active = await dbRepo.userIdsAmong(
    tx,
    input.rows.flatMap((r) => personIdsOf(r.cells ?? {}, live)),
    { activeOnly: true },
  )
  const prepared = input.rows.map((r) => ({ title: r.title ?? '', cells: mergeCells({}, r.cells ?? {}, live, active) }))
  const siblings = (await dbRepo.listRows(tx, a.database.id)).map((r) => ({ id: r.id, position: r.position }))
  const values: (typeof databaseRows.$inferInsert)[] = []
  let prevAfter: string | null | undefined
  let prevId: string | undefined
  for (const [i, r] of prepared.entries()) {
    const want = input.rows[i]!.afterRowId
    // consecutive rows with the same anchor keep their order (each goes after the previous one)
    const anchor = i > 0 && want === prevAfter && want !== undefined ? prevId : want
    const position = await rowKey(tx, siblings, anchor)
    const id = randomUUID()
    values.push({ id, databaseId: a.database.id, title: r.title, cells: r.cells, position, createdBy: user.id, updatedBy: user.id })
    siblings.push({ id, position })
    siblings.sort((x, y) => (x.position < y.position ? -1 : x.position > y.position ? 1 : x.id < y.id ? -1 : 1))
    prevAfter = want
    prevId = id
  }
  const inserted = await tx.insert(databaseRows).values(values).returning()
  const byId = new Map(inserted.map((r) => [r.id, r]))
  const rows = values.map((v) => rowDTO(byId.get(v.id!)!, false))
  await logDb(tx, user, a, 'create', th.audit.dbRowsCreated(a.database.title, rows.length), {
    target: 'row',
    ...idsForAudit(rows.map((r) => r.id)),
  })
  return { rows }
}

/** Merge only sent cell keys (`null` clears); optional move (M11-D18); version check (M11-D14). */
export async function updateRow(
  tx: Tx,
  user: SessionUser,
  input: UpdateDatabaseRowInput,
): Promise<UpdateDatabaseRowResult> {
  const a = await authz.requireDbRow(tx, user, input.rowId, 'edit', { lock: input.move !== undefined })
  const row = a.row
  const set: Partial<typeof databaseRows.$inferInsert> = {}
  if (input.title !== undefined) set.title = input.title
  if (input.cells !== undefined) {
    const live = await liveColumnMap(tx, a.database.id)
    const active = await dbRepo.userIdsAmong(tx, personIdsOf(input.cells, live), { activeOnly: true })
    set.cells = mergeCells(row.cells, input.cells, live, active)
  }
  if (input.move !== undefined) {
    const siblings = (await dbRepo.listRows(tx, a.database.id))
      .filter((r) => r.id !== row.id)
      .map((r) => ({ id: r.id, position: r.position }))
    set.position = await rowKey(tx, siblings, input.move.afterRowId)
  }
  const [updated] = await tx
    .update(databaseRows)
    .set({ ...set, version: sql`${databaseRows.version} + 1`, updatedBy: user.id, updatedAt: sql`now()` })
    .where(
      and(eq(databaseRows.id, row.id), eq(databaseRows.version, input.baseVersion), isNull(databaseRows.deletedAt)),
    )
    .returning()
  if (!updated) {
    const cur = await dbRepo.getRow(tx, row.id)
    if (!cur) throw new NotFoundError()
    throw conflict('row', (await rowDTOs(tx, [cur]))[0])
  }
  await logDb(tx, user, a, 'update', th.audit.dbRowUpdated(a.database.title), {
    target: 'row',
    ids: [updated.id],
    versions: [updated.version],
  })
  return { row: (await rowDTOs(tx, [updated]))[0]! }
}

/** Soft delete rows + their body pages in one batch, leases cleared (M11-D17). All rows of one database. */
export async function deleteRows(
  tx: Tx,
  user: SessionUser,
  input: DeleteDatabaseRowsInput,
): Promise<DeleteBatchResult> {
  authz.requireUser(user)
  const ids = [...new Set(input.rowIds)]
  const found = await tx
    .select({ id: databaseRows.id, databaseId: databaseRows.databaseId })
    .from(databaseRows)
    .where(and(inArray(databaseRows.id, ids), isNull(databaseRows.deletedAt)))
  const dbIds = new Set(found.map((r) => r.databaseId))
  if (found.length !== ids.length || dbIds.size !== 1) throw new NotFoundError() // X41: all-or-nothing
  const a = await authz.requireDatabase(tx, user, [...dbIds][0]!, 'edit', { lock: true })
  const batch = randomUUID()
  await tx
    .update(databaseRows)
    .set({ deletedAt: sql`now()`, deletedBatch: batch })
    .where(and(inArray(databaseRows.id, ids), isNull(databaseRows.deletedAt)))
  const bodies = await tx
    .update(pages)
    .set({ deletedAt: sql`now()`, deletedBatch: batch })
    .where(and(inArray(pages.databaseRowId, ids), isNull(pages.deletedAt)))
    .returning({ id: pages.id })
  await clearLeases(
    tx,
    bodies.map((b) => b.id),
  )
  await logDb(tx, user, a, 'delete', th.audit.dbRowsDeleted(a.database.title, ids.length), {
    target: 'row',
    ...idsForAudit(ids),
    batch,
  })
  return { batch }
}

/** Rows (or columns / views) of a batch + whether the batch is past the 30-day window (DB time). */
async function batchRows(
  tx: Tx,
  table: 'database_rows' | 'database_columns' | 'database_views',
  batch: string,
): Promise<{ id: string; databaseId: string; expired: boolean }[]> {
  const rows = await tx.execute<{ id: string; database_id: string; expired: boolean }>(sql`
    select id, database_id, (deleted_at <= now() - interval '30 days') as expired
    from ${sql.identifier(table)} where deleted_batch = ${batch}`)
  return rows.map((r) => ({ id: r.id, databaseId: r.database_id, expired: r.expired }))
}

async function requireBatch(
  tx: Tx,
  user: SessionUser,
  rows: { databaseId: string; expired: boolean }[],
): Promise<DatabaseAccess> {
  const dbIds = new Set(rows.map((r) => r.databaseId))
  if (rows.length === 0 || dbIds.size !== 1) throw new NotFoundError()
  const a = await authz.requireDatabase(tx, user, [...dbIds][0]!, 'edit', { lock: true }) // re-run authz (M11-D17)
  if (rows.some((r) => r.expired)) throw invalid(E.restoreExpired, 'batch')
  return a
}

/** Restore rows + bodies of a batch (≤ 30 days, limit re-checked, authz re-run). */
export async function restoreRowBatch(
  tx: Tx,
  user: SessionUser,
  input: { batch: string },
): Promise<RestoreRowBatchResult> {
  authz.requireUser(user)
  const list = await batchRows(tx, 'database_rows', input.batch)
  const a = await requireBatch(tx, user, list)
  if ((await dbRepo.countLiveRows(tx, a.database.id)) + list.length > L.rows) throw invalid(E.limit.rows(L.rows), 'batch')
  const ids = list.map((r) => r.id)
  const restored = await tx
    .update(databaseRows)
    .set({ deletedAt: null, deletedBatch: null })
    .where(inArray(databaseRows.id, ids))
    .returning()
  await tx
    .update(pages)
    .set({ deletedAt: null, deletedBatch: null })
    .where(and(eq(pages.deletedBatch, input.batch), inArray(pages.databaseRowId, ids)))
  restored.sort((x, y) => (x.position < y.position ? -1 : x.position > y.position ? 1 : x.id < y.id ? -1 : 1))
  await logDb(tx, user, a, 'restore', th.audit.dbRowsRestored(a.database.title, ids.length), {
    target: 'row',
    ...idsForAudit(ids),
    batch: input.batch,
  })
  return { rows: await rowDTOs(tx, restored) }
}

// ── columns ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A column's config validated against its type; new options get server ids (M11-D35). */
function checkedConfig(type: DbColumnType, config: unknown): Record<string, unknown> {
  if (type === 'SELECT' || type === 'MULTI_SELECT') {
    const p = selectConfigSchema.safeParse(config)
    if (!p.success) throw invalid(E.badValue, 'config')
    const options = p.data.options.map((o) => ({ id: o.id ?? randomUUID(), name: o.name, color: o.color }))
    if (new Set(options.map((o) => o.id)).size !== options.length) throw invalid(E.duplicateIds, 'config')
    return { options }
  }
  if (type === 'NUMBER') {
    const p = numberConfigSchema.safeParse(config)
    if (!p.success) throw invalid(E.badValue, 'config')
    return p.data
  }
  if (typeof config !== 'object' || config === null || Object.keys(config).length > 0) throw invalid(E.badValue, 'config')
  return {}
}

async function columnKey(
  tx: Tx,
  siblings: { id: string; position: string }[],
  afterId: string | null | undefined,
): Promise<string> {
  const after = afterId !== undefined && afterId !== null && !siblings.some((s) => s.id === afterId) ? undefined : afterId
  return keyAmong(siblings, after, async (id, position) => {
    await tx.update(databaseColumns).set({ position }).where(eq(databaseColumns.id, id))
  })
}

async function insertColumn(
  tx: Tx,
  databaseId: string,
  v: { type: DbColumnType; name: string; config: Record<string, unknown>; afterId: string | null | undefined },
): Promise<DbColumnRow> {
  const live = await dbRepo.listColumns(tx, databaseId)
  if (live.length >= L.columns) throw invalid(E.limit.columns(L.columns), 'type')
  const position = await columnKey(tx, live, v.afterId)
  const [col] = await tx
    .insert(databaseColumns)
    .values({ databaseId, type: v.type, name: v.name.slice(0, L.name), config: v.config, position })
    .returning()
  return col!
}

/** FR-1411: default name per type (domain defaultColumnName); ≤ 30 columns. */
export async function createColumn(
  tx: Tx,
  user: SessionUser,
  input: CreateDatabaseColumnInput,
): Promise<ColumnResult> {
  const a = await authz.requireDatabase(tx, user, input.databaseId, 'edit', { lock: true })
  const names = (await dbRepo.listColumns(tx, a.database.id)).map((c) => c.name)
  const col = await insertColumn(tx, a.database.id, {
    type: input.type,
    name: input.name ?? defaultColumnName(th.database.types[input.type], names),
    config: defaultConfig(input.type),
    afterId: input.afterColumnId,
  })
  await logDb(tx, user, a, 'create', th.audit.dbColumnCreated(a.database.title), {
    target: 'column',
    ids: [col.id],
    type: col.type,
  })
  return { column: columnDTO(col) }
}

/** Rename / config (options: shorter list = delete option, M11-D17) / move; version check. */
export async function updateColumn(
  tx: Tx,
  user: SessionUser,
  input: UpdateDatabaseColumnInput,
): Promise<ColumnResult> {
  const a = await authz.requireDbColumn(tx, user, input.columnId, 'edit', { lock: true })
  const col = a.column
  const set: Partial<typeof databaseColumns.$inferInsert> = {}
  if (input.name !== undefined) set.name = input.name
  if (input.config !== undefined) set.config = checkedConfig(col.type, input.config)
  if (input.afterColumnId !== undefined) {
    const siblings = (await dbRepo.listColumns(tx, a.database.id)).filter((c) => c.id !== col.id)
    set.position = await columnKey(tx, siblings, input.afterColumnId)
  }
  const [updated] = await tx
    .update(databaseColumns)
    .set({ ...set, version: sql`${databaseColumns.version} + 1`, updatedAt: sql`now()` })
    .where(and(eq(databaseColumns.id, col.id), eq(databaseColumns.version, input.baseVersion)))
    .returning()
  if (!updated) {
    const cur = await dbRepo.getColumn(tx, col.id)
    if (!cur) throw new NotFoundError()
    throw conflict('column', columnDTO(cur))
  }
  await logDb(tx, user, a, 'update', th.audit.dbColumnUpdated(a.database.title), {
    target: 'column',
    ids: [updated.id],
    versions: [updated.version],
  })
  return { column: columnDTO(updated) }
}

/** Copy of the column with its values (FR-1412), placed right after it. */
export async function duplicateColumn(
  tx: Tx,
  user: SessionUser,
  input: { columnId: string },
): Promise<ColumnResult> {
  const a = await authz.requireDbColumn(tx, user, input.columnId, 'edit', { lock: true })
  const src = a.column
  if (src.type === 'TITLE') throw invalid(E.titleColumn, 'columnId')
  const names = (await dbRepo.listColumns(tx, a.database.id)).map((c) => c.name)
  const col = await insertColumn(tx, a.database.id, {
    type: src.type,
    name: defaultColumnName(th.database.defaults.columnCopy(src.name).slice(0, L.name), names),
    config: src.config,
    afterId: src.id,
  })
  // values: additive key on every row (live and deleted); updateRow merges keys, so no version bump is needed
  await tx.execute(sql`
    update database_rows set cells = cells || jsonb_build_object(${col.id}::text, cells -> ${src.id}::text)
    where database_id = ${a.database.id} and cells ? ${src.id}::text`)
  await logDb(tx, user, a, 'create', th.audit.dbColumnDuplicated(a.database.title), {
    target: 'column',
    ids: [col.id],
    copyOf: src.id,
  })
  return { column: columnDTO(col) }
}

/** Write `values` (rowId → value | null = delete) of one column; bumps versions; returns the changed rows. */
async function writeColumnValues(
  tx: Tx,
  user: SessionUser,
  columnId: string,
  values: Map<string, CellValue | null>,
): Promise<DbRowRow[]> {
  if (values.size === 0) return []
  const payload = JSON.stringify(Object.fromEntries(values))
  const changed = await tx.execute<{ id: string }>(sql`
    update database_rows r
    set cells = case when v.val = 'null'::jsonb then r.cells - ${columnId}::text
                     else jsonb_set(r.cells, array[${columnId}::text], v.val) end,
        version = r.version + 1, updated_by = ${user.id}, updated_at = now()
    from jsonb_each(${payload}::jsonb) v(id, val)
    where r.id = v.id::uuid
    returning r.id`)
  const ids = changed.map((r) => r.id)
  if (ids.length === 0) return []
  return tx
    .select()
    .from(databaseRows)
    .where(and(inArray(databaseRows.id, ids), isNull(databaseRows.deletedAt)))
    .orderBy(databaseRows.position, databaseRows.id)
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** M11-D16 / BR-93: convert every row (live and deleted) in one tx. */
export async function changeColumnType(
  tx: Tx,
  user: SessionUser,
  input: ChangeDatabaseColumnTypeInput,
  today: ISODate,
): Promise<ChangeColumnTypeResult> {
  const a = await authz.requireDbColumn(tx, user, input.columnId, 'edit', { lock: true })
  const col = a.column
  if (col.type === 'TITLE') throw invalid(E.titleColumn, 'type')
  if (col.version !== input.baseVersion) throw conflict('column', columnDTO(col))
  const rows = await dbRepo.listAllRows(tx, a.database.id)
  const users = input.type === 'PERSON' ? await dbRepo.convertUsers(tx) : []
  const res = convertColumn(
    { id: col.id, type: col.type, config: col.config as ColumnConfig },
    input.type,
    rows.map((r) => ({ id: r.id, title: r.title, cells: r.cells, position: r.position })),
    { users, today, newId: () => randomUUID() },
  )
  const previousValues: Record<string, CellValue> = {}
  const changes = new Map<string, CellValue | null>()
  for (const r of rows) {
    const stored = r.cells[col.id]
    if (stored !== undefined && stored !== null) previousValues[r.id] = stored as CellValue
    const next = res.values.get(r.id) ?? null
    if (!sameValue(stored, next)) changes.set(r.id, next)
  }
  const [updated] = await tx
    .update(databaseColumns)
    .set({ type: input.type, config: asJson(res.config), version: sql`${databaseColumns.version} + 1`, updatedAt: sql`now()` })
    .where(eq(databaseColumns.id, col.id))
    .returning()
  const changed = await writeColumnValues(tx, user, col.id, changes)
  await logDb(tx, user, a, 'update', th.audit.dbColumnTypeChanged(a.database.title), {
    target: 'column',
    ids: [col.id],
    type: input.type,
    fromType: col.type,
  })
  return {
    column: columnDTO(updated!),
    rows: await rowDTOs(tx, changed),
    previous: { type: col.type, config: col.config as ColumnConfig, columnVersion: updated!.version, values: previousValues },
  }
}

/** M11-D16: column.version must equal previous.columnVersion; every value re-validated. */
export async function revertColumnType(
  tx: Tx,
  user: SessionUser,
  input: RevertDatabaseColumnTypeInput,
): Promise<RevertColumnTypeResult> {
  const a = await authz.requireDbColumn(tx, user, input.columnId, 'edit', { lock: true })
  const col = a.column
  const prev = input.previous
  if (col.type === 'TITLE' || prev.type === 'TITLE') throw invalid(E.titleColumn, 'previous')
  if (col.version !== prev.columnVersion) {
    throw new ConflictError('VERSION_CONFLICT', th.database.toasts.revertBlocked, {
      target: 'column',
      current: columnDTO(col),
    })
  }
  const config = checkedConfig(prev.type, prev.config)
  const rows = await dbRepo.listAllRows(tx, a.database.id)
  const known = new Set(rows.map((r) => r.id))
  const people = Object.values(prev.values).flatMap((v) => (prev.type === 'PERSON' && Array.isArray(v) ? v : []))
  const existing = await dbRepo.userIdsAmong(tx, people, { activeOnly: false })
  const target = { id: col.id, type: prev.type, config: config as ColumnConfig }
  const wanted = new Map<string, CellValue | null>()
  for (const [rowId, value] of Object.entries(prev.values)) {
    if (!known.has(rowId)) throw invalid(E.badValue, 'previous')
    const res = normalizeCellInput(target, value, { activeUserIds: existing })
    if (!res.ok) throw invalid(reasonMessage(res.reason, prev.type), 'previous')
    wanted.set(rowId, res.value)
  }
  const changes = new Map<string, CellValue | null>()
  for (const r of rows) {
    const next = wanted.get(r.id) ?? null
    if (!sameValue(r.cells[col.id], next)) changes.set(r.id, next)
  }
  const [updated] = await tx
    .update(databaseColumns)
    .set({ type: prev.type, config, version: sql`${databaseColumns.version} + 1`, updatedAt: sql`now()` })
    .where(eq(databaseColumns.id, col.id))
    .returning()
  const changed = await writeColumnValues(tx, user, col.id, changes)
  await logDb(tx, user, a, 'update', th.audit.dbColumnTypeReverted(a.database.title), {
    target: 'column',
    ids: [col.id],
    type: prev.type,
    fromType: col.type,
  })
  return { column: columnDTO(updated!), rows: await rowDTOs(tx, changed) }
}

/** Soft delete with batch; TITLE → VALIDATION; values untouched (M11-D17). */
export async function deleteColumn(
  tx: Tx,
  user: SessionUser,
  input: { columnId: string },
): Promise<DeleteBatchResult> {
  const a = await authz.requireDbColumn(tx, user, input.columnId, 'edit', { lock: true })
  if (a.column.type === 'TITLE') throw invalid(E.titleColumn, 'columnId')
  const batch = randomUUID()
  await tx
    .update(databaseColumns)
    .set({ deletedAt: sql`now()`, deletedBatch: batch })
    .where(eq(databaseColumns.id, a.column.id))
  await logDb(tx, user, a, 'delete', th.audit.dbColumnDeleted(a.database.title), {
    target: 'column',
    ids: [a.column.id],
    batch,
  })
  return { batch }
}

export async function restoreColumnBatch(
  tx: Tx,
  user: SessionUser,
  input: { batch: string },
): Promise<RestoreColumnBatchResult> {
  authz.requireUser(user)
  const list = await batchRows(tx, 'database_columns', input.batch)
  const a = await requireBatch(tx, user, list)
  const live = await dbRepo.listColumns(tx, a.database.id)
  if (live.length + list.length > L.columns) throw invalid(E.limit.columns(L.columns), 'batch')
  const restored = await tx
    .update(databaseColumns)
    .set({ deletedAt: null, deletedBatch: null })
    .where(eq(databaseColumns.deletedBatch, input.batch))
    .returning()
  restored.sort((x, y) => (x.position < y.position ? -1 : x.position > y.position ? 1 : x.id < y.id ? -1 : 1))
  await logDb(tx, user, a, 'restore', th.audit.dbColumnRestored(a.database.title), {
    target: 'column',
    ...idsForAudit(restored.map((c) => c.id)),
    batch: input.batch,
  })
  return { columns: restored.map(columnDTO) }
}

// ── views ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every column id a view config names must be a column of this database (live or soft-deleted, §7.9). */
function assertConfigColumns(config: ViewConfig, known: ReadonlySet<string>): void {
  const ids = [
    ...(config.hiddenColumnIds ?? []),
    ...Object.keys(config.columnWidths ?? {}),
    ...(config.sorts ?? []).map((s) => s.columnId),
    ...(config.filters ?? []).map((f) => f.columnId),
    ...(config.groupByColumnId ? [config.groupByColumnId] : []),
    ...(config.dateColumnId ? [config.dateColumnId] : []),
    ...(config.cardColumnIds ?? []),
  ]
  if (ids.some((id) => !known.has(id))) throw invalid(E.unknownColumn, 'config')
}

const GROUP_TYPES: readonly DbColumnType[] = ['SELECT', 'PERSON', 'CHECKBOX']

async function viewKey(
  tx: Tx,
  siblings: { id: string; position: string }[],
  afterId: string | null | undefined,
): Promise<string> {
  const after = afterId !== undefined && afterId !== null && !siblings.some((s) => s.id === afterId) ? undefined : afterId
  return keyAmong(siblings, after, async (id, position) => {
    await tx.update(databaseViews).set({ position }).where(eq(databaseViews.id, id))
  })
}

/** M11-D10: KANBAN/CALENDAR without a suitable column creates "สถานะ"/"วันที่" in the same tx; copyFromViewId copies config. */
export async function createView(tx: Tx, user: SessionUser, input: CreateDatabaseViewInput): Promise<ViewResult> {
  const a = await authz.requireDatabase(tx, user, input.databaseId, 'edit', { lock: true })
  const views = await dbRepo.listViews(tx, a.database.id)
  if (views.length >= L.views) throw invalid(E.limit.views(L.views), 'type')
  let config: ViewConfig = {}
  if (input.copyFromViewId !== undefined) {
    const from = views.find((v) => v.id === input.copyFromViewId)
    if (!from) throw new NotFoundError()
    config = structuredClone(from.config)
  }
  const columns = await dbRepo.listColumns(tx, a.database.id)
  let createdColumn: DbColumnRow | undefined
  const names = columns.map((c) => c.name)
  if (input.type === 'KANBAN' && !columns.some((c) => c.id === config.groupByColumnId && GROUP_TYPES.includes(c.type))) {
    const group = GROUP_TYPES.map((t) => columns.find((c) => c.type === t)).find((c) => c !== undefined)
    if (group) config.groupByColumnId = group.id
    else {
      createdColumn = await insertColumn(tx, a.database.id, {
        type: 'SELECT',
        name: defaultColumnName(th.database.defaults.status, names),
        config: { options: statusOptions() },
        afterId: undefined,
      })
      config.groupByColumnId = createdColumn.id
    }
  }
  if (input.type === 'CALENDAR' && !columns.some((c) => c.id === config.dateColumnId && c.type === 'DATE')) {
    const date = columns.find((c) => c.type === 'DATE')
    if (date) config.dateColumnId = date.id
    else {
      createdColumn = await insertColumn(tx, a.database.id, {
        type: 'DATE',
        name: defaultColumnName(th.database.defaults.date, names),
        config: {},
        afterId: undefined,
      })
      config.dateColumnId = createdColumn.id
    }
  }
  const sameType = views.filter((v) => v.type === input.type).length
  const name = input.name ?? th.database.views.defaultName(th.database.views[input.type], sameType + 1)
  const position = await viewKey(tx, views, undefined)
  const [view] = await tx
    .insert(databaseViews)
    .values({ databaseId: a.database.id, type: input.type, name, config: asJson(config), position })
    .returning()
  await logDb(tx, user, a, 'create', th.audit.dbViewCreated(a.database.title), {
    target: 'view',
    ids: [view!.id],
    type: input.type,
  })
  return { view: viewDTO(view!), ...(createdColumn ? { createdColumn: columnDTO(createdColumn) } : {}) }
}

/** Rename / config / move; version check; read-only viewers → 403 (FR-1406). */
export async function updateView(tx: Tx, user: SessionUser, input: UpdateDatabaseViewInput): Promise<ViewResult> {
  const a = await authz.requireDbView(tx, user, input.viewId, 'edit', { lock: true })
  const set: Partial<typeof databaseViews.$inferInsert> = {}
  if (input.name !== undefined) set.name = input.name
  if (input.config !== undefined) {
    const all = await dbRepo.listAllColumns(tx, a.database.id)
    assertConfigColumns(input.config, new Set(all.map((c) => c.id)))
    set.config = input.config
  }
  if (input.afterViewId !== undefined) {
    const siblings = (await dbRepo.listViews(tx, a.database.id)).filter((v) => v.id !== a.view.id)
    set.position = await viewKey(tx, siblings, input.afterViewId)
  }
  const [updated] = await tx
    .update(databaseViews)
    .set({ ...set, version: sql`${databaseViews.version} + 1`, updatedAt: sql`now()` })
    .where(and(eq(databaseViews.id, a.view.id), eq(databaseViews.version, input.baseVersion)))
    .returning()
  if (!updated) {
    const cur = await dbRepo.getView(tx, a.view.id)
    if (!cur) throw new NotFoundError()
    throw conflict('view', viewDTO(cur))
  }
  await logDb(tx, user, a, 'update', th.audit.dbViewUpdated(a.database.title), {
    target: 'view',
    ids: [updated.id],
    versions: [updated.version],
  })
  return { view: viewDTO(updated) }
}

/** Soft delete with batch; the last live view → VALIDATION th.database.errors.lastView. */
export async function deleteView(
  tx: Tx,
  user: SessionUser,
  input: { viewId: string },
): Promise<DeleteBatchResult> {
  const a = await authz.requireDbView(tx, user, input.viewId, 'edit', { lock: true })
  if ((await dbRepo.listViews(tx, a.database.id)).length <= 1) throw invalid(E.lastView, 'viewId')
  const batch = randomUUID()
  await tx
    .update(databaseViews)
    .set({ deletedAt: sql`now()`, deletedBatch: batch })
    .where(eq(databaseViews.id, a.view.id))
  await logDb(tx, user, a, 'delete', th.audit.dbViewDeleted(a.database.title), {
    target: 'view',
    ids: [a.view.id],
    batch,
  })
  return { batch }
}

export async function restoreViewBatch(
  tx: Tx,
  user: SessionUser,
  input: { batch: string },
): Promise<RestoreViewBatchResult> {
  authz.requireUser(user)
  const list = await batchRows(tx, 'database_views', input.batch)
  const a = await requireBatch(tx, user, list)
  if ((await dbRepo.listViews(tx, a.database.id)).length + list.length > L.views) {
    throw invalid(E.limit.views(L.views), 'batch')
  }
  const restored = await tx
    .update(databaseViews)
    .set({ deletedAt: null, deletedBatch: null })
    .where(eq(databaseViews.deletedBatch, input.batch))
    .returning()
  restored.sort((x, y) => (x.position < y.position ? -1 : x.position > y.position ? 1 : x.id < y.id ? -1 : 1))
  await logDb(tx, user, a, 'restore', th.audit.dbViewRestored(a.database.title), {
    target: 'view',
    ...idsForAudit(restored.map((v) => v.id)),
    batch: input.batch,
  })
  return { views: restored.map(viewDTO) }
}

/**
 * M11-D9 / FR-1472: called by savePageContent (action + keepalive) for DOC/TASK owners after sanitising — detach the
 * page's databases whose block is gone, re-attach those whose block is back. Not audited separately. The caller has
 * already authorised `edit` on the page.
 */
export async function reconcileDetached(
  tx: Tx,
  pageId: string,
  content: unknown,
): Promise<{ detached: number; attached: number }> {
  const ids = [...collectDatabaseIds(content)]
  const detached = await tx
    .update(databases)
    .set({ detachedAt: sql`now()` })
    .where(
      and(
        eq(databases.pageId, pageId),
        isNull(databases.detachedAt),
        ...(ids.length > 0 ? [notInArray(databases.id, ids)] : []),
      ),
    )
    .returning({ id: databases.id })
  const attached =
    ids.length === 0
      ? []
      : await tx
          .update(databases)
          .set({ detachedAt: null })
          .where(and(eq(databases.pageId, pageId), inArray(databases.id, ids), sql`${databases.detachedAt} is not null`))
          .returning({ id: databases.id })
  return { detached: detached.length, attached: attached.length }
}
