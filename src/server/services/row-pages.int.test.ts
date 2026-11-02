// M11 (plan/m11 §7.1 AC-1414; FR-1453, M11-D8, M11-D27) — database row bodies: the ensureRowBody action creates the
// DB_ROW page once (one `page · create` audit, never the row title), later calls return it; a saved body is
// searchable content; the body is soft-deleted with its row and comes back with it; the row page view; full width.
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { DELETE as unlockRoute, GET as leaseRoute, POST as lockRoute } from '@/app/api/pages/[id]/lock/route'
import type { LeaseState } from '@/lib/contracts/pages'
import { ensureRowBody } from '../actions/row-pages'
import { savePageContent } from '../actions/pages'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { pages, type PageRow } from '../db/schema'
import * as databases from './databases'
import * as rowPages from './row-pages'

let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['databases'] })
})

async function bodiesOf(rowId: string): Promise<PageRow[]> {
  return db.select().from(pages).where(eq(pages.databaseRowId, rowId))
}

describe('ensureRowBody (action)', () => {
  it('creates the DB_ROW page once in the owner space with one audit row; later calls return it unaudited', async () => {
    const d = w.databases
    asUser(w.member)
    const mark = await auditCount()
    const first = await ensureRowBody({ rowId: d.pRowNoBody.id })
    if (!first.ok) throw new Error(first.message)
    expect(first).toMatchObject({ created: true, version: 1 })
    const [body] = await bodiesOf(d.pRowNoBody.id)
    expect(body).toMatchObject({
      id: first.pageId,
      kind: 'DB_ROW',
      space: 'PROJECT',
      projectId: w.P.id,
      title: '',
      position: 'a0',
      createdBy: w.member.id,
    })
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      entity: 'page',
      action: 'create',
      entityId: first.pageId,
      projectId: w.P.id,
      summary: th.audit.rowBodyCreated(d.dbP.title),
    })
    expect(JSON.stringify(audits)).not.toContain(d.pRowNoBody.title) // M11-D5: never the row title
    const again = await ensureRowBody({ rowId: d.pRowNoBody.id })
    expect(again).toMatchObject({ ok: true, pageId: first.pageId, created: false })
    expect(await bodiesOf(d.pRowNoBody.id)).toHaveLength(1)
    expect(await auditRowsAfter(mark)).toHaveLength(1)
    // an existing body is returned as is
    expect(await ensureRowBody({ rowId: d.pRow1.id })).toMatchObject({ ok: true, pageId: d.pRowBody.id, created: false })
  })

  it('invisible or deleted rows → NOT_FOUND; archived owner → FORBIDDEN; nothing is created', async () => {
    const d = w.databases
    asUser(w.outsider)
    expect(await ensureRowBody({ rowId: d.pRowNoBody.id })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    asUser(w.member)
    expect(await ensureRowBody({ rowId: d.pRowDeleted.id })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await ensureRowBody({ rowId: d.deletedPageRow.id })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await ensureRowBody({ rowId: d.aRow.id })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await bodiesOf(d.pRowNoBody.id)).toEqual([])
  })
})

describe('row bodies (services)', () => {
  it('a saved body updates content_text; delete with the row and restore bring back the same body', async () => {
    const d = w.databases
    const u = toSessionUser(w.member)
    asUser(w.member)
    const ensured = await ensureRowBody({ rowId: d.pRow3.id })
    if (!ensured.ok) throw new Error(ensured.message)
    const saved = await savePageContent({
      pageId: ensured.pageId,
      baseVersion: ensured.version,
      content: [{ type: 'paragraph', content: 'บันทึกแถวสาม' }],
    })
    expect(saved).toMatchObject({ ok: true, version: 2 })
    const view = await db.transaction((tx) => rowPages.getRowBodyView(tx, u, d.pRow3.id))
    expect(view).toMatchObject({
      rowId: d.pRow3.id,
      databaseId: d.dbP.id,
      ownerPageId: w.pages.pPage.id,
      page: { id: ensured.pageId, version: 2, isBlank: false },
      can: { edit: true },
    })
    expect((await bodiesOf(d.pRow3.id))[0]!.contentText).toBe('บันทึกแถวสาม')

    const { batch } = await db.transaction((tx) => databases.deleteRows(tx, u, { rowIds: [d.pRow3.id] }))
    expect((await bodiesOf(d.pRow3.id))[0]).toMatchObject({ deletedBatch: batch })
    await expect(db.transaction((tx) => rowPages.getRowBodyView(tx, u, d.pRow3.id))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await db.transaction((tx) => databases.restoreRowBatch(tx, u, { batch }))
    const [restored] = await bodiesOf(d.pRow3.id)
    expect(restored).toMatchObject({ id: ensured.pageId, deletedAt: null, contentText: 'บันทึกแถวสาม' })
    expect(await ensureRowBody({ rowId: d.pRow3.id })).toMatchObject({ ok: true, pageId: ensured.pageId, created: false })
  })

  it('getRowBodyView: no body → page null; archived owner → can.edit false', async () => {
    const d = w.databases
    const u = toSessionUser(w.member)
    const none = await db.transaction((tx) => rowPages.getRowBodyView(tx, u, d.pRowNoBody.id))
    expect(none).toMatchObject({ page: null, can: { edit: true }, space: 'PROJECT', projectId: w.P.id })
    const archived = await db.transaction((tx) => rowPages.getRowBodyView(tx, u, d.aRow.id))
    expect(archived).toMatchObject({ page: { id: d.aRowBody.id }, can: { edit: false } })
  })

  it('getRowPageView: DOC owner links /p, TASK owner links /t with the task name', async () => {
    const d = w.databases
    const u = toSessionUser(w.member)
    const doc = await db.transaction((tx) => rowPages.getRowPageView(tx, u, d.pRow1.id))
    expect(doc).toMatchObject({
      row: { id: d.pRow1.id, title: d.pRow1.title, databaseId: d.dbP.id },
      database: { id: d.dbP.id, title: d.dbP.title, ownerPageId: w.pages.pPage.id },
      owner: { kind: 'DOC', href: `/p/${w.pages.pPage.id}`, projectName: w.P.name, archived: false },
      body: { page: { id: d.pRowBody.id } },
    })
    const task = await db.transaction((tx) => rowPages.getRowPageView(tx, u, d.taskRow.id))
    expect(task.owner).toMatchObject({ kind: 'TASK', href: `/t/${w.taskBodies.pLeafBody.taskId}` })
    await expect(
      db.transaction((tx) => rowPages.getRowPageView(tx, toSessionUser(w.outsider), d.pRow1.id)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('setFullWidth on a row without a body creates it silently and writes one update audit per change', async () => {
    const d = w.databases
    const u = toSessionUser(w.member)
    const mark = await auditCount()
    const on = await db.transaction((tx) => rowPages.setFullWidth(tx, u, { rowId: d.pRowNoBody.id }, true))
    expect(on).toMatchObject({ fullWidth: true, changed: true })
    const [body] = await bodiesOf(d.pRowNoBody.id)
    expect(body).toMatchObject({ id: on.pageId, fullWidth: true })
    const same = await db.transaction((tx) => rowPages.setFullWidth(tx, u, { rowId: d.pRowNoBody.id }, true))
    expect(same).toMatchObject({ changed: false })
    const audits = await auditRowsAfter(mark)
    expect(audits.map((a) => [a.entity, a.action])).toEqual([['page', 'update']])
    expect(audits[0]!.summary).toBe(th.audit.pageFullWidthOn(d.dbP.title))
  })
})

describe('ensureRowBody › AC-1414 (race, lease, space inheritance)', () => {
  it('concurrent ensures create exactly one DB_ROW page and one create audit', async () => {
    const d = w.databases
    const u = toSessionUser(w.member)
    const mark = await auditCount()
    const results = await Promise.all(
      Array.from({ length: 6 }, () => db.transaction((tx) => rowPages.ensureRowBody(tx, u, d.pRowNoBody.id))),
    )
    const bodies = await bodiesOf(d.pRowNoBody.id)
    expect(bodies).toHaveLength(1)
    expect(new Set(results.map((r) => r.pageId))).toEqual(new Set([bodies[0]!.id]))
    expect(results.filter((r) => r.created)).toHaveLength(1)
    const audits = await auditRowsAfter(mark)
    expect(audits.map((a) => [a.entity, a.action, a.entityId])).toEqual([['page', 'create', bodies[0]!.id]])
  })

  it('the edit lease of a row body: holder seen by other members; outsider 404; archived owner 403', async () => {
    const d = w.databases
    asUser(w.member)
    const ensured = await ensureRowBody({ rowId: d.pRowNoBody.id })
    if (!ensured.ok) throw new Error(ensured.message)
    const id = ensured.pageId
    const lockPath = `/api/pages/${id}/lock`
    const post = (u: World['member'], pageId: string): Promise<Response> => {
      asUser(u)
      return callRoute(lockRoute, `/api/pages/${pageId}/lock`, { id: pageId }, { method: 'POST', headers: { origin: 'http://t' } })
    }
    expect(await okJson<LeaseState>(await post(w.lead, id))).toMatchObject({ mine: true, holder: { userId: w.lead.id } })
    asUser(w.member)
    expect(await okJson<LeaseState>(await callRoute(leaseRoute, lockPath, { id }))).toMatchObject({
      mine: false,
      holder: { userId: w.lead.id },
    })
    // the lease covers the body only: cells stay editable for the member
    expect(await savePageContent({ pageId: id, baseVersion: ensured.version, content: [] })).toMatchObject({ ok: true })
    expect((await post(w.outsider, id)).status).toBe(404)
    asUser(w.outsider)
    expect((await callRoute(leaseRoute, lockPath, { id })).status).toBe(404)
    expect((await post(w.member, d.aRowBody.id)).status).toBe(403)
    asUser(w.lead)
    const del = await callRoute(unlockRoute, lockPath, { id }, { method: 'DELETE', headers: { origin: 'http://t' } })
    expect(del.status).toBe(204)
  })

  it('DB_ROW pages inherit the owner page space and project (PROJECT / TASK owner / WORKSPACE wiki)', async () => {
    const d = w.databases
    asUser(w.manager)
    const ensure = async (rowId: string) => {
      const r = await ensureRowBody({ rowId })
      if (!r.ok) throw new Error(r.message)
      const [body] = await bodiesOf(rowId)
      return body!
    }
    expect(await ensure(d.pRowNoBody.id)).toMatchObject({ kind: 'DB_ROW', space: w.pages.pPage.space, projectId: w.P.id })
    expect(await ensure(d.taskRow.id)).toMatchObject({
      kind: 'DB_ROW',
      space: w.taskBodies.pLeafBody.space,
      projectId: w.taskBodies.pLeafBody.projectId,
    })
    const wikiProtRow = await ensure(d.wikiProtRow.id)
    expect(wikiProtRow).toMatchObject({ kind: 'DB_ROW', space: 'WORKSPACE', projectId: null })
    expect(w.pages.wikiProtected).toMatchObject({ space: 'WORKSPACE', projectId: null })
    const q = await ensureRowBody({ rowId: d.qRow.id })
    if (!q.ok) throw new Error(q.message)
    expect((await bodiesOf(d.qRow.id))[0]).toMatchObject({ space: w.pages.qPage.space, projectId: w.pages.qPage.projectId })
  })
})
