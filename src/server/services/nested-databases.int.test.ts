// Nested databases inside row pages (owner decision 2026-11-03, FR-1453 / FR-1475 rev.): Table / Kanban / Calendar
// blocks in DB_ROW bodies up to 3 database levels (doc → db → row → db → row → db). Access resolves recursively
// through row body → its database → that database's owner page (PERM-24…26); outsiders get the identical 404 with no
// nested name or id; deeper creation / save / copy → VALIDATION th.database.errors.nesting; duplicate and paste deep
// copy nested databases with id remapping; soft delete / restore and detach cascade; permanent project delete
// cascades; Cmd+K finds nested databases with a breadcrumb.
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import type { RowBodyView } from '@/lib/contracts/row-pages'
import type { SearchAllResponse } from '@/lib/contracts/search'
import { DB_LIMITS } from '@/lib/schemas/db-limits'
import {
  copyDatabase,
  createDatabase,
  createDatabaseRows,
  deleteDatabaseRows,
  restoreDatabaseRowBatch,
  updateDatabaseRow,
} from '../actions/databases'
import { deletePage, duplicatePage, restorePageBatch, savePageContent } from '../actions/pages'
import { deleteProjectPermanently } from '../actions/projects'
import { ensureRowBody } from '../actions/row-pages'
import { asUser } from '../../../tests/helpers/as-user'
import { createWorld, type World } from '../../../tests/helpers/world'
import { assertContains, assertNoLeak } from '../../../tests/authz/_support/leak'
import { okJson } from '../../../tests/authz/_support/http'
import {
  attachedOf,
  databaseBlock,
  databaseById,
  databasesOfPage,
  dbGet,
  liveRows,
  makeNestedChain,
  nestedSecrets,
  rowBodiesOf,
  rowBodyGet,
  type NestedChain,
} from '../../../tests/authz/rows/_m11'
import { searchQ } from '../../../tests/authz/rows/_m10'
import { db } from '../db/client'
import { databases, pages } from '../db/schema'
import * as services from '.'

const NEST = th.database.errors.nesting(DB_LIMITS.nestingLevels)

let w: World
let c: NestedChain

beforeEach(async () => {
  w = await createWorld({ with: ['databases'] })
  c = await makeNestedChain({ body: w.databases.pRowBody, by: w.manager, tag: 'P' })
})

const version = async (pageId: string): Promise<number> =>
  (await db.select({ v: pages.version }).from(pages).where(eq(pages.id, pageId)))[0]!.v

describe('create nested databases (FR-1453 rev.)', () => {
  it('member creates a Kanban in a level-1 row body, then one level deeper; the third level refuses', async () => {
    asUser(w.member)
    const lvl2 = await createDatabase({ pageId: w.databases.pRowBody.id, view: 'KANBAN' })
    if (!lvl2.ok) throw new Error(lvl2.message)
    expect(lvl2.database.pageId).toBe(w.databases.pRowBody.id)
    const rows = await createDatabaseRows({ databaseId: lvl2.databaseId, rows: [{ title: 'การ์ดซ้อน' }] })
    if (!rows.ok) throw new Error(rows.message)
    const rowId = rows.rows[0]!.id
    const body = await ensureRowBody({ rowId })
    if (!body.ok) throw new Error(body.message)
    const lvl3 = await createDatabase({ pageId: body.pageId, view: 'TABLE' })
    if (!lvl3.ok) throw new Error(lvl3.message)
    // level 3 → its row bodies are the deepest: no database there
    const deep = await createDatabaseRows({ databaseId: lvl3.databaseId, rows: [{ title: 'ลึกสุด' }] })
    if (!deep.ok) throw new Error(deep.message)
    const deepBody = await ensureRowBody({ rowId: deep.rows[0]!.id })
    if (!deepBody.ok) throw new Error(deepBody.message)
    const refused = await createDatabase({ pageId: deepBody.pageId, view: 'CALENDAR' })
    expect(refused).toMatchObject({ ok: false, code: 'VALIDATION', message: NEST })
    expect(await databasesOfPage(deepBody.pageId)).toEqual([])
  })

  it('the row body view exposes the level and whether databases may nest', async () => {
    asUser(w.member)
    const one = await okJson<RowBodyView>(await rowBodyGet(w.databases.pRow1.id))
    const two = await okJson<RowBodyView>(await rowBodyGet(c.row2.id))
    const three = await okJson<RowBodyView>(await rowBodyGet(c.row3.id))
    expect([one.databaseLevel, two.databaseLevel, three.databaseLevel]).toEqual([1, 2, 3])
    expect([one.canNestDatabase, two.canNestDatabase, three.canNestDatabase]).toEqual([true, true, false])
    expect(three).toMatchObject({ ownerPageId: c.body2.id, databaseId: c.db3.id, space: 'PROJECT', projectId: w.P.id })
  })

  it('/r of a nested row: owner = the outer row (kind DB_ROW, href /r/<outer row>)', async () => {
    const user = asUser(w.member)
    const v = await services.rowPages.getRowPageView(db, user, c.row3.id)
    expect(v.owner).toMatchObject({
      kind: 'DB_ROW',
      pageId: c.body2.id,
      title: c.row2.title,
      href: `/r/${c.row2.id}`,
      projectId: w.P.id,
      archived: false,
    })
    expect(v.database).toEqual({ id: c.db3.id, title: c.db3.title, ownerPageId: c.body2.id })
  })
})

describe('permissions through two nested levels (PERM-24…26)', () => {
  it('P team reads and edits level 2 and 3; the outsider gets the byte-identical 404 with no nested secret', async () => {
    for (const u of [w.manager, w.lead, w.member]) {
      asUser(u)
      expect((await dbGet(c.body2.id, c.db3.id)).status).toBe(200)
      const r = await updateDatabaseRow({ rowId: c.row3.id, baseVersion: (await liveRows(c.db3.id))[0]!.version, title: `แก้โดย ${u.id}` })
      expect(r.ok).toBe(true)
    }
    asUser(w.outsider)
    const bodies: string[] = []
    for (const res of [
      await dbGet(w.databases.pRowBody.id, c.db2.id),
      await dbGet(c.body2.id, c.db3.id),
      await rowBodyGet(c.row2.id),
      await rowBodyGet(c.row3.id),
      await dbGet(w.pages.pPage.id, randomUUID()),
    ]) {
      expect(res.status).toBe(404)
      bodies.push(await res.text())
    }
    expect(new Set(bodies).size).toBe(1)
    for (const call of [
      () => createDatabase({ pageId: c.body2.id, view: 'TABLE' }),
      () => createDatabaseRows({ databaseId: c.db3.id, rows: [{ title: 'x' }] }),
      () => ensureRowBody({ rowId: c.row3.id }),
      () => copyDatabase({ sourcePageId: c.body2.id, sourceDatabaseId: c.db3.id, targetPageId: w.pages.qPage.id }),
    ]) {
      const r = await call()
      expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' })
      assertNoLeak(r, nestedSecrets(c, 'P'))
    }
  })

  it('archived project: nested data readable, every write 403; locked wiki: workers 403, manager allowed', async () => {
    const a = await makeNestedChain({ body: w.databases.aRowBody, by: w.manager, tag: 'A' })
    asUser(w.member)
    const view = await okJson<RowBodyView>(await rowBodyGet(a.row3.id))
    expect(view.can.edit).toBe(false)
    expect(await createDatabaseRows({ databaseId: a.db3.id, rows: [{ title: 'x' }] })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    // locked wiki (FR-510): a row body under the protected wiki page
    const prot = await ensureWikiProtBody()
    const lw = await makeNestedChain({ body: prot, by: w.manager, tag: 'L' })
    asUser(w.member)
    expect((await dbGet(lw.body2.id, lw.db3.id)).status).toBe(200)
    expect(await createDatabaseRows({ databaseId: lw.db3.id, rows: [{ title: 'x' }] })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    asUser(w.manager)
    expect((await createDatabaseRows({ databaseId: lw.db3.id, rows: [{ title: 'x' }] })).ok).toBe(true)
  })
})

/** The body of wikiProtRow (locked wiki owner) — created by the manager (workers may not edit it). */
async function ensureWikiProtBody() {
  asUser(w.manager)
  const r = await ensureRowBody({ rowId: w.databases.wikiProtRow.id })
  if (!r.ok) throw new Error(r.message)
  return (await rowBodiesOf(w.databases.wikiProtRow.id))[0]!
}

describe('depth limit on save and copy (FR-1475 rev.)', () => {
  it('a level-3 row body refuses a database block; a level-2 body accepts one (and attaches it)', async () => {
    asUser(w.member)
    const before = await version(c.body3.id)
    const deep = await savePageContent({
      pageId: c.body3.id,
      baseVersion: before,
      content: [databaseBlock(c.db2.id)],
    })
    expect(deep).toMatchObject({ ok: false, code: 'VALIDATION', message: th.editor.errors.databaseNotAllowed(3) })
    expect(await version(c.body3.id)).toBe(before)
    const ok = await savePageContent({
      pageId: c.body2.id,
      baseVersion: await version(c.body2.id),
      content: [{ type: 'paragraph', content: 'ยังอยู่' }, databaseBlock(c.db3.id)],
    })
    expect(ok.ok).toBe(true)
    expect((await attachedOf(c.body2.id)).map((d) => d.id)).toEqual([c.db3.id])
  })

  it('copy: height is added to the target level — too deep → VALIDATION; a flat database fits', async () => {
    asUser(w.member)
    // dbP has height 3 (dbP › db2 › db3) → only DOC / TASK targets fit
    expect(
      await copyDatabase({ sourcePageId: w.pages.pPage.id, sourceDatabaseId: w.databases.dbP.id, targetPageId: c.body2.id }),
    ).toMatchObject({ ok: false, code: 'VALIDATION', message: NEST })
    // db3 (height 1) into the level-2 body (new level 3) fits; into the level-3 body (new level 4) does not
    const fits = await copyDatabase({ sourcePageId: c.body2.id, sourceDatabaseId: c.db3.id, targetPageId: c.body2.id })
    expect(fits.ok).toBe(true)
    expect(
      await copyDatabase({ sourcePageId: c.body2.id, sourceDatabaseId: c.db3.id, targetPageId: c.body3.id }),
    ).toMatchObject({ ok: false, code: 'VALIDATION', message: NEST })
    expect(await databasesOfPage(c.body3.id)).toEqual([])
  })
})

describe('lifecycle', () => {
  it('pasting a database into one of its own row bodies copies the source as it was (no self-recursion)', async () => {
    await db.delete(databases).where(eq(databases.id, c.db2.id)) // dbP back to height 1
    asUser(w.member)
    const r = await copyDatabase({
      sourcePageId: w.pages.pPage.id,
      sourceDatabaseId: w.databases.dbP.id,
      targetPageId: w.databases.pRowBody.id,
    })
    if (!r.ok) throw new Error(r.message)
    const rows = await liveRows(r.databaseId)
    expect(rows).toHaveLength(3)
    const row1 = rows.find((x) => x.title === w.databases.pRow1.title)!
    const [body] = await rowBodiesOf(row1.id)
    expect(await attachedOf(body!.id)).toEqual([]) // the copy itself was not copied into its copy
  })

  it('duplicatePage deep-copies nested databases, rows and bodies with remapped ids', async () => {
    asUser(w.member)
    const res = await duplicatePage({ pageId: w.pages.pPage.id })
    if (!res.ok) throw new Error(res.message)
    const [copyP] = await db.select().from(databases).where(eq(databases.pageId, res.root.id))
    const row1 = (await liveRows(copyP!.id)).find((r) => r.title === w.databases.pRow1.title)!
    const [body1] = await rowBodiesOf(row1.id)
    const [copy2] = await attachedOf(body1!.id)
    expect(copy2).toMatchObject({ title: c.db2.title })
    expect(copy2!.id).not.toBe(c.db2.id)
    expect(JSON.stringify(body1!.content)).toContain(copy2!.id)
    expect(JSON.stringify(body1!.content)).not.toContain(c.db2.id)
    const [row2] = await liveRows(copy2!.id)
    const [body2] = await rowBodiesOf(row2!.id)
    expect(body2).toMatchObject({ kind: 'DB_ROW', projectId: w.P.id })
    expect(body2!.contentText).toContain('P-ลับ42')
    const [copy3] = await attachedOf(body2!.id)
    expect(copy3).toMatchObject({ title: c.db3.title })
    expect(JSON.stringify(body2!.content)).toContain(copy3!.id)
    const [row3] = await liveRows(copy3!.id)
    expect(row3!.title).toBe(c.row3.title)
    expect((await rowBodiesOf(row3!.id))[0]!.contentText).toContain('P-ลับ45')
    // the copies are reachable through the new chain
    expect((await dbGet(body2!.id, copy3!.id)).status).toBe(200)
    // the source chain is untouched
    expect((await attachedOf(c.body2.id)).map((d) => d.id)).toEqual([c.db3.id])
  })

  it('copyDatabase (paste) deep-copies a nested database into a DOC page (levels shift up)', async () => {
    asUser(w.member)
    const r = await copyDatabase({
      sourcePageId: w.databases.pRowBody.id,
      sourceDatabaseId: c.db2.id,
      targetPageId: w.pages.pChild.id,
    })
    if (!r.ok) throw new Error(r.message)
    const [row] = await liveRows(r.databaseId)
    const [body] = await rowBodiesOf(row!.id)
    const [inner] = await attachedOf(body!.id)
    expect(inner).toMatchObject({ title: c.db3.title })
    expect(inner!.id).not.toBe(c.db3.id)
    const view = await okJson<RowBodyView>(await rowBodyGet(row!.id))
    expect(view.databaseLevel).toBe(1)
  })

  it('deleting the outer row hides the nested databases; undo restores them exactly', async () => {
    asUser(w.member)
    const del = await deleteDatabaseRows({ rowIds: [w.databases.pRow1.id] })
    if (!del.ok) throw new Error(del.message)
    expect((await dbGet(w.databases.pRowBody.id, c.db2.id)).status).toBe(404)
    expect((await dbGet(c.body2.id, c.db3.id)).status).toBe(404)
    expect((await rowBodyGet(c.row3.id)).status).toBe(404)
    expect(await createDatabaseRows({ databaseId: c.db3.id, rows: [{ title: 'x' }] })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    const search = await okJson<SearchAllResponse>(await searchQ('ชั้นสาม P'))
    expect(search.databases).toEqual([])
    const undo = await restoreDatabaseRowBatch({ batch: del.batch })
    if (!undo.ok) throw new Error(undo.message)
    expect((await dbGet(c.body2.id, c.db3.id)).status).toBe(200)
    expect((await liveRows(c.db3.id)).map((r) => r.id)).toEqual([c.row3.id])
    expect(await databaseById(c.db3.id)).toMatchObject({ title: c.db3.title, detachedAt: null })
  })

  it('deleting the owner DOC page hides the whole chain; restoring the batch brings it back', async () => {
    asUser(w.member)
    const del = await deletePage({ pageId: w.pages.pPage.id })
    if (!del.ok) throw new Error(del.message)
    expect((await rowBodyGet(c.row3.id)).status).toBe(404)
    const undo = await restorePageBatch({ batch: del.batch })
    if (!undo.ok) throw new Error(undo.message)
    expect((await rowBodyGet(c.row3.id)).status).toBe(200)
  })

  it('removing the database block from a row body detaches it (FR-1472); putting it back re-attaches', async () => {
    asUser(w.member)
    const v = await version(c.body2.id)
    const r = await savePageContent({ pageId: c.body2.id, baseVersion: v, content: [{ type: 'paragraph', content: 'ว่าง' }] })
    if (!r.ok) throw new Error(r.message)
    expect((await databaseById(c.db3.id)).detachedAt).not.toBeNull()
    expect((await okJson<SearchAllResponse>(await searchQ('ชั้นสาม P'))).databases).toEqual([])
    const back = await savePageContent({ pageId: c.body2.id, baseVersion: r.version, content: [databaseBlock(c.db3.id)] })
    if (!back.ok) throw new Error(back.message)
    expect((await databaseById(c.db3.id)).detachedAt).toBeNull()
  })

  it('permanent project delete removes nested databases, rows and bodies', async () => {
    asUser(w.manager)
    const r = await deleteProjectPermanently({ projectId: w.P.id, confirmName: w.P.name })
    if (!r.ok) throw new Error(r.message)
    const ids = [c.db2.id, c.db3.id]
    expect(await db.select().from(databases).where(inArray(databases.id, ids))).toEqual([])
    expect(await db.select().from(pages).where(inArray(pages.id, [c.body2.id, c.body3.id]))).toEqual([])
  })
})

describe('Cmd+K search (FR-1474) with nested databases', () => {
  it('member finds level-3 database, row and body hits with the breadcrumb and an /r href', async () => {
    asUser(w.member)
    const body = await okJson<SearchAllResponse>(await searchQ('ชั้นสาม P'))
    const byKind = Object.fromEntries(body.databases.map((h) => [h.matchedIn, h]))
    expect(byKind.database).toMatchObject({
      databaseId: c.db3.id,
      pageId: c.body2.id,
      pageTitle: w.pages.pPage.title,
      trail: [
        { kind: 'database', title: w.databases.dbP.title },
        { kind: 'row', title: w.databases.pRow1.title },
        { kind: 'database', title: c.db2.title },
        { kind: 'row', title: c.row2.title },
      ],
      href: `/r/${c.row2.id}?db=${c.db3.id}`,
    })
    expect(byKind.row).toMatchObject({ rowId: c.row3.id, href: `/r/${c.row2.id}?db=${c.db3.id}&row=${c.row3.id}` })
    const content = await okJson<SearchAllResponse>(await searchQ('เนื้อหาชั้นสาม P'))
    expect(content.databases).toMatchObject([{ matchedIn: 'content', rowId: c.row3.id, databaseId: c.db3.id }])
    // level-1 hits keep an empty trail and the owner page href
    const top = await okJson<SearchAllResponse>(await searchQ('ฐานข้อมูล P-ลับ20'))
    expect(top.databases[0]).toMatchObject({ databaseId: w.databases.dbP.id, trail: [], href: `/p/${w.pages.pPage.id}?db=${w.databases.dbP.id}` })
  })

  it('outsider: no nested hit and no nested secret anywhere in the payload', async () => {
    asUser(w.outsider)
    const body = await okJson<SearchAllResponse>(await searchQ('ลับ4'))
    assertNoLeak(body, nestedSecrets(c, 'P'))
    const q = await makeNestedChain({ body: await qRowBody(), by: w.manager, tag: 'Q' })
    const mine = await okJson<SearchAllResponse>(await searchQ('ชั้นสาม Q'))
    assertContains(mine, [q.db3.id])
  })
})

/** A body for qRow (Q: the outsider's project). */
async function qRowBody() {
  asUser(w.manager)
  const r = await ensureRowBody({ rowId: w.databases.qRow.id })
  if (!r.ok) throw new Error(r.message)
  asUser(w.outsider)
  return (await rowBodiesOf(w.databases.qRow.id))[0]!
}
