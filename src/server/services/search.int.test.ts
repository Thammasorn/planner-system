// M4 S1.8 — page search (FR-1102/1104/1105 pages part, X68, M4-D19): title hits first, content hits for q ≥ 3,
// visibility in SQL, escaped ILIKE, 8 results, normalised queries.
import { beforeEach, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { GET as searchRoute } from '@/app/api/search/route'
import type { SearchResponse } from '@/lib/contracts/search'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { asUser } from '../../../tests/helpers/as-user'
import { makePage } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'

let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['pages'] })
})

const search = async (q: string, titleOnly = false): Promise<SearchResponse> =>
  okJson<SearchResponse>(
    await callRoute(
      searchRoute,
      `/api/search?q=${encodeURIComponent(q)}${titleOnly ? '&titleOnly=1' : ''}`,
    ),
  )

describe('searchPages', () => {
  it('title hits first, then content hits; 2-char queries and titleOnly skip content', async () => {
    const wikiHit = await makePage({ title: 'ย้ายข้อมูลลูกค้า', createdBy: w.manager })
    const contentHit = await makePage({
      project: w.P,
      title: 'บันทึกประจำสัปดาห์',
      content: [{ type: 'paragraph', content: 'ตรวจสอบลูกค้าเดิมทั้งหมด' }],
      createdBy: w.manager,
    })
    asUser(w.member)
    const res = await search('ลูกค้า')
    expect(res.pages.map((p) => [p.id, p.matchedIn])).toEqual([
      [wikiHit.id, 'title'],
      [contentHit.id, 'content'],
    ])
    expect(res.pages[0]).toMatchObject({ kind: 'page', href: `/p/${wikiHit.id}`, subtitle: th.palette.wiki })
    expect(res.pages[1]).toMatchObject({ subtitle: w.P.name })
    expect((await search('ลู')).pages.every((p) => p.matchedIn === 'title')).toBe(true)
    expect((await search('ลูกค้า', true)).pages.map((p) => p.id)).toEqual([wikiHit.id])
  })

  it('outsider never sees P pages (ids, titles or content)', async () => {
    asUser(w.outsider)
    const res = await search('P-ลับ')
    expect(res.pages).toEqual([])
    const json = JSON.stringify(await search('หน้า'))
    for (const p of [w.pages.pPage, w.pages.pChild, w.pages.pCharter, w.pages.aPage]) {
      expect(json).not.toContain(p.id)
      expect(json).not.toContain(p.title)
    }
    expect(json).toContain(w.pages.qPage.id)
  })

  it('% and _ are literals; deleted pages excluded; archived project pages visible to members', async () => {
    await makePage({ title: 'ส่วนลด 50% ทันที', createdBy: w.manager })
    asUser(w.member)
    expect((await search('%')).pages.map((p) => p.title)).toEqual(['ส่วนลด 50% ทันที'])
    expect((await search('_')).pages).toEqual([])
    expect(JSON.stringify(await search('ลบแล้ว'))).not.toContain(w.deletedPages.pDeleted.id)
    expect((await search('A-ลับ10')).pages.map((p) => p.id)).toEqual([w.pages.aPage.id])
  })

  it('caps at 8 results; queries are normalised (zero-width characters)', async () => {
    for (let i = 0; i < 9; i++) await makePage({ title: `คู่มือย่อย ${i}`, createdBy: w.manager })
    await makePage({ title: 'สอนภาษาไทย', createdBy: w.manager })
    asUser(w.member)
    expect((await search('คู่มือย่อย')).pages).toHaveLength(8)
    expect((await search(' ภาษา\u200Bไทย ')).pages.map((p) => p.title)).toEqual(['สอนภาษาไทย'])
  })

  it('an empty query → 400', async () => {
    asUser(w.member)
    expect((await callRoute(searchRoute, '/api/search?q=')).status).toBe(400)
  })
})
