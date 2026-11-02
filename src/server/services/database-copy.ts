// src/server/services/database-copy.ts — the one deep-copy path for databases (FR-1470, FR-1471; plan/m11 S0.7
// signatures, S2 bodies; M11-D11/D12): live columns, views and rows with new ids everywhere (option ids included),
// row bodies as new DB_ROW pages, files copied across project/space. Used by copyDatabase (paste) and duplicatePage.
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { ViewConfig } from '@/domain/types'
import { th } from '@/i18n/th'
import type { CopyDatabaseResult } from '@/lib/contracts/databases'
import { extractContentText } from '@/lib/editor/content-text'
import type { CopyDatabaseInput } from '@/lib/schemas/databases'
import * as audit from '../audit'
import * as authz from '../authz'
import type { PageAccess } from '../authz'
import {
  databaseColumns,
  databaseRows,
  databases,
  databaseViews,
  files,
  pages,
  type DatabaseRow,
  type DbColumnRow,
  type PageRow,
} from '../db/schema'
import type { Tx } from '../db/types'
import { NotFoundError, ValidationError } from '../errors'
import * as dbRepo from '../repo/databases'
import type { SessionUser } from '../session'
import { getStorage } from '../storage'
import { lockOwnerForNewDatabase } from './databases'

export type CopyFilesMode = 'reuse' | 'copy'

const FILE_REF_RE = /\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g

/** Column / option id maps of one copy. */
interface IdMaps {
  columns: Map<string, string>
  options: Map<string, string>
}

const mapId = (m: ReadonlyMap<string, string>, id: string): string | undefined => m.get(id)

function remapCells(
  cells: Record<string, unknown>,
  cols: ReadonlyMap<string, DbColumnRow>,
  maps: IdMaps,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(cells)) {
    const col = cols.get(key)
    const next = mapId(maps.columns, key)
    if (!col || next === undefined) continue // deleted columns are not copied
    if (col.type === 'SELECT' && typeof value === 'string') {
      const o = mapId(maps.options, value)
      if (o !== undefined) out[next] = o
    } else if (col.type === 'MULTI_SELECT' && Array.isArray(value)) {
      const ids = value.flatMap((v) => (typeof v === 'string' && maps.options.has(v) ? [maps.options.get(v)!] : []))
      if (ids.length > 0) out[next] = ids
    } else out[next] = value
  }
  return out
}

function remapViewConfig(config: ViewConfig, maps: IdMaps): ViewConfig {
  const col = (id: string): string | undefined => maps.columns.get(id)
  const list = (ids: readonly string[] | undefined): string[] | undefined =>
    ids?.flatMap((id) => (col(id) ? [col(id)!] : []))
  const out: ViewConfig = { ...config }
  if (config.hiddenColumnIds) out.hiddenColumnIds = list(config.hiddenColumnIds)
  if (config.cardColumnIds) out.cardColumnIds = list(config.cardColumnIds)
  if (config.columnWidths) {
    out.columnWidths = Object.fromEntries(
      Object.entries(config.columnWidths).flatMap(([k, w]) => (col(k) ? [[col(k)!, w]] : [])),
    )
  }
  if (config.sorts) out.sorts = config.sorts.flatMap((s) => (col(s.columnId) ? [{ ...s, columnId: col(s.columnId)! }] : []))
  if (config.filters) {
    out.filters = config.filters.flatMap((f) => {
      const c = col(f.columnId)
      if (!c) return []
      const value = Array.isArray(f.value) ? f.value.map((v) => maps.options.get(v) ?? v) : f.value
      return [{ ...f, columnId: c, ...(value !== undefined ? { value } : {}) }]
    })
  }
  if (config.groupByColumnId !== undefined) {
    const c = col(config.groupByColumnId)
    if (c) out.groupByColumnId = c
    else delete out.groupByColumnId
  }
  if (config.dateColumnId !== undefined) {
    const c = col(config.dateColumnId)
    if (c) out.dateColumnId = c
    else delete out.dateColumnId
  }
  return out
}

/** Bytes of every file referenced by `content` copied to new storage keys + new `files` rows (M11-D11). */
async function copyFiles(
  tx: Tx,
  user: SessionUser,
  content: unknown[],
  target: { pageId: string; projectId: string | null },
  written: string[],
): Promise<unknown[]> {
  let json = JSON.stringify(content)
  const ids = [...new Set([...json.matchAll(FILE_REF_RE)].map((m) => m[1]!))]
  if (ids.length === 0) return content
  const found = await tx.select().from(files).where(inArray(files.id, ids))
  // M4-D17: a body may reference any file UUID; only files the copier can download are cloned. The rest keep
  // their original reference (still authorised by their own project), so no bytes cross a visibility boundary.
  const rows: typeof found = []
  for (const f of found) {
    try {
      await authz.requireFile(tx, user, f.id)
      rows.push(f)
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e
    }
  }
  const storage = getStorage()
  for (const f of rows) {
    const src = await storage.stream(f.storageKey)
    if (!src) continue
    const bytes = new Uint8Array(await new Response(src.body).arrayBuffer())
    const ext = f.storageKey.slice(f.storageKey.lastIndexOf('.') + 1)
    const key = `${f.storageKey.slice(0, 8)}${randomUUID()}.${ext}`
    await storage.put(key, bytes)
    written.push(key)
    const [copy] = await tx
      .insert(files)
      .values({
        storageKey: key,
        originalName: f.originalName,
        mime: f.mime,
        sizeBytes: f.sizeBytes,
        kind: f.kind,
        pageId: target.pageId,
        projectId: target.projectId,
        uploadedBy: user.id,
      })
      .returning({ id: files.id })
    json = json.split(`/api/files/${f.id}`).join(`/api/files/${copy!.id}`)
  }
  return JSON.parse(json) as unknown[]
}

/** The deep copy itself (no authz, no audit): `targetPage` is an authorised DOC / TASK page. */
async function copyInto(
  tx: Tx,
  user: SessionUser,
  source: DatabaseRow,
  targetPage: PageRow,
  opts: { files: CopyFilesMode; newId?: string; checkLimit: boolean },
): Promise<DatabaseRow> {
  if (opts.checkLimit) await lockOwnerForNewDatabase(tx, targetPage.id)
  const cols = await dbRepo.listColumns(tx, source.id)
  const views = await dbRepo.listViews(tx, source.id)
  const rows = await dbRepo.listRows(tx, source.id)
  const maps: IdMaps = { columns: new Map(), options: new Map() }
  for (const c of cols) {
    maps.columns.set(c.id, randomUUID())
    const options = (c.config as { options?: { id: string }[] }).options
    if (Array.isArray(options)) for (const o of options) maps.options.set(o.id, randomUUID())
  }
  const [database] = await tx
    .insert(databases)
    .values({
      ...(opts.newId ? { id: opts.newId } : {}),
      pageId: targetPage.id,
      title: source.title,
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning()
  const dbId = database!.id
  if (cols.length > 0) {
    await tx.insert(databaseColumns).values(
      cols.map((c) => {
        const options = (c.config as { options?: { id: string; name: string; color: string }[] }).options
        const config = Array.isArray(options)
          ? { ...c.config, options: options.map((o) => ({ ...o, id: maps.options.get(o.id)! })) }
          : c.config
        return { id: maps.columns.get(c.id)!, databaseId: dbId, type: c.type, name: c.name, config, position: c.position }
      }),
    )
  }
  if (views.length > 0) {
    await tx.insert(databaseViews).values(
      views.map((v) => ({
        databaseId: dbId,
        type: v.type,
        name: v.name,
        config: remapViewConfig(v.config as ViewConfig, maps) as Record<string, unknown>,
        position: v.position,
      })),
    )
  }
  const colById = new Map(cols.map((c) => [c.id, c]))
  const rowMap = new Map(rows.map((r) => [r.id, randomUUID()]))
  for (let i = 0; i < rows.length; i += 500) {
    await tx.insert(databaseRows).values(
      rows.slice(i, i + 500).map((r) => ({
        id: rowMap.get(r.id)!,
        databaseId: dbId,
        title: r.title,
        cells: remapCells(r.cells, colById, maps),
        position: r.position,
        createdBy: user.id,
        updatedBy: user.id,
      })),
    )
  }
  // row bodies → new DB_ROW pages in the target's space / project
  const bodies =
    rows.length === 0
      ? []
      : await tx
          .select()
          .from(pages)
          .where(and(inArray(pages.databaseRowId, [...rowMap.keys()]), isNull(pages.deletedAt)))
  const written: string[] = []
  try {
    for (const b of bodies) {
      const [page] = await tx
        .insert(pages)
        .values({
          space: targetPage.space,
          projectId: targetPage.projectId,
          kind: 'DB_ROW',
          databaseRowId: rowMap.get(b.databaseRowId!)!,
          title: '',
          content: b.content,
          contentText: b.contentText,
          position: 'a0',
          fullWidth: b.fullWidth,
          createdBy: user.id,
          updatedBy: user.id,
        })
        .returning({ id: pages.id })
      if (opts.files === 'copy') {
        // files rows reference the new page (FK), so the page exists before its files are copied
        const content = await copyFiles(tx, user, b.content, { pageId: page!.id, projectId: targetPage.projectId }, written)
        if (content !== b.content) {
          await tx
            .update(pages)
            .set({ content, contentText: extractContentText(content) })
            .where(eq(pages.id, page!.id))
        }
      }
    }
  } catch (e) {
    const storage = getStorage()
    for (const key of written) await storage.remove(key).catch(() => undefined) // best effort (M11-D11)
    throw e
  }
  return database!
}

/** Deep copy of `source` into the owner page of `target` (limit ≤ 20 attached re-checked); returns the new id. */
export async function copyDatabaseInto(
  tx: Tx,
  user: SessionUser,
  source: DatabaseRow,
  target: PageAccess,
  opts: { files: CopyFilesMode },
): Promise<{ databaseId: string }> {
  authz.requireUser(user)
  const d = await copyInto(tx, user, source, target.page, { files: opts.files, checkLimit: true })
  return { databaseId: d.id }
}

/** M11-D12 order: source view (404, mismatch included) → target view (404) → target edit (403) → DB_ROW target (400)
 *  → limit (400). Audit on the target (`after.copyOf`). */
export async function copyDatabase(tx: Tx, user: SessionUser, input: CopyDatabaseInput): Promise<CopyDatabaseResult> {
  const src = await authz.requireDatabase(tx, user, input.sourceDatabaseId, 'view', { pageId: input.sourcePageId })
  const seen = await authz.requirePage(tx, user, input.targetPageId, 'view') // invisible → 404
  const target = await authz.accessForPage(tx, user, seen.page, 'edit') // archived / locked (workers) → 403
  if (target.kind === 'DB_ROW') {
    const msg = th.database.errors.nesting
    throw new ValidationError({ targetPageId: [msg] }, msg)
  }
  const sameSpace =
    src.owner.page.space === target.page.space && src.owner.page.projectId === target.page.projectId
  const { databaseId } = await copyDatabaseInto(tx, user, src.database, target, { files: sameSpace ? 'reuse' : 'copy' })
  await audit.log(tx, user, {
    entity: 'database',
    entityId: databaseId,
    action: 'create',
    projectId: target.page.projectId,
    summary: th.audit.dbCopied(src.database.title),
    after: { target: 'database', ids: [databaseId], copyOf: src.database.id },
  })
  return { databaseId }
}

/** New database ids for the attached databases of `sourcePageIds` (duplicatePage remaps content before insert). */
export async function planPageDatabases(
  tx: Tx,
  sourcePageIds: readonly string[],
): Promise<Map<string, { source: DatabaseRow; newId: string }>> {
  const out = new Map<string, { source: DatabaseRow; newId: string }>()
  if (sourcePageIds.length === 0) return out
  const rows = await tx
    .select()
    .from(databases)
    .where(and(inArray(databases.pageId, [...sourcePageIds]), isNull(databases.detachedAt)))
  for (const d of rows) out.set(d.id, { source: d, newId: randomUUID() })
  return out
}

/** duplicatePage (FR-1470): every attached database of each copied DOC page, files reused (same space). Not audited
 *  separately (the page duplicate writes the one audit row). `plan` comes from planPageDatabases. */
export async function copyPageDatabases(
  tx: Tx,
  user: SessionUser,
  plan: ReadonlyMap<string, { source: DatabaseRow; newId: string }>,
  pageMap: ReadonlyMap<string, PageRow>,
): Promise<void> {
  authz.requireUser(user)
  for (const { source, newId } of plan.values()) {
    const targetPage = pageMap.get(source.pageId)
    if (!targetPage) continue
    await copyInto(tx, user, source, targetPage, { files: 'reuse', newId, checkLimit: false })
  }
}
