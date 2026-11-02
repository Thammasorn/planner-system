// M11 (plan/m11 §7.1 AC-1410; FR-1470/1471, M11-D11/D12) — copying a database: paste via the copyDatabase action
// (same space → files reused; another space → file bytes copied to new keys and new `files` rows), the per-page limit,
// the M11-D12 check order, and duplicatePage copying attached (not detached) databases.
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { copyDatabase } from '../actions/databases'
import { duplicatePage } from '../actions/pages'
import { asUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeDatabase } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'
import { liveColumns, liveRows } from '../../../tests/authz/rows/_m11'
import { db } from '../db/client'
import { databases, files, pages } from '../db/schema'
import { getStorage } from '../storage'

let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['databases'] })
})

async function bodyOfCopiedRow1(databaseId: string) {
  const row = (await liveRows(databaseId)).find((r) => r.title === w.databases.pRow1.title)!
  const [body] = await db.select().from(pages).where(eq(pages.databaseRowId, row.id))
  return body!
}

const attachedOn = (pageId: string) =>
  db
    .select()
    .from(databases)
    .where(and(eq(databases.pageId, pageId), isNull(databases.detachedAt)))

describe('copyDatabase (paste)', () => {
  it('same project: live columns and rows only, bodies keep the same file ids, one audit row on the target', async () => {
    const d = w.databases
    asUser(w.member)
    const mark = await auditCount()
    const filesBefore = await db.select({ id: files.id }).from(files)
    const res = await copyDatabase({
      sourcePageId: w.pages.pPage.id,
      sourceDatabaseId: d.dbP.id,
      targetPageId: w.pages.pChild.id,
    })
    if (!res.ok) throw new Error(res.message)
    const [copied] = await db.select().from(databases).where(eq(databases.id, res.databaseId))
    expect(copied).toMatchObject({ pageId: w.pages.pChild.id, title: d.dbP.title, detachedAt: null })
    expect((await liveColumns(res.databaseId)).map((c) => c.name)).not.toContain(d.dbPColumns.deleted.name)
    expect((await liveRows(res.databaseId)).map((r) => r.title)).not.toContain(d.pRowDeleted.title)
    const body = await bodyOfCopiedRow1(res.databaseId)
    expect(body).toMatchObject({ kind: 'DB_ROW', projectId: w.P.id, createdBy: w.member.id })
    expect(JSON.stringify(body.content)).toContain(`/api/files/${d.pRowImage.id}`)
    expect(await db.select({ id: files.id }).from(files)).toHaveLength(filesBefore.length)
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      entity: 'database',
      action: 'create',
      entityId: res.databaseId,
      projectId: w.P.id,
      summary: th.audit.dbCopied(d.dbP.title),
      after: { copyOf: d.dbP.id },
    })
  })

  it('into the wiki: file bytes are copied to new keys and rows; the source file is untouched', async () => {
    const d = w.databases
    asUser(w.member)
    const res = await copyDatabase({
      sourcePageId: w.pages.pPage.id,
      sourceDatabaseId: d.dbP.id,
      targetPageId: w.pages.wiki.id,
    })
    if (!res.ok) throw new Error(res.message)
    const body = await bodyOfCopiedRow1(res.databaseId)
    expect(body).toMatchObject({ space: 'WORKSPACE', projectId: null })
    const json = JSON.stringify(body.content)
    expect(json).not.toContain(d.pRowImage.id)
    const newId = /\/api\/files\/([0-9a-f-]{36})/.exec(json)![1]!
    const [copy] = await db.select().from(files).where(eq(files.id, newId))
    expect(copy).toMatchObject({ pageId: body.id, projectId: null, uploadedBy: w.member.id, mime: d.pRowImage.mime })
    expect(copy!.storageKey).not.toBe(d.pRowImage.storageKey)
    expect(await getStorage().stream(copy!.storageKey)).not.toBeNull()
    const [source] = await db.select().from(files).where(eq(files.id, d.pRowImage.id))
    expect(source).toMatchObject({ pageId: d.pRowBody.id, projectId: w.P.id, storageKey: d.pRowImage.storageKey })
    expect(body.contentText).toContain('เนื้อหาแถว P-ลับ22')
  })

  it('M11-D12 order: invisible source → NOT_FOUND; page/database mismatch → NOT_FOUND; full target → VALIDATION', async () => {
    const d = w.databases
    asUser(w.outsider)
    expect(
      await copyDatabase({ sourcePageId: w.pages.pPage.id, sourceDatabaseId: d.dbP.id, targetPageId: w.pages.qPage.id }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    asUser(w.member)
    expect(
      await copyDatabase({ sourcePageId: w.pages.pChild.id, sourceDatabaseId: d.dbP.id, targetPageId: w.pages.pChild.id }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    const already = (await attachedOn(w.pages.pChild.id)).length
    for (let i = already; i < 20; i++) await makeDatabase({ page: w.pages.pChild, createdBy: w.manager })
    expect(
      await copyDatabase({ sourcePageId: w.pages.pPage.id, sourceDatabaseId: d.dbP.id, targetPageId: w.pages.pChild.id }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await attachedOn(w.pages.pChild.id)).toHaveLength(20)
  })
})

describe('duplicatePage (FR-1470)', () => {
  it('copies attached databases with their rows; detached ones stay behind', async () => {
    const d = w.databases
    asUser(w.member)
    const res = await duplicatePage({ pageId: w.pages.pPage.id })
    if (!res.ok) throw new Error(res.message)
    const copies = await db.select().from(databases).where(eq(databases.pageId, res.root.id))
    expect(copies.map((c) => c.title)).toEqual([d.dbP.title])
    expect(copies[0]!.id).not.toBe(d.dbP.id)
    const rows = await liveRows(copies[0]!.id)
    expect(rows.map((r) => r.title).sort()).toEqual([d.pRow1.title, d.pRow2.title, d.pRow3.title].sort())
    const bodies = await db.select().from(pages).where(inArray(pages.databaseRowId, rows.map((r) => r.id)))
    expect(bodies).toHaveLength(1)
    expect(JSON.stringify(bodies[0]!.content)).toContain(`/api/files/${d.pRowImage.id}`) // same project → reused
  })
})
