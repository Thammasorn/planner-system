// M11 (plan/m11 §7.1 AC-1408; M11-D28, FR-1474) — the databases group of Cmd/Ctrl+K: database titles, then row titles,
// then row bodies (q ≥ 3); ≤ 8; titleOnly → []; only attached databases whose owner page is live and visible (TASK
// owners: href /t/<task>). Cell values are never searched.
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as searchRoute } from '@/app/api/search/route'
import type { DatabaseSearchHit, SearchAllResponse } from '@/lib/contracts/search'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { makeDatabase, makeDbRow, makeRowBody } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { searchDatabases } from './search'

let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['databases'] })
})

const search = async (q: string, titleOnly = false): Promise<SearchAllResponse> =>
  okJson<SearchAllResponse>(
    await callRoute(
      searchRoute,
      `/api/search?q=${encodeURIComponent(q)}${titleOnly ? '&titleOnly=1' : ''}`,
    ),
  )

const shape = (hits: DatabaseSearchHit[]) => hits.map((h) => [h.matchedIn, h.databaseId, h.rowId])

describe('searchDatabases (M11-D28)', () => {
  it('the three tiers carry the hit shape: database title, row title, row body (cells never searched)', async () => {
    const d = w.databases
    const P = w.pages.pPage
    asUser(w.member)
    expect((await search('ฐานข้อมูล P-ลับ20')).databases).toEqual([
      {
        kind: 'database',
        rowId: null,
        databaseId: d.dbP.id,
        pageId: P.id,
        rowTitle: null,
        databaseTitle: d.dbP.title,
        pageTitle: P.title,
        trail: [],
        matchedIn: 'database',
        href: `/p/${P.id}?db=${d.dbP.id}`,
      },
    ])
    expect((await search('แถว P-ลับ21')).databases).toEqual([
      expect.objectContaining({
        matchedIn: 'row',
        rowId: d.pRow1.id,
        rowTitle: 'แถว P-ลับ21',
        href: `/p/${P.id}?db=${d.dbP.id}&row=${d.pRow1.id}`,
      }),
    ])
    expect(shape((await search('เนื้อหาแถว P-ลับ22')).databases)).toEqual([['content', d.dbP.id, d.pRow1.id]])
    expect((await search('ค่าเซลล์ P-ลับ28')).databases).toEqual([]) // FR-1474: cell values are not searched
    // a database on a task body links through the task
    const taskHit = (await search('ฐานข้อมูลงาน P')).databases
    expect(taskHit).toHaveLength(1)
    expect(taskHit[0]!.href).toBe(`/t/${w.taskBodies.pLeafBody.taskId}?db=${d.dbTask.id}`)
  })

  it('ranks database titles, then row titles, then bodies; a row matched by title is not repeated as content', async () => {
    const by = { createdBy: w.manager }
    const made = await makeDatabase({ page: w.pages.pChild, title: 'คลังสูตรเคมี', ...by })
    const titled = await makeDbRow({ database: made.database, title: 'คลังสูตรเคมี แถว', ...by })
    await makeRowBody({ row: titled, content: 'คลังสูตรเคมี ในเนื้อหา' })
    const bodied = await makeDbRow({ database: made.database, title: 'อื่น ๆ', ...by })
    await makeRowBody({ row: bodied, content: 'บันทึก คลังสูตรเคมี' })
    asUser(w.member)
    expect(shape((await search('คลังสูตรเคมี')).databases)).toEqual([
      ['database', made.database.id, null],
      ['row', made.database.id, titled.id],
      ['content', made.database.id, bodied.id],
    ])
  })

  it('row bodies need q ≥ 3 characters; deleted rows and deleted bodies are not found', async () => {
    const by = { createdBy: w.manager }
    const made = await makeDatabase({ page: w.pages.pChild, title: 'ตาราง', ...by })
    const row = await makeDbRow({ database: made.database, title: 'แถวหนึ่ง', ...by })
    await makeRowBody({ row, content: 'รหัส Qz9 ภายใน' })
    asUser(w.member)
    expect((await search('Qz')).databases).toEqual([])
    expect(shape((await search('Qz9')).databases)).toEqual([['content', made.database.id, row.id]])
    // the world's soft-deleted row (+ body) of dbP
    expect((await search('แถวลบแล้ว P')).databases).toEqual([])
    expect((await search('เนื้อหาแถวที่ลบ P')).databases).toEqual([])
  })

  it('caps at 8 hits; titleOnly (mention menu) returns no databases', async () => {
    for (let i = 0; i < 9; i++) {
      await makeDatabase({ page: w.pages.pChild, title: `ทะเบียนครุภัณฑ์ ${i}`, createdBy: w.manager })
    }
    asUser(w.member)
    const hits = (await search('ทะเบียนครุภัณฑ์')).databases
    expect(hits).toHaveLength(8)
    expect(hits.every((h) => h.matchedIn === 'database')).toBe(true)
    expect((await search('ทะเบียนครุภัณฑ์', true)).databases).toEqual([])
    expect((await search('ฐานข้อมูล P-ลับ20', true)).databases).toEqual([])
  })

  it('detached databases and deleted owner pages are hidden, even from a manager', async () => {
    const d = w.databases
    asUser(w.manager)
    expect((await search('ฐานข้อมูลหลุด P')).databases).toEqual([])
    expect((await search('ฐานข้อมูลในหน้าที่ลบ P')).databases).toEqual([])
    const all = await db.transaction((tx) => searchDatabases(tx, toSessionUser(w.manager), 'ฐานข้อมูล'))
    const ids = all.map((h) => h.databaseId)
    expect(ids).not.toContain(d.dbPDetached.id)
    expect(ids).not.toContain(d.dbDeletedPage.id)
    expect(ids).toEqual(expect.arrayContaining([d.dbP.id, d.dbQ.id, d.dbA.id, d.dbWiki.id, d.dbTask.id]))
  })

  it('owner pages the viewer cannot see are filtered in SQL: no ids or titles leak', async () => {
    const d = w.databases
    asUser(w.outsider)
    const res = await search('ฐานข้อมูล')
    const ids = res.databases.map((h) => h.databaseId)
    expect(ids).toEqual(expect.arrayContaining([d.dbQ.id, d.dbWiki.id]))
    const json = JSON.stringify(res)
    for (const x of [d.dbP, d.dbA, d.dbTask, d.dbPDetached]) {
      expect(json).not.toContain(x.id)
      expect(json).not.toContain(x.title)
    }
    expect((await search('แถว P-ลับ21')).databases).toEqual([])
    expect((await search('เนื้อหาแถว P-ลับ22')).databases).toEqual([])
    expect((await search('แถว A-ลับ27')).databases).toEqual([])
    // the member of P sees archived A's database
    asUser(w.member)
    expect(shape((await search('ฐานข้อมูล A-ลับ26')).databases)).toEqual([['database', d.dbA.id, null]])
  })
})
