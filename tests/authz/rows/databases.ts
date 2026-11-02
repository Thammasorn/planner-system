// PERM-24 (ดูฐานข้อมูลในหน้า = ดูหน้าเจ้าของ), PERM-25 (แก้ฐานข้อมูลในหน้า = แก้หน้าเจ้าของ; lease ไม่เกี่ยว FR-1462;
// wiki ล็อก → worker 403; archive → 403), PERM-26 (คัดลอก = ดูต้นทาง + แก้ปลายทาง), FR-1464 (one 404 for foreign / missing /
// invisible), FR-1472 (detach on save), FR-1470 (duplicatePage deep copy), FR-1474 (search group) and FR-1475 (limits) —
// SPEC §3.2, §4.14.7–§4.14.8, §5.11, §7.9; plan/m11-database-views.md §7.2 (keys DB-*, ROW-*, COL-*, VIEW-*, PG-*-DB,
// SR-DB-*), written from SPEC before S2's services exist (PLAN §4.1). World 'databases' (S0.17); "P-audit" = exactly one
// `database` audit row with project_id = P (the matrix checks it), "Wk-audit" = project null.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { expect } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { DatabaseResponse } from '@/lib/contracts/databases'
import type { SearchAllResponse } from '@/lib/contracts/search'
import {
  changeDatabaseColumnType,
  copyDatabase,
  createDatabase,
  createDatabaseColumn,
  createDatabaseRows,
  createDatabaseView,
  deleteDatabaseColumn,
  deleteDatabaseRows,
  deleteDatabaseView,
  duplicateDatabaseColumn,
  renameDatabase,
  restoreDatabaseColumnBatch,
  restoreDatabaseRowBatch,
  restoreDatabaseViewBatch,
  revertDatabaseColumnType,
  updateDatabaseColumn,
  updateDatabaseRow,
  updateDatabaseView,
} from '@/server/actions/databases'
import { duplicatePage, savePageContent } from '@/server/actions/pages'
import { db } from '@/server/db/client'
import { databaseColumns, databaseRows, pageLocks, pages } from '@/server/db/schema'
import { deactivateUser, makeDatabase, makeUser, type TestUser } from '../../helpers/factories'
import type { World } from '../../helpers/world'
import { assertNoLeak } from '../_support/leak'
import { defineRow, type AuthzRow } from '../types'
import { currentVersion, para } from './_m4'
import { searchAllGet, searchQ } from './_m10'
import {
  ALL,
  ARCH_WRITE,
  attachedOf,
  auditDbA,
  auditDbP,
  auditDbQ,
  auditDbWiki,
  auditPageP,
  databaseBlock,
  databaseById,
  DB_LIMITS,
  DB_ROUTE,
  dbColumnById,
  dbGet,
  dbRowById,
  dbViewById,
  DBS,
  each,
  fillColumnsTo,
  fillDatabasesTo,
  fillRowsTo,
  fillViewsTo,
  liveColumns,
  liveRows,
  liveViews,
  MGR,
  pDbSecrets,
  PROJ,
  PROJ_400,
  PROJ_409,
  Q_ONLY,
} from './_m11'

const isOutsider = (w: World, actor: TestUser): boolean => actor.id === w.outsider.id

/** 200 → the DatabaseResponse identity + canEdit (M11-D19); other statuses pass through. */
async function checkedDb(
  res: Response,
  want: { id: string; pageId: string; canEdit: boolean | ((body: DatabaseResponse) => void) },
): Promise<Response> {
  if (res.status === 200) {
    const body = (await res.clone().json()) as DatabaseResponse
    expect(body).toMatchObject({ id: want.id, pageId: want.pageId })
    if (typeof want.canEdit === 'function') want.canEdit(body)
    else expect(body.canEdit).toBe(want.canEdit)
  }
  return res
}

/** canEdit of a locked wiki database: the manager only (FR-510 / FR-1460). */
const managerOnly =
  (w: World, actor: TestUser) =>
  (body: DatabaseResponse): void =>
    expect(body.canEdit).toBe(actor.id === w.manager.id)

/** 404 bodies must never carry a P / A database secret (FR-1464). */
async function noSecretOn404(w: World, res: Response): Promise<Response> {
  if (res.status === 404) assertNoLeak(await res.clone().json(), pDbSecrets(w))
  return res
}

const rowVersion = async (id: string): Promise<number> => (await dbRowById(id)).version
const colVersion = async (id: string): Promise<number> => (await dbColumnById(id)).version
const viewVersion = async (id: string): Promise<number> => (await dbViewById(id)).version

/** The first live column of a type (dbA / dbWikiProt are built by makeDatabase: ชื่อ · สถานะ · วันที่). */
async function columnOf(databaseId: string, type: 'TITLE' | 'SELECT' | 'DATE'): Promise<string> {
  const c = (await liveColumns(databaseId)).find((x) => x.type === type)
  if (!c) throw new Error(`no ${type} column in ${databaseId}`)
  return c.id
}
async function firstView(databaseId: string): Promise<{ id: string; version: number }> {
  const [v] = await liveViews(databaseId)
  if (!v) throw new Error(`no view in ${databaseId}`)
  return v
}

/** Allowed copies: a new attached database on the target page with the source's title and a different id. */
async function checkedCopy(
  r: ActionResult<{ databaseId: string }>,
  want: { sourceId: string; targetPageId: string },
): Promise<ActionResult<{ databaseId: string }>> {
  if (r.ok) {
    expect(r.databaseId).not.toBe(want.sourceId)
    const [source, copy] = [await databaseById(want.sourceId), await databaseById(r.databaseId)]
    expect(copy).toMatchObject({ pageId: want.targetPageId, title: source.title, detachedAt: null, version: 1 })
    // FR-1470/1471 deep copy: the same number of live rows, columns and views under new ids
    const [sr, cr] = [await liveRows(source.id), await liveRows(copy.id)]
    expect(cr).toHaveLength(sr.length)
    expect(cr.map((x) => x.id).filter((id) => sr.some((s) => s.id === id))).toEqual([])
    expect((await liveColumns(copy.id)).length).toBe((await liveColumns(source.id)).length)
    expect((await liveViews(copy.id)).length).toBe((await liveViews(source.id)).length)
  }
  return r
}

export const rows: AuthzRow[] = [
  // ── GET /api/pages/[id]/databases/[databaseId] (PERM-24, FR-1464, M11-D7) ─────────────────────────────────────
  defineRow({
    id: 'DB-GET',
    spec: 'PERM-24 §3.2 ดูฐานข้อมูลในหน้า — GET /api/pages/{pPage}/databases/{dbP}: live columns/views/rows only, people = 4 fields',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const d = w.databases
      return checkedDb(await dbGet(w.pages.pPage.id, d.dbP.id), {
        id: d.dbP.id,
        pageId: w.pages.pPage.id,
        canEdit: (body) => {
          expect(body.canEdit).toBe(true)
          expect(body.title).toBe('ฐานข้อมูล P-ลับ20')
          // M11-D19: soft-deleted column / view / row are not sent
          const cols = body.columns.map((c) => c.id)
          expect(cols).toHaveLength(9)
          expect(cols[0]).toBe(d.dbPColumns.title.id)
          expect(cols).not.toContain(d.dbPColumns.deleted.id)
          expect(body.views.map((v) => v.id)).toEqual([d.dbPViews.table.id, d.dbPViews.kanban.id, d.dbPViews.calendar.id])
          expect(body.rows.map((r) => r.id)).toEqual([d.pRow1.id, d.pRow2.id, d.pRow3.id])
          expect(body.rows.find((r) => r.id === d.pRow1.id)?.hasBody).toBe(true)
          expect(body.rows.find((r) => r.id === d.pRow2.id)?.hasBody).toBe(false)
          // BR-91: numbers stay strings; §3.3: people carry exactly name / nickname / color / deactivated
          expect(body.rows[0]!.cells[d.dbPColumns.number.id]).toBe('1234.5')
          expect(Object.keys(body.people)).toEqual(expect.arrayContaining([w.member.id, w.manager.id]))
          for (const p of Object.values(body.people))
            expect(Object.keys(p).sort()).toEqual(['color', 'deactivated', 'name', 'nickname'])
        },
      })
    },
  }),
  defineRow({
    id: 'DB-GET-ARCH',
    spec: 'PERM-24 + X42 — GET … {aPage}/databases/{dbA} of archived A: readable, canEdit false',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: async (w) =>
      checkedDb(await dbGet(w.pages.aPage.id, w.databases.dbA.id), {
        id: w.databases.dbA.id,
        pageId: w.pages.aPage.id,
        canEdit: false,
      }),
  }),
  defineRow({
    id: 'DB-GET-WIKI',
    spec: 'PERM-24 §3.2 (wiki: every user) — GET … {wiki}/databases/{dbWiki}',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async (w) =>
      checkedDb(await dbGet(w.pages.wiki.id, w.databases.dbWiki.id), {
        id: w.databases.dbWiki.id,
        pageId: w.pages.wiki.id,
        canEdit: true,
      }),
  }),
  defineRow({
    id: 'DB-GET-WIKIPROT',
    spec: 'PERM-24 + FR-510 / FR-1460 — locked wiki database readable by all; canEdit only for the manager',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async (w, _ctx, actor) =>
      checkedDb(await dbGet(w.pages.wikiProtected.id, w.databases.dbWikiProt.id), {
        id: w.databases.dbWikiProt.id,
        pageId: w.pages.wikiProtected.id,
        canEdit: managerOnly(w, actor),
      }),
  }),
  defineRow({
    id: 'DB-GET-TASK',
    spec: 'PERM-24 + FR-680 — a database in a task body: GET … {pLeafBody}/databases/{dbTask} (= the task’s view permission)',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: async (w) =>
      checkedDb(await dbGet(w.taskBodies.pLeafBody.id, w.databases.dbTask.id), {
        id: w.databases.dbTask.id,
        pageId: w.taskBodies.pLeafBody.id,
        canEdit: true,
      }),
  }),
  defineRow({
    id: 'DB-GET-DETACHED',
    spec: 'FR-1472 — a detached database is still served through its owner page (Cmd+Z brings the block back)',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: async (w) =>
      checkedDb(await dbGet(w.pages.pPage.id, w.databases.dbPDetached.id), {
        id: w.databases.dbPDetached.id,
        pageId: w.pages.pPage.id,
        canEdit: true,
      }),
  }),
  defineRow({
    id: 'DB-GET-WRONGPAGE',
    spec: 'FR-1402 / FR-1464 — … {qPage}/databases/{dbP}: not this page’s database → 404 for everyone, body without secrets',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: async (w) => noSecretOn404(w, await dbGet(w.pages.qPage.id, w.databases.dbP.id)),
  }),
  defineRow({
    id: 'DB-GET-DELETEDPAGE',
    spec: 'FR-1473 — the database of a deleted page is a 404 for everyone',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: (w) => dbGet(w.deletedPages.pDeleted.id, w.databases.dbDeletedPage.id),
  }),
  defineRow({
    id: 'DB-GET-MISSING',
    spec: 'X86 / FR-1464 — … {pPage}/databases/{random uuid} → 404',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: (w) => dbGet(w.pages.pPage.id, randomUUID()),
  }),
  defineRow({
    id: 'DB-GET-BAD',
    spec: 'X86 — … {pPage}/databases/not-a-uuid → 404 (never a 22P02 → 500)',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: (w) => dbGet(w.pages.pPage.id, 'not-a-uuid'),
  }),
  defineRow({
    id: 'DB-GET-BADPAGE',
    spec: 'X86 — GET /api/pages/not-a-uuid/databases/{dbP} → 404',
    action: DB_ROUTE,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: (w) => dbGet('not-a-uuid', w.databases.dbP.id),
  }),

  // ── createDatabase (PERM-25, FR-1404, M11-D10) ────────────────────────────────────────────────────────────────
  defineRow({
    id: 'DB-CREATE',
    spec: 'PERM-25 §3.2 แก้ฐานข้อมูลในหน้า (สร้าง) — createDatabase({ pPage, TABLE }): ชื่อ · สถานะ · วันที่, 0 rows, attached',
    action: 'createDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await createDatabase({ pageId: w.pages.pPage.id, view: 'TABLE' })
      if (r.ok) {
        expect(await databaseById(r.databaseId)).toMatchObject({ pageId: w.pages.pPage.id, detachedAt: null })
        expect((await liveColumns(r.databaseId)).map((c) => c.type)).toEqual(['TITLE', 'SELECT', 'DATE'])
        expect((await liveViews(r.databaseId)).map((v) => v.type)).toEqual(['TABLE'])
        expect(await liveRows(r.databaseId)).toEqual([])
      }
      return r
    },
  }),
  defineRow({
    id: 'DB-CREATE-ARCH',
    spec: 'PERM-25 + X42 — createDatabase on aPage (archived A) → 403',
    action: 'createDatabase',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    run: (w) => createDatabase({ pageId: w.pages.aPage.id, view: 'TABLE' }),
  }),
  defineRow({
    id: 'DB-CREATE-WIKI',
    spec: 'PERM-25 §3.2 (wiki: every user) — createDatabase({ wiki, KANBAN }) (audit project null)',
    action: 'createDatabase',
    mutates: true,
    audit: auditDbWiki,
    with: DBS,
    expect: ALL,
    run: async (w) => {
      const r = await createDatabase({ pageId: w.pages.wiki.id, view: 'KANBAN' })
      if (r.ok) {
        const [view] = await liveViews(r.databaseId)
        const status = (await liveColumns(r.databaseId)).find((c) => c.type === 'SELECT')
        expect(view).toMatchObject({ type: 'KANBAN', config: { groupByColumnId: status?.id } })
      }
      return r
    },
  }),
  defineRow({
    id: 'DB-CREATE-WIKIPROT',
    spec: 'PERM-25 + FR-510 — createDatabase on a locked wiki page: manager only, workers 403',
    action: 'createDatabase',
    mutates: true,
    audit: auditDbWiki,
    with: DBS,
    expect: MGR,
    run: (w) => createDatabase({ pageId: w.pages.wikiProtected.id, view: 'CALENDAR' }),
  }),
  defineRow({
    id: 'DB-CREATE-TASK',
    spec: 'PERM-25 + FR-680 / M11-D38 — createDatabase in a task body (pLeafBody, owner kind TASK)',
    action: 'createDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: (w) => createDatabase({ pageId: w.taskBodies.pLeafBody.id, view: 'TABLE' }),
  }),
  defineRow({
    id: 'DB-CREATE-ROWBODY',
    spec: 'M11-D38 / FR-1453 — no database inside a row body (pRowBody, kind DB_ROW) → 400 after authz (W 404)',
    action: 'createDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) => {
      const r = await createDatabase({ pageId: w.databases.pRowBody.id, view: 'TABLE' })
      expect(await attachedOf(w.databases.pRowBody.id)).toEqual([])
      return r
    },
  }),
  defineRow({
    id: 'DB-CREATE-LIMIT',
    spec: 'FR-1475 — a page with 20 attached databases (setup) → 400 (detached ones do not count)',
    action: 'createDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    setup: async (w) => fillDatabasesTo(w.pages.pPage.id, DB_LIMITS.databasesPerPage, w.manager),
    run: async (w) => {
      const r = await createDatabase({ pageId: w.pages.pPage.id, view: 'TABLE' })
      expect(await attachedOf(w.pages.pPage.id)).toHaveLength(DB_LIMITS.databasesPerPage)
      return r
    },
  }),
  defineRow({
    id: 'DB-CREATE-BAD',
    spec: '§7.9 zod — createDatabase({ pageId: "x" }) → 400 for everyone (before authz)',
    action: 'createDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: each('400'),
    run: () => createDatabase({ pageId: 'x', view: 'TABLE' }),
  }),
  defineRow({
    id: 'DB-CREATE-BAD-VIEW',
    spec: '§7.9 zod — createDatabase with a view type outside TABLE / KANBAN / CALENDAR → 400 for everyone',
    action: 'createDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: each('400'),
    run: (w) =>
      createDatabase({ pageId: w.pages.pPage.id, view: 'GALLERY' } as unknown as Parameters<typeof createDatabase>[0]),
  }),

  // ── copyDatabase (PERM-26, FR-1471, M11-D11/D12: view source → 404 · view target → 404 · edit target → 403) ──
  defineRow({
    id: 'DB-COPY',
    spec: 'PERM-26 §3.2 คัดลอกฐานข้อมูลไปหน้าอื่น — dbP (pPage) → pChild: deep copy, audit on the target',
    action: 'copyDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) =>
      checkedCopy(
        await copyDatabase({
          sourcePageId: w.pages.pPage.id,
          sourceDatabaseId: w.databases.dbP.id,
          targetPageId: w.pages.pChild.id,
        }),
        { sourceId: w.databases.dbP.id, targetPageId: w.pages.pChild.id },
      ),
  }),
  defineRow({
    id: 'DB-COPY-TO-ARCH',
    spec: 'PERM-26 + X42 — target aPage (archived A) → 403',
    action: 'copyDatabase',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    run: (w) =>
      copyDatabase({
        sourcePageId: w.pages.pPage.id,
        sourceDatabaseId: w.databases.dbP.id,
        targetPageId: w.pages.aPage.id,
      }),
  }),
  defineRow({
    id: 'DB-COPY-FROM-ARCH',
    spec: 'PERM-26 — source dbA (archived A is readable) → target pPage',
    action: 'copyDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) =>
      checkedCopy(
        await copyDatabase({
          sourcePageId: w.pages.aPage.id,
          sourceDatabaseId: w.databases.dbA.id,
          targetPageId: w.pages.pPage.id,
        }),
        { sourceId: w.databases.dbA.id, targetPageId: w.pages.pPage.id },
      ),
  }),
  defineRow({
    id: 'DB-COPY-TO-Q',
    spec: 'PERM-26 — dbP → qPage: only the manager sees both (L/Me cannot see Q, W cannot see P → 404); audit on Q',
    action: 'copyDatabase',
    mutates: true,
    audit: auditDbQ,
    with: DBS,
    expect: { M: 'allow', L: '404', Me: '404', W: '404' },
    run: async (w) =>
      checkedCopy(
        await copyDatabase({
          sourcePageId: w.pages.pPage.id,
          sourceDatabaseId: w.databases.dbP.id,
          targetPageId: w.pages.qPage.id,
        }),
        { sourceId: w.databases.dbP.id, targetPageId: w.pages.qPage.id },
      ),
  }),
  defineRow({
    id: 'DB-COPY-FROM-Q',
    spec: 'PERM-26 — dbQ → qPage: the outsider (member of Q) and the manager may; L/Me cannot see Q (404)',
    action: 'copyDatabase',
    mutates: true,
    audit: auditDbQ,
    with: DBS,
    expect: Q_ONLY,
    run: async (w) =>
      checkedCopy(
        await copyDatabase({
          sourcePageId: w.pages.qPage.id,
          sourceDatabaseId: w.databases.dbQ.id,
          targetPageId: w.pages.qPage.id,
        }),
        { sourceId: w.databases.dbQ.id, targetPageId: w.pages.qPage.id },
      ),
  }),
  defineRow({
    id: 'DB-COPY-MISMATCH',
    spec: 'M11-D12 / FR-1464 — sourcePageId pChild with dbP (not its page) → 404 for everyone, no secret in the body',
    action: 'copyDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: each('404'),
    run: async (w) => {
      const r = await copyDatabase({
        sourcePageId: w.pages.pChild.id,
        sourceDatabaseId: w.databases.dbP.id,
        targetPageId: w.pages.pChild.id,
      })
      assertNoLeak(r, pDbSecrets(w))
      return r
    },
  }),
  defineRow({
    id: 'DB-COPY-TO-WIKIPROT',
    spec: 'PERM-26 + FR-510 — dbP → locked wiki: manager only; L/Me 403 (target visible, not editable); W 404 (source)',
    action: 'copyDatabase',
    mutates: true,
    audit: auditDbWiki,
    with: DBS,
    expect: { M: 'allow', L: '403', Me: '403', W: '404' },
    run: (w) =>
      copyDatabase({
        sourcePageId: w.pages.pPage.id,
        sourceDatabaseId: w.databases.dbP.id,
        targetPageId: w.pages.wikiProtected.id,
      }),
  }),
  defineRow({
    id: 'DB-COPY-TO-ROWBODY',
    spec: 'M11-D38 — target pRowBody (kind DB_ROW) → 400 after authz (W 404)',
    action: 'copyDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: (w) =>
      copyDatabase({
        sourcePageId: w.pages.pPage.id,
        sourceDatabaseId: w.databases.dbP.id,
        targetPageId: w.databases.pRowBody.id,
      }),
  }),

  // ── renameDatabase (PERM-25, FR-1463) ─────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'DB-RENAME',
    spec: 'PERM-25 — renameDatabase({ dbP, baseVersion 1, title }) bumps version',
    action: 'renameDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await renameDatabase({ databaseId: w.databases.dbP.id, baseVersion: 1, title: 'ทะเบียนใหม่' })
      if (r.ok) {
        expect(r).toMatchObject({ databaseId: w.databases.dbP.id, title: 'ทะเบียนใหม่', version: 2 })
        expect((await databaseById(w.databases.dbP.id)).title).toBe('ทะเบียนใหม่')
      }
      return r
    },
  }),
  defineRow({
    id: 'DB-RENAME-STALE',
    spec: 'FR-1463 / M11-D14 — baseVersion 99 → VERSION_CONFLICT 409, title unchanged',
    action: 'renameDatabase',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_409,
    run: async (w) => {
      const r = await renameDatabase({ databaseId: w.databases.dbP.id, baseVersion: 99, title: 'ทับ' })
      expect((await databaseById(w.databases.dbP.id)).title).toBe('ฐานข้อมูล P-ลับ20')
      return r
    },
  }),
  defineRow({
    id: 'DB-RENAME-ARCH',
    spec: 'PERM-25 + X42 — renameDatabase(dbA) → 403',
    action: 'renameDatabase',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    run: (w) => renameDatabase({ databaseId: w.databases.dbA.id, baseVersion: 1, title: 'x' }),
  }),
  defineRow({
    id: 'DB-RENAME-WIKIPROT',
    spec: 'PERM-25 + FR-510 — renameDatabase(dbWikiProt): manager only',
    action: 'renameDatabase',
    mutates: true,
    audit: auditDbWiki,
    with: DBS,
    expect: MGR,
    run: (w) => renameDatabase({ databaseId: w.databases.dbWikiProt.id, baseVersion: 1, title: 'x' }),
  }),

  // ── rows (PERM-25, BR-90, FR-1462/1463/1475) ──────────────────────────────────────────────────────────────────
  defineRow({
    id: 'ROW-CREATE',
    spec: 'PERM-25 — createDatabaseRows({ dbP, [{ title: n }] }) (one audit row for the action)',
    action: 'createDatabaseRows',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await createDatabaseRows({ databaseId: w.databases.dbP.id, rows: [{ title: 'n' }] })
      if (r.ok) {
        expect(r.rows).toHaveLength(1)
        expect(r.rows[0]).toMatchObject({ title: 'n', version: 1, hasBody: false })
        expect(await liveRows(w.databases.dbP.id)).toHaveLength(4)
      }
      return r
    },
  }),
  defineRow({
    id: 'ROW-CREATE-51',
    spec: 'FR-1475 (≤ 50 rows per action) — 51 rows → 400; zod refuses the shape before authz, so W gets 400 too',
    action: 'createDatabaseRows',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: each('400'),
    run: (w) =>
      createDatabaseRows({
        databaseId: w.databases.dbP.id,
        rows: Array.from({ length: DB_LIMITS.rowsPerAction + 1 }, (_, i) => ({ title: `r${i}` })),
      }),
  }),
  defineRow({
    id: 'ROW-CREATE-FULL',
    spec: 'FR-1475 / AC-1412 — dbP at 1,000 live rows (setup) → row 1,001 is refused (400), count unchanged',
    action: 'createDatabaseRows',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    setup: (w) => fillRowsTo(w.databases.dbP.id, DB_LIMITS.rows, w.manager),
    run: async (w) => {
      const r = await createDatabaseRows({ databaseId: w.databases.dbP.id, rows: [{ title: 'เกิน' }] })
      expect(await liveRows(w.databases.dbP.id)).toHaveLength(DB_LIMITS.rows)
      return r
    },
  }),
  defineRow({
    id: 'ROW-CREATE-WIKI',
    spec: 'PERM-25 (wiki: every user) — createDatabaseRows on dbWiki (audit project null)',
    action: 'createDatabaseRows',
    mutates: true,
    audit: auditDbWiki,
    with: DBS,
    expect: ALL,
    run: (w) => createDatabaseRows({ databaseId: w.databases.dbWiki.id, rows: [{ title: 'แถวใหม่' }] }),
  }),
  defineRow({
    id: 'ROW-CREATE-ARCH',
    spec: 'PERM-25 + X42 — createDatabaseRows on dbA → 403',
    action: 'createDatabaseRows',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    run: (w) => createDatabaseRows({ databaseId: w.databases.dbA.id, rows: [{ title: 'x' }] }),
  }),
  defineRow({
    id: 'ROW-UPDATE',
    spec: 'PERM-25 — updateDatabaseRow({ pRow2, baseVersion, title, cells: สถานะ = เสร็จ }) merges only sent keys',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const d = w.databases
      const r = await updateDatabaseRow({
        rowId: d.pRow2.id,
        baseVersion: await rowVersion(d.pRow2.id),
        title: 'x',
        cells: { [d.dbPColumns.status.id]: d.dbPOptions.done, [d.dbPColumns.check.id]: true },
      })
      if (r.ok) {
        expect(r.row).toMatchObject({ id: d.pRow2.id, title: 'x', version: d.pRow2.version + 1 })
        expect((await dbRowById(d.pRow2.id)).cells).toEqual({
          [d.dbPColumns.status.id]: d.dbPOptions.done,
          [d.dbPColumns.check.id]: true,
        })
      }
      return r
    },
  }),
  defineRow({
    id: 'ROW-UPDATE-LEASED',
    spec: 'FR-1462 — while lead holds the pPage edit lease (setup), every editor still updates rows',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    setup: async (w) => {
      await db
        .insert(pageLocks)
        .values({ pageId: w.pages.pPage.id, userId: w.lead.id, expiresAt: new Date(Date.now() + 10 * 60_000) })
    },
    run: async (w) =>
      updateDatabaseRow({
        rowId: w.databases.pRow2.id,
        baseVersion: await rowVersion(w.databases.pRow2.id),
        title: 'แก้ระหว่างมีคนถือหน้า',
      }),
  }),
  defineRow({
    id: 'ROW-UPDATE-STALE',
    spec: 'FR-1463 / AC-1409 — baseVersion 99 → 409, nothing overwritten',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_409,
    run: async (w) => {
      const r = await updateDatabaseRow({ rowId: w.databases.pRow2.id, baseVersion: 99, title: 'ทับ' })
      expect((await dbRowById(w.databases.pRow2.id)).title).toBe('แถว P-2')
      return r
    },
  }),
  defineRow({
    id: 'ROW-UPDATE-BADTYPE',
    spec: 'BR-90 / BR-91 — NUMBER "1.0" (not canonical) → 400',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) =>
      updateDatabaseRow({
        rowId: w.databases.pRow2.id,
        baseVersion: await rowVersion(w.databases.pRow2.id),
        cells: { [w.databases.dbPColumns.number.id]: '1.0' },
      }),
  }),
  defineRow({
    id: 'ROW-UPDATE-BADTYPE-SELECT',
    spec: 'BR-90 — SELECT with an option id not in the column’s current options → 400',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) =>
      updateDatabaseRow({
        rowId: w.databases.pRow2.id,
        baseVersion: await rowVersion(w.databases.pRow2.id),
        cells: { [w.databases.dbPColumns.status.id]: randomUUID() },
      }),
  }),
  defineRow({
    id: 'ROW-UPDATE-BADTYPE-DATE',
    spec: 'BR-90 / BR-92 — DATE 2026-02-30 (no such day) → 400',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) =>
      updateDatabaseRow({
        rowId: w.databases.pRow2.id,
        baseVersion: await rowVersion(w.databases.pRow2.id),
        cells: { [w.databases.dbPColumns.date.id]: '2026-02-30' },
      }),
  }),
  defineRow({
    id: 'ROW-UPDATE-URL-JS',
    spec: 'FR-1410 / AC-1402 — URL javascript:alert(1) → 400, the stored link is unchanged',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) => {
      const d = w.databases
      const r = await updateDatabaseRow({
        rowId: d.pRow1.id,
        baseVersion: await rowVersion(d.pRow1.id),
        cells: { [d.dbPColumns.url.id]: 'javascript:alert(1)' },
      })
      expect((await dbRowById(d.pRow1.id)).cells[d.dbPColumns.url.id]).toBe('https://example.com/p')
      return r
    },
  }),
  defineRow({
    id: 'ROW-UPDATE-INACTIVE',
    spec: 'BR-90 / FR-1410 — PERSON adds a deactivated user (not already in the cell) → 400',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    setup: async () => {
      const former = await makeUser({ role: 'worker', name: 'Former DB', nickname: 'FormerDb' })
      await deactivateUser(former, '2026-09-01')
      return { former }
    },
    run: async (w, ctx) =>
      updateDatabaseRow({
        rowId: w.databases.pRow1.id,
        baseVersion: await rowVersion(w.databases.pRow1.id),
        cells: { [w.databases.dbPColumns.person.id]: [w.member.id, ctx.former.id] },
      }),
  }),
  defineRow({
    id: 'ROW-UPDATE-DELCOL',
    spec: 'BR-90 — a key of the soft-deleted column → 400 (its stored value is kept for restore)',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) => {
      const d = w.databases
      const r = await updateDatabaseRow({
        rowId: d.pRow1.id,
        baseVersion: await rowVersion(d.pRow1.id),
        cells: { [d.dbPColumns.deleted.id]: 'ใหม่' },
      })
      expect((await dbRowById(d.pRow1.id)).cells[d.dbPColumns.deleted.id]).toBe('ค่าในคอลัมน์ที่ลบ P')
      return r
    },
  }),
  defineRow({
    id: 'ROW-UPDATE-UNKNOWNCOL',
    spec: 'BR-90 — a key that is no column of this database → 400',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) =>
      updateDatabaseRow({
        rowId: w.databases.pRow2.id,
        baseVersion: await rowVersion(w.databases.pRow2.id),
        cells: { [randomUUID()]: 'x' },
      }),
  }),
  defineRow({
    id: 'ROW-UPDATE-ARCH',
    spec: 'PERM-25 + X42 — updateDatabaseRow(aRow) → 403',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    run: async (w) =>
      updateDatabaseRow({ rowId: w.databases.aRow.id, baseVersion: await rowVersion(w.databases.aRow.id), title: 'x' }),
  }),
  defineRow({
    id: 'ROW-UPDATE-WIKIPROT',
    spec: 'PERM-25 + FR-510 — updateDatabaseRow(wikiProtRow): manager only',
    action: 'updateDatabaseRow',
    mutates: true,
    audit: auditDbWiki,
    with: DBS,
    expect: MGR,
    run: async (w) =>
      updateDatabaseRow({
        rowId: w.databases.wikiProtRow.id,
        baseVersion: await rowVersion(w.databases.wikiProtRow.id),
        title: 'x',
      }),
  }),
  defineRow({
    id: 'ROW-DELETE',
    spec: 'PERM-25 + FR-1424 — deleteDatabaseRows([pRow2]) → soft delete with a batch',
    action: 'deleteDatabaseRows',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await deleteDatabaseRows({ rowIds: [w.databases.pRow2.id] })
      if (r.ok) expect(await dbRowById(w.databases.pRow2.id)).toMatchObject({ deletedBatch: r.batch })
      return r
    },
  }),
  defineRow({
    id: 'ROW-DELETE-BODY',
    spec: 'FR-1453 / M11-D17 — deleting pRow1 soft-deletes its body page in the same batch',
    action: 'deleteDatabaseRows',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await deleteDatabaseRows({ rowIds: [w.databases.pRow1.id] })
      if (r.ok) {
        const [body] = await db.select().from(pages).where(eq(pages.id, w.databases.pRowBody.id))
        expect(body).toMatchObject({ deletedBatch: r.batch })
      }
      return r
    },
  }),
  defineRow({
    id: 'ROW-DELETE-MIXED',
    spec: 'X41 — [pRow2, a row of dbQ] in one call → 404 for everyone, nothing deleted (all-or-nothing)',
    action: 'deleteDatabaseRows',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: each('404'),
    run: async (w) => {
      const r = await deleteDatabaseRows({ rowIds: [w.databases.pRow2.id, w.databases.qRow.id] })
      expect((await dbRowById(w.databases.pRow2.id)).deletedAt).toBeNull()
      expect((await dbRowById(w.databases.qRow.id)).deletedAt).toBeNull()
      return r
    },
  }),
  defineRow({
    id: 'ROW-DELETE-ARCH',
    spec: 'PERM-25 + X42 — deleteDatabaseRows([aRow]) → 403',
    action: 'deleteDatabaseRows',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    run: (w) => deleteDatabaseRows({ rowIds: [w.databases.aRow.id] }),
  }),
  defineRow({
    id: 'ROW-RESTORE',
    spec: 'PERM-25 + FR-1465 — restoreDatabaseRowBatch(dbRows): the row and its body come back',
    action: 'restoreDatabaseRowBatch',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await restoreDatabaseRowBatch({ batch: w.batches.dbRows })
      if (r.ok) {
        expect(r.rows.map((x) => x.id)).toEqual([w.databases.pRowDeleted.id])
        expect((await dbRowById(w.databases.pRowDeleted.id)).deletedAt).toBeNull()
      }
      return r
    },
  }),
  defineRow({
    id: 'ROW-RESTORE-UNKNOWN',
    spec: 'X41 — restoreDatabaseRowBatch(random batch) → 404 for everyone',
    action: 'restoreDatabaseRowBatch',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: each('404'),
    run: () => restoreDatabaseRowBatch({ batch: randomUUID() }),
  }),

  // ── columns (PERM-25, FR-1410…1416, BR-93) ───────────────────────────────────────────────────────────────────
  defineRow({
    id: 'COL-CREATE',
    spec: 'PERM-25 + FR-1411 — createDatabaseColumn({ dbP, TEXT }) gets a default name',
    action: 'createDatabaseColumn',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await createDatabaseColumn({ databaseId: w.databases.dbP.id, type: 'TEXT' })
      if (r.ok) {
        expect(r.column.type).toBe('TEXT')
        expect(r.column.name.length).toBeGreaterThan(0)
      }
      return r
    },
  }),
  defineRow({
    id: 'COL-UPDATE',
    spec: 'PERM-25 + FR-1412 — updateDatabaseColumn({ text, baseVersion, name })',
    action: 'updateDatabaseColumn',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const id = w.databases.dbPColumns.text.id
      const r = await updateDatabaseColumn({ columnId: id, baseVersion: await colVersion(id), name: 'หมายเหตุ' })
      if (r.ok) expect(r.column).toMatchObject({ id, name: 'หมายเหตุ', version: 2 })
      return r
    },
  }),
  defineRow({
    id: 'COL-UPDATE-STALE',
    spec: 'FR-1463 — updateDatabaseColumn with baseVersion 99 → 409',
    action: 'updateDatabaseColumn',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_409,
    run: (w) => updateDatabaseColumn({ columnId: w.databases.dbPColumns.text.id, baseVersion: 99, name: 'ทับ' }),
  }),
  defineRow({
    id: 'COL-DUP',
    spec: 'PERM-25 + FR-1412 — duplicateDatabaseColumn(text) copies the values',
    action: 'duplicateDatabaseColumn',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await duplicateDatabaseColumn({ columnId: w.databases.dbPColumns.text.id })
      if (r.ok) {
        expect(r.column.type).toBe('TEXT')
        expect((await dbRowById(w.databases.pRow1.id)).cells[r.column.id]).toBe('ค่าเซลล์ P-ลับ28')
      }
      return r
    },
  }),
  defineRow({
    id: 'COL-LIMIT',
    spec: 'FR-1475 — dbP at 30 live columns (setup, TITLE included) → 400',
    action: 'createDatabaseColumn',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    setup: (w) => fillColumnsTo(w.databases.dbP.id, DB_LIMITS.columns),
    run: async (w) => {
      const r = await createDatabaseColumn({ databaseId: w.databases.dbP.id, type: 'TEXT' })
      expect(await liveColumns(w.databases.dbP.id)).toHaveLength(DB_LIMITS.columns)
      return r
    },
  }),
  defineRow({
    id: 'COL-TYPE',
    spec: 'PERM-25 + FR-1414 / BR-93 — changeDatabaseColumnType(ข้อความ → NUMBER): converts, returns previous values',
    action: 'changeDatabaseColumnType',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const d = w.databases
      const id = d.dbPColumns.text.id
      const r = await changeDatabaseColumnType({ columnId: id, baseVersion: await colVersion(id), type: 'NUMBER' })
      if (r.ok) {
        expect(r.column).toMatchObject({ id, type: 'NUMBER' })
        expect(r.previous).toMatchObject({ type: 'TEXT', values: { [d.pRow1.id]: 'ค่าเซลล์ P-ลับ28' } })
        // 'ค่าเซลล์ P-ลับ28' is no number → empty (BR-93)
        expect((await dbRowById(d.pRow1.id)).cells[id]).toBeUndefined()
      }
      return r
    },
  }),
  defineRow({
    id: 'COL-TYPE-TITLE',
    spec: 'BR-93 / FR-1410 — the TITLE column cannot change type → 400',
    action: 'changeDatabaseColumnType',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) => {
      const id = w.databases.dbPColumns.title.id
      return changeDatabaseColumnType({ columnId: id, baseVersion: await colVersion(id), type: 'TEXT' })
    },
  }),
  defineRow({
    id: 'COL-REVERT',
    spec: 'PERM-25 + FR-1414 / M11-D16 — revertDatabaseColumnType(previous) restores type, config and values',
    action: 'revertDatabaseColumnType',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    // A type change done at the DB level (independent of the service under test): ข้อความ → NUMBER at version 2,
    // pRow1's text value converted to empty.
    setup: async (w) => {
      const d = w.databases
      const id = d.dbPColumns.text.id
      await db
        .update(databaseColumns)
        .set({ type: 'NUMBER', config: { decimals: null, thousands: false }, version: 2 })
        .where(eq(databaseColumns.id, id))
      const { [id]: _gone, ...rest } = d.pRow1.cells
      await db.update(databaseRows).set({ cells: rest }).where(eq(databaseRows.id, d.pRow1.id))
      return { previous: { type: 'TEXT' as const, config: {}, columnVersion: 2, values: { [d.pRow1.id]: 'ค่าเซลล์ P-ลับ28' } } }
    },
    run: async (w, ctx) => {
      const d = w.databases
      const r = await revertDatabaseColumnType({ columnId: d.dbPColumns.text.id, previous: ctx.previous })
      if (r.ok) {
        expect(r.column).toMatchObject({ type: 'TEXT' })
        expect((await dbRowById(d.pRow1.id)).cells[d.dbPColumns.text.id]).toBe('ค่าเซลล์ P-ลับ28')
      }
      return r
    },
  }),
  defineRow({
    id: 'COL-REVERT-FORGED',
    spec: 'M11-D16 — previous with a value not in previous.config (forged SELECT option) → 400',
    action: 'revertDatabaseColumnType',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) => {
      const d = w.databases
      const id = d.dbPColumns.text.id
      return revertDatabaseColumnType({
        columnId: id,
        previous: {
          type: 'SELECT',
          config: { options: [{ id: randomUUID(), name: 'มีอยู่', color: 'gray' }] },
          columnVersion: await colVersion(id),
          values: { [d.pRow1.id]: randomUUID() },
        },
      })
    },
  }),
  defineRow({
    id: 'COL-DELETE',
    spec: 'PERM-25 + FR-1415 — deleteDatabaseColumn(ข้อความ): soft delete with a batch, cell values kept',
    action: 'deleteDatabaseColumn',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const d = w.databases
      const r = await deleteDatabaseColumn({ columnId: d.dbPColumns.text.id })
      if (r.ok) {
        expect(await dbColumnById(d.dbPColumns.text.id)).toMatchObject({ deletedBatch: r.batch })
        expect((await dbRowById(d.pRow1.id)).cells[d.dbPColumns.text.id]).toBe('ค่าเซลล์ P-ลับ28')
      }
      return r
    },
  }),
  defineRow({
    id: 'COL-DELETE-TITLE',
    spec: 'FR-1410 / M11-D17 — the TITLE column cannot be deleted → 400',
    action: 'deleteDatabaseColumn',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: (w) => deleteDatabaseColumn({ columnId: w.databases.dbPColumns.title.id }),
  }),
  defineRow({
    id: 'COL-RESTORE',
    spec: 'PERM-25 + FR-1415 — restoreDatabaseColumnBatch(dbColumn) brings ลบแล้ว back',
    action: 'restoreDatabaseColumnBatch',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await restoreDatabaseColumnBatch({ batch: w.batches.dbColumn })
      if (r.ok) expect(r.columns.map((c) => c.id)).toEqual([w.databases.dbPColumns.deleted.id])
      return r
    },
  }),
  defineRow({
    id: 'COL-ARCH',
    spec: 'PERM-25 + X42 — createDatabaseColumn on dbA → 403',
    action: 'createDatabaseColumn',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    run: (w) => createDatabaseColumn({ databaseId: w.databases.dbA.id, type: 'TEXT' }),
  }),
  defineRow({
    id: 'COL-ARCH-UPDATE',
    spec: 'PERM-25 + X42 — updateDatabaseColumn on a dbA column → 403',
    action: 'updateDatabaseColumn',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    setup: async (w) => ({ columnId: await columnOf(w.databases.dbA.id, 'SELECT') }),
    run: async (_w, ctx) =>
      updateDatabaseColumn({ columnId: ctx.columnId, baseVersion: await colVersion(ctx.columnId), name: 'x' }),
  }),
  defineRow({
    id: 'COL-ARCH-DELETE',
    spec: 'PERM-25 + X42 — deleteDatabaseColumn on a dbA column → 403',
    action: 'deleteDatabaseColumn',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    setup: async (w) => ({ columnId: await columnOf(w.databases.dbA.id, 'DATE') }),
    run: (_w, ctx) => deleteDatabaseColumn({ columnId: ctx.columnId }),
  }),
  defineRow({
    id: 'COL-WIKIPROT',
    spec: 'PERM-25 + FR-510 — changeDatabaseColumnType on a locked wiki column: manager only',
    action: 'changeDatabaseColumnType',
    mutates: true,
    audit: auditDbWiki,
    with: DBS,
    expect: MGR,
    setup: async (w) => ({ columnId: await columnOf(w.databases.dbWikiProt.id, 'DATE') }),
    run: async (_w, ctx) =>
      changeDatabaseColumnType({ columnId: ctx.columnId, baseVersion: await colVersion(ctx.columnId), type: 'TEXT' }),
  }),

  // ── views (PERM-25, FR-1405/1406, BR-94…97) ──────────────────────────────────────────────────────────────────
  defineRow({
    id: 'VIEW-CREATE',
    spec: 'PERM-25 + FR-1405 — createDatabaseView({ dbP, KANBAN })',
    action: 'createDatabaseView',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await createDatabaseView({ databaseId: w.databases.dbP.id, type: 'KANBAN' })
      if (r.ok) expect(r.view.type).toBe('KANBAN')
      return r
    },
  }),
  defineRow({
    id: 'VIEW-UPDATE',
    spec: 'PERM-25 + FR-1406 — updateDatabaseView({ table, baseVersion, config: hide ลิงก์ })',
    action: 'updateDatabaseView',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const d = w.databases
      const id = d.dbPViews.table.id
      const r = await updateDatabaseView({
        viewId: id,
        baseVersion: await viewVersion(id),
        config: { hiddenColumnIds: [d.dbPColumns.url.id], columnWidths: { [d.dbPColumns.title.id]: 320 } },
      })
      if (r.ok) expect(r.view.config).toMatchObject({ hiddenColumnIds: [d.dbPColumns.url.id] })
      return r
    },
  }),
  defineRow({
    id: 'VIEW-UPDATE-STALE',
    spec: 'FR-1463 — updateDatabaseView with baseVersion 99 → 409',
    action: 'updateDatabaseView',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_409,
    run: (w) => updateDatabaseView({ viewId: w.databases.dbPViews.table.id, baseVersion: 99, name: 'ทับ' }),
  }),
  defineRow({
    id: 'VIEW-UPDATE-WIKIPROT',
    spec: 'FR-1406 + FR-510 — view settings of a locked wiki database: manager only (workers 403)',
    action: 'updateDatabaseView',
    mutates: true,
    audit: auditDbWiki,
    with: DBS,
    expect: MGR,
    setup: async (w) => ({ view: await firstView(w.databases.dbWikiProt.id) }),
    run: (_w, ctx) =>
      updateDatabaseView({ viewId: ctx.view.id, baseVersion: ctx.view.version, config: { hiddenColumnIds: [] } }),
  }),
  defineRow({
    id: 'VIEW-UPDATE-BADCOL',
    spec: '§7.9 — a sort on a column id that is not in this database → 400',
    action: 'updateDatabaseView',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) => {
      const id = w.databases.dbPViews.table.id
      return updateDatabaseView({
        viewId: id,
        baseVersion: await viewVersion(id),
        config: { sorts: [{ columnId: randomUUID(), dir: 'ASC' }] },
      })
    },
  }),
  defineRow({
    id: 'VIEW-UPDATE-ARCH',
    spec: 'PERM-25 + X42 — updateDatabaseView on dbA → 403',
    action: 'updateDatabaseView',
    mutates: true,
    audit: auditDbA,
    with: DBS,
    expect: ARCH_WRITE,
    setup: async (w) => ({ view: await firstView(w.databases.dbA.id) }),
    run: (_w, ctx) => updateDatabaseView({ viewId: ctx.view.id, baseVersion: ctx.view.version, name: 'x' }),
  }),
  defineRow({
    id: 'VIEW-DELETE',
    spec: 'PERM-25 + FR-1405 — deleteDatabaseView(ปฏิทิน) → batch',
    action: 'deleteDatabaseView',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await deleteDatabaseView({ viewId: w.databases.dbPViews.calendar.id })
      if (r.ok) expect(await dbViewById(w.databases.dbPViews.calendar.id)).toMatchObject({ deletedBatch: r.batch })
      return r
    },
  }),
  defineRow({
    id: 'VIEW-DELETE-LAST',
    spec: 'FR-1405 / AC-1407 — the last live view of a database (setup: a one-view database on pPage) → 400',
    action: 'deleteDatabaseView',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    setup: async (w) => {
      const made = await makeDatabase({ page: w.pages.pPage, title: 'มุมมองเดียว', createdBy: w.manager })
      return { viewId: Object.values(made.views)[0]!.id }
    },
    run: async (_w, ctx) => {
      const r = await deleteDatabaseView({ viewId: ctx.viewId })
      expect((await dbViewById(ctx.viewId)).deletedAt).toBeNull()
      return r
    },
  }),
  defineRow({
    id: 'VIEW-LIMIT',
    spec: 'FR-1475 — dbP at 10 live views (setup) → 400',
    action: 'createDatabaseView',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ_400,
    setup: (w) => fillViewsTo(w.databases.dbP.id, DB_LIMITS.views),
    run: (w) => createDatabaseView({ databaseId: w.databases.dbP.id, type: 'TABLE' }),
  }),
  defineRow({
    id: 'VIEW-RESTORE',
    spec: 'PERM-25 + FR-1465 — restoreDatabaseViewBatch(dbView)',
    action: 'restoreDatabaseViewBatch',
    mutates: true,
    audit: auditDbP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await restoreDatabaseViewBatch({ batch: w.batches.dbView })
      if (r.ok) expect(r.views.map((v) => v.id)).toEqual([w.databases.dbPViews.deleted.id])
      return r
    },
  }),

  // ── page save / duplicate with databases (FR-1472, FR-1470) ─────────────────────────────────────────────────
  defineRow({
    id: 'PG-SAVE-DETACH',
    spec: 'FR-1472 / M11-D9 — savePageContent(pPage, content without dbP) detaches dbP (one page audit, no database row)',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await savePageContent({
        pageId: w.pages.pPage.id,
        baseVersion: await currentVersion(w.pages.pPage.id),
        content: para('ไม่มีบล็อกฐานข้อมูล'),
      })
      if (r.ok) expect((await databaseById(w.databases.dbP.id)).detachedAt).not.toBeNull()
      return r
    },
  }),
  defineRow({
    id: 'PG-SAVE-REATTACH',
    spec: 'FR-1472 / M11-D9 — saving content with the dbPDetached block re-attaches it (and detaches dbP, absent)',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await savePageContent({
        pageId: w.pages.pPage.id,
        baseVersion: await currentVersion(w.pages.pPage.id),
        content: [...para('ก่อนตาราง'), databaseBlock(w.databases.dbPDetached.id)],
      })
      if (r.ok) {
        expect((await databaseById(w.databases.dbPDetached.id)).detachedAt).toBeNull()
        expect((await databaseById(w.databases.dbP.id)).detachedAt).not.toBeNull()
      }
      return r
    },
  }),
  defineRow({
    id: 'PG-SAVE-FOREIGN-DB',
    spec: 'FR-1464 / AC-1410 / M11-D9 — a forged block with dbQ’s id saved on pPage: ignored (dbQ untouched, never re-owned)',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await savePageContent({
        pageId: w.pages.pPage.id,
        baseVersion: await currentVersion(w.pages.pPage.id),
        content: [databaseBlock(w.databases.dbP.id), databaseBlock(w.databases.dbQ.id)],
      })
      if (r.ok) {
        expect(await databaseById(w.databases.dbQ.id)).toMatchObject({ pageId: w.pages.qPage.id, detachedAt: null })
        expect((await databaseById(w.databases.dbP.id)).detachedAt).toBeNull()
      }
      return r
    },
  }),
  defineRow({
    id: 'PG-DUP-DB',
    spec: 'FR-1470 / PERM-26 — duplicatePage(pPage) deep-copies its attached databases (one page audit row)',
    action: 'duplicatePage',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await duplicatePage({ pageId: w.pages.pPage.id })
      if (r.ok) {
        const copies = await attachedOf(r.root.id)
        expect(copies.map((c) => c.title)).toEqual(['ฐานข้อมูล P-ลับ20'])
        expect(copies[0]!.id).not.toBe(w.databases.dbP.id)
        expect(await liveRows(copies[0]!.id)).toHaveLength(3)
        // the source is untouched
        expect(await liveRows(w.databases.dbP.id)).toHaveLength(3)
        expect((await databaseById(w.databases.dbP.id)).pageId).toBe(w.pages.pPage.id)
      }
      return r
    },
  }),

  // ── search group "ฐานข้อมูล" (FR-1474, M11-D28) ───────────────────────────────────────────────────────────────
  defineRow({
    id: 'SR-DB-ROW',
    spec: 'PERM-24 + FR-1474 — GET /api/search?q=P-ลับ21 → row-title hit for M/L/Me; W: no hit, no secret',
    action: 'GET /api/search',
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async (w, _ctx, actor) => {
      const res = await searchQ('P-ลับ21')
      if (res.status === 200) {
        const body = (await res.clone().json()) as SearchAllResponse
        const d = w.databases
        if (isOutsider(w, actor)) {
          expect(body.databases).toEqual([])
          assertNoLeak(body, pDbSecrets(w))
        } else
          expect(body.databases).toEqual([
            {
              kind: 'database',
              rowId: d.pRow1.id,
              databaseId: d.dbP.id,
              pageId: w.pages.pPage.id,
              rowTitle: 'แถว P-ลับ21',
              databaseTitle: 'ฐานข้อมูล P-ลับ20',
              pageTitle: w.pages.pPage.title,
              matchedIn: 'row',
              href: `/p/${w.pages.pPage.id}?db=${d.dbP.id}&row=${d.pRow1.id}`,
            },
          ])
      }
      return res
    },
  }),
  defineRow({
    id: 'SR-DB-TITLE',
    spec: 'PERM-24 + FR-1474 — q=P-ลับ20 → database-title hit (rowId null) for M/L/Me; W nothing',
    action: 'GET /api/search',
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async (w, _ctx, actor) => {
      const res = await searchQ('P-ลับ20')
      if (res.status === 200) {
        const body = (await res.clone().json()) as SearchAllResponse
        if (isOutsider(w, actor)) {
          expect(body.databases).toEqual([])
          assertNoLeak(body, pDbSecrets(w))
        } else {
          const hit = body.databases?.find((h) => h.databaseId === w.databases.dbP.id && h.rowId === null)
          expect(hit).toMatchObject({ matchedIn: 'database', rowTitle: null, pageId: w.pages.pPage.id })
          expect(hit?.href).toMatch(new RegExp(`^/p/${w.pages.pPage.id}\\?db=${w.databases.dbP.id}$`))
        }
      }
      return res
    },
  }),
  defineRow({
    id: 'SR-DB-BODY',
    spec: 'PERM-24 + FR-1474 — q=P-ลับ22 (only in pRowBody) → content hit; the DB_ROW page is never a page hit',
    action: 'GET /api/search',
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async (w, _ctx, actor) => {
      const res = await searchQ('P-ลับ22')
      if (res.status === 200) {
        const body = (await res.clone().json()) as SearchAllResponse
        expect(body.pages.map((p) => p.id)).not.toContain(w.databases.pRowBody.id)
        if (isOutsider(w, actor)) {
          expect(body.databases).toEqual([])
          assertNoLeak(body, pDbSecrets(w))
        } else
          expect(body.databases).toEqual([
            expect.objectContaining({ rowId: w.databases.pRow1.id, matchedIn: 'content' }),
          ])
      }
      return res
    },
  }),
  defineRow({
    id: 'SR-DB-WIKI',
    spec: 'PERM-24 (wiki) + FR-1474 — q=แถว W-25 → the wiki row for every user',
    action: 'GET /api/search',
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async (w) => {
      const res = await searchQ('แถว W-25')
      if (res.status === 200) {
        const body = (await res.clone().json()) as SearchAllResponse
        expect(body.databases).toEqual([
          expect.objectContaining({
            rowId: w.databases.wikiRow.id,
            databaseId: w.databases.dbWiki.id,
            pageId: w.pages.wiki.id,
            matchedIn: 'row',
          }),
        ])
      }
      return res
    },
  }),
  defineRow({
    id: 'SR-DB-CELL',
    spec: 'FR-1474 — cell values are never searched: q=ค่าเซลล์ P-ลับ28 → databases [] for everyone',
    action: 'GET /api/search',
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async () => {
      const res = await searchQ('ค่าเซลล์ P-ลับ28')
      if (res.status === 200) expect(((await res.clone().json()) as SearchAllResponse).databases).toEqual([])
      return res
    },
  }),
  defineRow({
    id: 'SR-DB-HIDDEN',
    spec: 'FR-1472 / FR-1473 — detached databases and databases of deleted pages are not found (even by the manager)',
    action: 'GET /api/search',
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async (w) => {
      let last: Response | undefined
      for (const q of ['ฐานข้อมูลหลุด P', 'ฐานข้อมูลในหน้าที่ลบ', 'แถวในหน้าที่ลบ', 'แถวลบแล้ว P']) {
        last = await searchQ(q)
        if (last.status !== 200) return last
        const body = (await last.clone().json()) as SearchAllResponse
        expect(body.databases, q).toEqual([])
        assertNoLeak(body.databases, [w.databases.dbPDetached.id, w.databases.dbDeletedPage.id])
      }
      return last!
    },
  }),
  defineRow({
    id: 'SR-DB-TITLEONLY',
    spec: 'X68 — mention suggestions ?titleOnly=1 → databases: [] for everyone',
    action: 'GET /api/search',
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async () => {
      const res = await searchAllGet(`q=${encodeURIComponent('P-ลับ21')}&titleOnly=1`)
      if (res.status === 200) expect(((await res.clone().json()) as SearchAllResponse).databases).toEqual([])
      return res
    },
  }),
]
