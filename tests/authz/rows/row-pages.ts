// PERM-24 (ดูเนื้อหาของแถว `/r/[rowId]` = ดูหน้าเจ้าของ), PERM-25 (แก้เนื้อหาของแถว = แก้หน้าเจ้าของ; archive → 403; wiki ล็อก →
// worker 403), PERM-16 page APIs addressed at a DB_ROW page (FR-682 / FR-1453 → 404 for everyone) and full width by rowId
// (FR-1602) — SPEC §3.2, §4.14.6 FR-1453, §7.7; plan/m11-database-views.md §7.2 (keys RP-*, RB-*, FW-ROW*), M11-D8.
// World 'databases' (S0.17): pRow1 has the body pRowBody (text 'เนื้อหาแถว P-ลับ22' + image pRowImage); pRow2 has none;
// aRow (archived A) has aRowBody; wikiRow has wikiRowBody; wikiProtRow (locked wiki) has none.
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { PageView, SetPageFullWidthResult } from '@/lib/contracts/pages'
import type { EnsureRowBodyResult, RowBodyView } from '@/lib/contracts/row-pages'
import {
  applyTemplate,
  createPage,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
  savePageContent,
  setPageCover,
  setPageFullWidth,
  setPageIcon,
  setPageProtected,
} from '@/server/actions/pages'
import { ensureRowBody } from '@/server/actions/row-pages'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { makeRowBody } from '../../helpers/factories'
import { PNG_1X1 } from '../../helpers/files'
import { loaderOutcome } from '../_support/loader'
import { defineRow, type AuthzRow } from '../types'
import { currentVersion, fileGet, keepalive, lockCall, pageGet, para, treeGet, upload } from './_m4'
import { pageRow, subpageContent } from './_m6_1'
import {
  ALL,
  ARCH_WRITE,
  auditFileA,
  auditFileP,
  auditPageA,
  auditPageP,
  auditPageWiki,
  databaseBlock,
  DBS,
  DBS_FW,
  each,
  MGR,
  PROJ,
  PROJ_400,
  ROW_BODY_ROUTE,
  ROW_PAGE_LOADER,
  rowBodiesOf,
  rowBodyGet,
} from './_m11'

/** Body assertions on a 200 `RowBodyView` (M11-D8). */
async function checkedBody(
  res: Response,
  want: { rowId: string; databaseId: string; ownerPageId: string; pageId: string | null; canEdit: boolean },
): Promise<Response> {
  if (res.status === 200) {
    const body = (await res.clone().json()) as RowBodyView
    expect(body).toMatchObject({ rowId: want.rowId, databaseId: want.databaseId, ownerPageId: want.ownerPageId })
    expect(body.page?.id ?? null).toBe(want.pageId)
    expect(body.can.edit).toBe(want.canEdit)
  }
  return res
}

/** Allowed full-width toggles report the new value and a change (M6.1-D15 / M11-D8). */
const checkedFullWidth = (r: ActionResult<SetPageFullWidthResult>): ActionResult<SetPageFullWidthResult> => {
  if (r.ok) expect(r).toMatchObject({ fullWidth: true, changed: true })
  return r
}

const ensure = (rowId: string): Promise<ActionResult<EnsureRowBodyResult>> => ensureRowBody({ rowId })

export const rows: AuthzRow[] = [
  // ── /r/[rowId] loader (PERM-24, X56/X57, X86) ─────────────────────────────────────────────────────────────────
  defineRow({
    id: 'RP-LOADER',
    spec: 'PERM-24 §3.2 เนื้อหาของแถว /r/[rowId] — /r/{pRow1} loader: row, database, owner (DOC pPage), body',
    action: ROW_PAGE_LOADER,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: (w) =>
      loaderOutcome(async (user) => {
        const d = w.databases
        const v = await services.rowPages.getRowPageView(db, user, d.pRow1.id)
        expect(v.row).toMatchObject({ id: d.pRow1.id, title: 'แถว P-ลับ21', databaseId: d.dbP.id })
        expect(v.database).toMatchObject({ id: d.dbP.id, title: 'ฐานข้อมูล P-ลับ20', ownerPageId: w.pages.pPage.id })
        expect(v.owner).toMatchObject({
          kind: 'DOC',
          pageId: w.pages.pPage.id,
          title: w.pages.pPage.title,
          href: `/p/${w.pages.pPage.id}`,
          projectId: w.P.id,
          archived: false,
        })
        expect(v.body.page?.id).toBe(d.pRowBody.id)
        expect(v.body.can.edit).toBe(true)
        return v
      }),
  }),
  defineRow({
    id: 'RP-LOADER-TASK',
    spec: 'PERM-24 + FR-680 — /r/{taskRow}: owner kind TASK, title = task name, href /t/<taskId>',
    action: ROW_PAGE_LOADER,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: (w) =>
      loaderOutcome(async (user) => {
        const v = await services.rowPages.getRowPageView(db, user, w.databases.taskRow.id)
        expect(v.owner).toMatchObject({
          kind: 'TASK',
          pageId: w.taskBodies.pLeafBody.id,
          title: w.tasks.pLeaf.name,
          href: `/t/${w.tasks.pLeaf.id}`,
        })
        expect(v.body.page).toBeNull()
        return v
      }),
  }),
  defineRow({
    id: 'RP-LOADER-WIKI',
    spec: 'PERM-24 (wiki: every user) — /r/{wikiRow}',
    action: ROW_PAGE_LOADER,
    mutates: false,
    with: DBS,
    expect: ALL,
    run: (w) =>
      loaderOutcome(async (user) => {
        const v = await services.rowPages.getRowPageView(db, user, w.databases.wikiRow.id)
        expect(v.owner).toMatchObject({ kind: 'DOC', pageId: w.pages.wiki.id, projectId: null })
        expect(v.body.page?.id).toBe(w.databases.wikiRowBody.id)
        return v
      }),
  }),
  defineRow({
    id: 'RP-LOADER-ARCH',
    spec: 'PERM-24 + X42 — /r/{aRow} of archived A is readable; the body is not editable',
    action: ROW_PAGE_LOADER,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: (w) =>
      loaderOutcome(async (user) => {
        const v = await services.rowPages.getRowPageView(db, user, w.databases.aRow.id)
        expect(v.owner).toMatchObject({ archived: true, projectId: w.A.id })
        expect(v.body.can.edit).toBe(false)
        return v
      }),
  }),
  defineRow({
    id: 'RP-LOADER-DELETED',
    spec: 'FR-1453 / X41 — /r of a soft-deleted row is a 404 for everyone',
    action: ROW_PAGE_LOADER,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: (w) => loaderOutcome((user) => services.rowPages.getRowPageView(db, user, w.databases.pRowDeleted.id)),
  }),
  defineRow({
    id: 'RP-LOADER-DELETEDPAGE',
    spec: 'FR-1473 — /r of a row whose owner page is deleted is a 404 for everyone',
    action: ROW_PAGE_LOADER,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: (w) => loaderOutcome((user) => services.rowPages.getRowPageView(db, user, w.databases.deletedPageRow.id)),
  }),
  defineRow({
    id: 'RP-LOADER-MISSING',
    spec: 'X86 — /r/{random uuid} is a 404 for everyone',
    action: ROW_PAGE_LOADER,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: () => loaderOutcome((user) => services.rowPages.getRowPageView(db, user, randomUUID())),
  }),
  defineRow({
    id: 'RP-LOADER-BAD',
    spec: 'X86 — /r/not-a-uuid is a 404 for everyone (never a 22P02 → 500)',
    action: ROW_PAGE_LOADER,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: () => loaderOutcome((user) => services.rowPages.getRowPageView(db, user, 'not-a-uuid')),
  }),

  // ── GET /api/database-rows/[id]/body (PERM-24, M11-D8) ───────────────────────────────────────────────────────
  defineRow({
    id: 'RB-GET',
    spec: 'PERM-24 — GET /api/database-rows/{pRow1}/body → the body page, can.edit',
    action: ROW_BODY_ROUTE,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: async (w) =>
      checkedBody(await rowBodyGet(w.databases.pRow1.id), {
        rowId: w.databases.pRow1.id,
        databaseId: w.databases.dbP.id,
        ownerPageId: w.pages.pPage.id,
        pageId: w.databases.pRowBody.id,
        canEdit: true,
      }),
  }),
  defineRow({
    id: 'RB-GET-NONE',
    spec: 'PERM-24 + FR-1453 — GET …/{pRow2}/body before the first edit → page null; reading never creates the page',
    action: ROW_BODY_ROUTE,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const res = await checkedBody(await rowBodyGet(w.databases.pRow2.id), {
        rowId: w.databases.pRow2.id,
        databaseId: w.databases.dbP.id,
        ownerPageId: w.pages.pPage.id,
        pageId: null,
        canEdit: true,
      })
      expect(await rowBodiesOf(w.databases.pRow2.id)).toEqual([])
      return res
    },
  }),
  defineRow({
    id: 'RB-GET-ARCH',
    spec: 'PERM-24 + X42 — GET …/{aRow}/body of archived A (can.edit false)',
    action: ROW_BODY_ROUTE,
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: async (w) =>
      checkedBody(await rowBodyGet(w.databases.aRow.id), {
        rowId: w.databases.aRow.id,
        databaseId: w.databases.dbA.id,
        ownerPageId: w.pages.aPage.id,
        pageId: w.databases.aRowBody.id,
        canEdit: false,
      }),
  }),
  defineRow({
    id: 'RB-GET-WIKIPROT',
    spec: 'PERM-24 + FR-510 — GET …/{wikiProtRow}/body: readable by all, can.edit only for the manager',
    action: ROW_BODY_ROUTE,
    mutates: false,
    with: DBS,
    expect: ALL,
    run: async (w, _ctx, actor) =>
      checkedBody(await rowBodyGet(w.databases.wikiProtRow.id), {
        rowId: w.databases.wikiProtRow.id,
        databaseId: w.databases.dbWikiProt.id,
        ownerPageId: w.pages.wikiProtected.id,
        pageId: null,
        canEdit: actor.id === w.manager.id,
      }),
  }),
  defineRow({
    id: 'RB-GET-DELETED',
    spec: 'X41 — the body of a soft-deleted row (pRowDeleted) is a 404 for everyone',
    action: ROW_BODY_ROUTE,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: (w) => rowBodyGet(w.databases.pRowDeleted.id),
  }),
  defineRow({
    id: 'RB-GET-BAD',
    spec: 'X86 — GET /api/database-rows/x/body is a 404',
    action: ROW_BODY_ROUTE,
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: () => rowBodyGet('x'),
  }),

  // ── ensureRowBody (PERM-25, FR-1453, M11-D8) ─────────────────────────────────────────────────────────────────
  defineRow({
    id: 'RB-ENSURE',
    spec: 'PERM-25 — ensureRowBody({ pRow2 }) creates the DB_ROW page (audit page · create, project P)',
    action: 'ensureRowBody',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await ensure(w.databases.pRow2.id)
      if (r.ok) {
        expect(r).toMatchObject({ created: true, version: 1 })
        const bodies = await rowBodiesOf(w.databases.pRow2.id)
        expect(bodies).toHaveLength(1)
        expect(bodies[0]).toMatchObject({
          id: r.pageId,
          kind: 'DB_ROW',
          space: 'PROJECT',
          projectId: w.P.id,
          title: '',
          parentId: null,
          position: 'a0',
          deletedAt: null,
        })
      }
      return r
    },
  }),
  defineRow({
    id: 'RB-ENSURE-EXISTING',
    spec: 'PERM-25 + M11-D8 — ensureRowBody({ pRow1 }) returns the existing body; idempotent, no audit',
    action: 'ensureRowBody',
    mutates: true,
    audit: false,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await ensure(w.databases.pRow1.id)
      if (r.ok) {
        expect(r).toMatchObject({ pageId: w.databases.pRowBody.id, created: false })
        expect(await rowBodiesOf(w.databases.pRow1.id)).toHaveLength(1)
      }
      return r
    },
  }),
  defineRow({
    id: 'RB-ENSURE-ARCH',
    spec: 'PERM-25 + X42 — ensureRowBody({ aRow }) in archived A → 403 (even though a body exists)',
    action: 'ensureRowBody',
    mutates: true,
    audit: auditPageA,
    with: DBS,
    expect: ARCH_WRITE,
    run: (w) => ensure(w.databases.aRow.id),
  }),
  defineRow({
    id: 'RB-ENSURE-WIKIPROT',
    spec: 'PERM-25 + FR-510 — ensureRowBody({ wikiProtRow }) on a locked wiki: manager only (audit project null)',
    action: 'ensureRowBody',
    mutates: true,
    audit: auditPageWiki,
    with: DBS,
    expect: MGR,
    run: async (w, _ctx, actor) => {
      const r = await ensure(w.databases.wikiProtRow.id)
      if (actor.id !== w.manager.id) expect(await rowBodiesOf(w.databases.wikiProtRow.id)).toEqual([])
      return r
    },
  }),
  defineRow({
    id: 'RB-ENSURE-DELETED',
    spec: 'X41 — ensureRowBody on a soft-deleted row → 404 for everyone, no page created',
    action: 'ensureRowBody',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: (w) => ensure(w.databases.pRowDeleted.id),
  }),
  defineRow({
    id: 'RB-ENSURE-BAD',
    spec: 'X86 — ensureRowBody({ rowId: "x" }) fails zod → 400 for everyone',
    action: 'ensureRowBody',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('400'),
    run: () => ensure('x'),
  }),

  // ── M4 page routes on a DB_ROW page (requirePage DB_ROW branch → owner access, M11-D6) ──────────────────────
  defineRow({
    id: 'RB-PAGE-GET',
    spec: 'PERM-24 + M11-D8 — GET /api/pages/{pRowBody}: kind DB_ROW, rowId, title = row title, no breadcrumb',
    action: 'GET /api/pages/[id]',
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const res = await pageGet(w.databases.pRowBody.id)
      if (res.status === 200) {
        const view = (await res.clone().json()) as PageView
        expect(view.page).toMatchObject({
          id: w.databases.pRowBody.id,
          kind: 'DB_ROW',
          rowId: w.databases.pRow1.id,
          title: 'แถว P-ลับ21',
        })
        expect(view.breadcrumb).toEqual([])
        expect(view.can).toMatchObject({ edit: true, protect: false, delete: false, createChild: false, move: false, duplicate: false })
      }
      return res
    },
  }),
  defineRow({
    id: 'RB-PAGE-GET-DELETED',
    spec: 'X41 — GET /api/pages/{pRowDeletedBody} (body of a deleted row) → 404',
    action: 'GET /api/pages/[id]',
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: (w) => pageGet(w.databases.pRowDeletedBody.id),
  }),
  defineRow({
    id: 'RB-SAVE',
    spec: 'PERM-25 — savePageContent on pRowBody (page audit, project P; no lease needed X63)',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ,
    run: async (w) => {
      const r = await savePageContent({
        pageId: w.databases.pRowBody.id,
        baseVersion: await currentVersion(w.databases.pRowBody.id),
        content: para('เนื้อหาแถวใหม่'),
      })
      if (r.ok) expect((await pageRow(w.databases.pRowBody.id)).contentText).toBe('เนื้อหาแถวใหม่')
      return r
    },
  }),
  defineRow({
    id: 'RB-SAVE-DB',
    spec: 'M11-D8 / M11-D38 — a database block in DB_ROW content → 400 (after authz: W 404)',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) => {
      const before = await pageRow(w.databases.pRowBody.id)
      const r = await savePageContent({
        pageId: w.databases.pRowBody.id,
        baseVersion: before.version,
        content: [...para('ก่อน'), databaseBlock(w.databases.dbP.id)],
      })
      expect((await pageRow(w.databases.pRowBody.id)).version).toBe(before.version)
      return r
    },
  }),
  defineRow({
    id: 'RB-SAVE-SUBPAGE',
    spec: 'FR-1453 / M11-D8 — a subpage block in DB_ROW content → 400 (after authz: W 404)',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) =>
      savePageContent({
        pageId: w.databases.pRowBody.id,
        baseVersion: await currentVersion(w.databases.pRowBody.id),
        content: subpageContent(w.pages.pChild.id),
      }),
  }),
  defineRow({
    id: 'RB-SAVE-ARCH',
    spec: 'PERM-25 + X42 — save on aRowBody (archived A) → 403',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageA,
    with: DBS,
    expect: ARCH_WRITE,
    run: async (w) =>
      savePageContent({
        pageId: w.databases.aRowBody.id,
        baseVersion: await currentVersion(w.databases.aRowBody.id),
        content: para('แก้'),
      }),
  }),
  defineRow({
    id: 'RB-SAVE-WIKIPROT',
    spec: 'PERM-25 + FR-510 — save on the body of a locked-wiki row: manager only',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageWiki,
    with: DBS,
    expect: MGR,
    setup: async (w) => ({
      body: await makeRowBody({ row: w.databases.wikiProtRow, content: 'เนื้อหาล็อก', createdBy: w.manager }),
    }),
    run: (_w, ctx) => savePageContent({ pageId: ctx.body.id, baseVersion: ctx.body.version, content: para('แก้') }),
  }),
  defineRow({
    id: 'RB-KEEPALIVE',
    spec: 'PERM-25 + M4-D2 — PUT /api/pages/{pRowBody}/content (same audit as the action, X96)',
    action: 'PUT /api/pages/[id]/content',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ,
    run: async (w) =>
      keepalive(w.databases.pRowBody.id, {
        baseVersion: await currentVersion(w.databases.pRowBody.id),
        content: para('ปิดแท็บ'),
      }),
  }),
  defineRow({
    id: 'RB-KEEPALIVE-DB',
    spec: 'M11-D8 — the keepalive PUT also rejects database blocks in DB_ROW content',
    action: 'PUT /api/pages/[id]/content',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: PROJ_400,
    run: async (w) =>
      keepalive(w.databases.pRowBody.id, {
        baseVersion: await currentVersion(w.databases.pRowBody.id),
        content: [databaseBlock(w.databases.dbP.id)],
      }),
  }),
  defineRow({
    id: 'RB-LOCK-GET',
    spec: 'PERM-24 — GET /api/pages/{pRowBody}/lock (view)',
    action: 'GET /api/pages/[id]/lock',
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: (w) => lockCall('GET', w.databases.pRowBody.id),
  }),
  defineRow({
    id: 'RB-LOCK-POST',
    spec: 'PERM-25 + X63 — POST /api/pages/{pRowBody}/lock (lease on the body only, not audited X44)',
    action: 'POST /api/pages/[id]/lock',
    mutates: true,
    audit: false,
    with: DBS,
    expect: PROJ,
    run: (w) => lockCall('POST', w.databases.pRowBody.id),
  }),
  defineRow({
    id: 'RB-LOCK-POST-ARCH',
    spec: 'PERM-25 + X42 — no lease on aRowBody (archived A)',
    action: 'POST /api/pages/[id]/lock',
    mutates: true,
    audit: false,
    with: DBS,
    expect: ARCH_WRITE,
    run: (w) => lockCall('POST', w.databases.aRowBody.id),
  }),
  defineRow({
    id: 'RB-LOCK-DELETE',
    spec: 'PERM-24 — DELETE /api/pages/{pRowBody}/lock (idempotent release, not audited)',
    action: 'DELETE /api/pages/[id]/lock',
    mutates: true,
    audit: false,
    with: DBS,
    expect: PROJ,
    run: (w) => lockCall('DELETE', w.databases.pRowBody.id),
  }),
  defineRow({
    id: 'RB-UPLOAD',
    spec: 'PERM-25 — POST /api/files into pRowBody (file audit, project P)',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileP,
    with: DBS,
    expect: PROJ,
    run: (w) => upload({ pageId: w.databases.pRowBody.id, name: 'a.png', bytes: PNG_1X1 }),
  }),
  defineRow({
    id: 'RB-UPLOAD-ARCH',
    spec: 'PERM-25 + X42 — upload into aRowBody (archived A) → 403',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileA,
    with: DBS,
    expect: ARCH_WRITE,
    run: (w) => upload({ pageId: w.databases.aRowBody.id, name: 'a.png', bytes: PNG_1X1 }),
  }),
  defineRow({
    id: 'RB-FILE-GET',
    spec: 'PERM-24 — GET /api/files/{pRowImage} (an image inside a row body)',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: DBS,
    expect: PROJ,
    run: (w) => fileGet(w.databases.pRowImage.id),
  }),

  // ── page-tree APIs addressed at a DB_ROW page (FR-682 / FR-1453 → 404 for everyone) ────────────────────────
  defineRow({
    id: 'RB-DOCAPI-TREE',
    spec: 'FR-1453 — GET /api/pages/tree?…&parentId={pRowBody} (a DB_ROW page has no children) → 404',
    action: 'GET /api/pages/tree',
    mutates: false,
    with: DBS,
    expect: each('404'),
    run: (w) => treeGet(`space=PROJECT&projectId=${w.P.id}&parentId=${w.databases.pRowBody.id}`),
  }),
  defineRow({
    id: 'RB-DOCAPI-RENAME',
    spec: 'FR-1453 — renamePage(pRowBody): the title is the row title → 404',
    action: 'renamePage',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: (w) => renamePage({ pageId: w.databases.pRowBody.id, title: 'ชื่อใหม่' }),
  }),
  defineRow({
    id: 'RB-DOCAPI-ICON',
    spec: 'FR-1453 — setPageIcon(pRowBody) → 404',
    action: 'setPageIcon',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: (w) => setPageIcon({ pageId: w.databases.pRowBody.id, icon: '📌' }),
  }),
  defineRow({
    id: 'RB-DOCAPI-COVER',
    spec: 'FR-1453 — setPageCover(pRowBody, its own image) → 404',
    action: 'setPageCover',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: (w) => setPageCover({ pageId: w.databases.pRowBody.id, fileId: w.databases.pRowImage.id }),
  }),
  defineRow({
    id: 'RB-DOCAPI-PROTECT',
    spec: 'FR-1453 — setPageProtected(pRowBody) → 404',
    action: 'setPageProtected',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: (w) => setPageProtected({ pageId: w.databases.pRowBody.id, protected: true }),
  }),
  defineRow({
    id: 'RB-DOCAPI-TEMPLATE',
    spec: 'FR-1453 — applyTemplate on a blank DB_ROW page (pRow2’s fresh body) → 404',
    action: 'applyTemplate',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    // A blank body, so a missing kind guard would succeed (M4-D7 blank-only) instead of failing for another reason.
    setup: async (w) => ({ blank: await makeRowBody({ row: w.databases.pRow2 }) }),
    run: (_w, ctx) => applyTemplate({ pageId: ctx.blank.id, baseVersion: 1, template: 'meeting' }),
  }),
  defineRow({
    id: 'RB-DOCAPI-MOVE',
    spec: 'FR-1453 — movePage(pRowBody → root after pPage) → 404',
    action: 'movePage',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: (w) => movePage({ pageId: w.databases.pRowBody.id, parentId: null, afterId: w.pages.pPage.id }),
  }),
  defineRow({
    id: 'RB-DOCAPI-MOVE-UNDER',
    spec: 'FR-1453 — movePage(pChild under pRowBody): a DB_ROW page is never a parent → 404',
    action: 'movePage',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: (w) => movePage({ pageId: w.pages.pChild.id, parentId: w.databases.pRowBody.id, afterId: null }),
  }),
  defineRow({
    id: 'RB-DOCAPI-DUP',
    spec: 'FR-1453 — duplicatePage(pRowBody) → 404 (rows are copied only with their database)',
    action: 'duplicatePage',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: (w) => duplicatePage({ pageId: w.databases.pRowBody.id }),
  }),
  defineRow({
    id: 'RB-DOCAPI-DELETE',
    spec: 'FR-1453 — deletePage(pRowBody): bodies go only with their row → 404, body stays live',
    action: 'deletePage',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: async (w) => {
      const r = await deletePage({ pageId: w.databases.pRowBody.id })
      expect((await pageRow(w.databases.pRowBody.id)).deletedAt).toBeNull()
      return r
    },
  }),
  defineRow({
    id: 'RB-DOCAPI-CREATE-CHILD',
    spec: 'FR-1453 — createPage({ PROJECT, P, parentId: pRowBody }) → 404',
    action: 'createPage',
    mutates: true,
    audit: auditPageP,
    with: DBS,
    expect: each('404'),
    run: (w) => createPage({ space: 'PROJECT', projectId: w.P.id, parentId: w.databases.pRowBody.id }),
  }),

  // ── setPageFullWidth({ rowId }) (FR-1602, M11-D8) ─────────────────────────────────────────────────────────────
  defineRow({
    id: 'FW-ROW',
    spec: 'PERM-25 + FR-1602 — setPageFullWidth({ rowId: pRow2 }) creates the body silently; exactly one page audit',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: DBS_FW,
    expect: PROJ,
    run: async (w) => {
      const r = checkedFullWidth(await setPageFullWidth({ rowId: w.databases.pRow2.id, fullWidth: true }))
      if (r.ok) {
        const bodies = await rowBodiesOf(w.databases.pRow2.id)
        expect(bodies).toHaveLength(1)
        expect(bodies[0]).toMatchObject({ id: r.pageId, kind: 'DB_ROW', fullWidth: true })
      }
      return r
    },
  }),
  defineRow({
    id: 'FW-ROW-EXISTING',
    spec: 'FR-1602 — setPageFullWidth({ rowId: pRow1 }) on the existing body (one page audit)',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: DBS_FW,
    expect: PROJ,
    run: async (w) => {
      const r = checkedFullWidth(await setPageFullWidth({ rowId: w.databases.pRow1.id, fullWidth: true }))
      if (r.ok) expect(r.pageId).toBe(w.databases.pRowBody.id)
      return r
    },
  }),
  defineRow({
    id: 'FW-ROW-WIKIPROT',
    spec: 'PERM-25 + FR-510 — setPageFullWidth({ rowId: wikiProtRow }): manager only',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageWiki,
    with: DBS_FW,
    expect: MGR,
    run: (w) => setPageFullWidth({ rowId: w.databases.wikiProtRow.id, fullWidth: true }),
  }),
  defineRow({
    id: 'FW-ROW-ARCH',
    spec: 'PERM-25 + X42 — setPageFullWidth({ rowId: aRow }) (archived A) → 403, body unchanged',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageA,
    with: DBS_FW,
    expect: ARCH_WRITE,
    run: async (w) => {
      const r = await setPageFullWidth({ rowId: w.databases.aRow.id, fullWidth: true })
      expect((await pageRow(w.databases.aRowBody.id)).fullWidth).toBe(false)
      return r
    },
  }),
  defineRow({
    id: 'FW-ROW-PAGEID',
    spec: 'FR-1453 — { pageId: pRowBody } (a DB_ROW page through the DOC path) → 404; rows use rowId',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: DBS_FW,
    expect: each('404'),
    run: (w) => setPageFullWidth({ pageId: w.databases.pRowBody.id, fullWidth: true }),
  }),
  defineRow({
    id: 'FW-ROW-BAD',
    spec: 'M11-D8 — both rowId and taskId → 400 for everyone (exactly one target)',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: DBS_FW,
    expect: each('400'),
    run: (w) => setPageFullWidth({ rowId: w.databases.pRow2.id, taskId: w.tasks.pLeaf.id, fullWidth: true }),
  }),
]
