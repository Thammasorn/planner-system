// M4 S1.6 — edit lease (FR-540–542, X63, M4-D3), lock/keepalive routes (M4-D2/D18) and wiki protection (FR-510).
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { DELETE as unlockRoute, GET as leaseRoute, POST as lockRoute } from '@/app/api/pages/[id]/lock/route'
import { PUT as keepaliveRoute } from '@/app/api/pages/[id]/content/route'
import type { LeaseState, SavePageResult } from '@/lib/contracts/pages'
import { deletePage, savePageContent, setPageProtected } from '../actions/pages'
import { callRoute } from '../../../tests/authz/_support/http'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { pageLocks, pages } from '../db/schema'
import { acquireLease, getLease, LEASE_TTL_SECONDS, releaseLease } from './page-lease'

const S = toSessionUser
let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['pages'] })
})

const acquire = (u: World['lead'], pageId: string, takeover = false): Promise<LeaseState> =>
  db.transaction((tx) => acquireLease(tx, S(u), pageId, { takeover }))

async function expiresAt(pageId: string): Promise<Date> {
  const [r] = await db.select().from(pageLocks).where(eq(pageLocks.pageId, pageId))
  return r!.expiresAt
}

const para = (text: string) => [{ type: 'paragraph' as const, content: text }]

describe('lease service', () => {
  it('acquire, heartbeat, expiry, displacement and takeover (no sleeps)', async () => {
    const id = w.pages.pPage.id
    const first = await acquire(w.lead, id)
    expect(first).toMatchObject({ mine: true, holder: { userId: w.lead.id }, version: 1 })
    const other = await acquire(w.member, id)
    expect(other).toMatchObject({ mine: false, holder: { userId: w.lead.id, name: w.lead.nickname } })
    await db.execute(sql`update page_locks set expires_at = now() + interval '30 seconds' where page_id = ${id}`)
    const before = await expiresAt(id)
    const beat = await acquire(w.lead, id)
    expect(beat.mine).toBe(true)
    expect((await expiresAt(id)).getTime()).toBeGreaterThan(before.getTime())
    // FR-541: the lease runs 2 min from the last heartbeat — both bounds, so a longer TTL fails too.
    expect(LEASE_TTL_SECONDS).toBe(120)
    const ttlLeft = new Date(beat.expiresAt!).getTime() - Date.now()
    expect(ttlLeft).toBeGreaterThan(100_000)
    expect(ttlLeft).toBeLessThan(125_000)
    // FR-541: an expired lease is free
    await db.execute(sql`update page_locks set expires_at = now() - interval '1 second' where page_id = ${id}`)
    expect(await db.transaction((tx) => getLease(tx, S(w.lead), id))).toMatchObject({
      mine: false,
      holder: null,
      expiresAt: null,
    })
    expect(await acquire(w.member, id)).toMatchObject({ mine: true, holder: { userId: w.member.id } })
    expect(await acquire(w.lead, id)).toMatchObject({ mine: false, holder: { userId: w.member.id } }) // displaced
    // FR-542: takeover while member holds a fresh lease
    expect(await acquire(w.lead, id, true)).toMatchObject({ mine: true, holder: { userId: w.lead.id } })
  })

  it('a displaced editor flushes with the current version; the other user then conflicts (FR-542/543)', async () => {
    const id = w.pages.pPage.id
    await acquire(w.lead, id)
    await acquire(w.member, id, true)
    asUser(w.lead)
    expect(await savePageContent({ pageId: id, baseVersion: 1, content: para('flush') })).toMatchObject({
      ok: true,
      version: 2,
      lease: { mine: false, holder: { userId: w.member.id } },
    })
    asUser(w.member)
    expect(await savePageContent({ pageId: id, baseVersion: 1, content: para('old') })).toMatchObject({
      code: 'VERSION_CONFLICT',
      current: { version: 2 },
    })
  })

  it('release by a non-holder leaves the row; deleting the page clears it', async () => {
    const id = w.pages.pPage.id
    await acquire(w.lead, id)
    await db.transaction((tx) => releaseLease(tx, S(w.member), id))
    expect(await db.select().from(pageLocks)).toHaveLength(1)
    asUser(w.member)
    expect(await deletePage({ pageId: id })).toMatchObject({ ok: true })
    expect(await db.select().from(pageLocks)).toHaveLength(0)
  })
})

describe('lock routes', () => {
  const lockPath = (id: string, q = '') => `/api/pages/${id}/lock${q}`
  const post = (id: string, init?: RequestInit, q = '') =>
    callRoute(lockRoute, lockPath(id, q), { id }, { method: 'POST', ...init })

  it('GET / POST / DELETE with authz and the origin guard', async () => {
    asUser(w.lead)
    const evil = await post(w.pages.pPage.id, { headers: { origin: 'https://evil.example' } })
    expect(evil.status).toBe(403)
    const ok = await post(w.pages.pPage.id, { headers: { origin: 'http://t' } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ mine: true })
    asUser(w.member)
    const taken = await post(w.pages.pPage.id, undefined, '?takeover=1')
    expect(await taken.json()).toMatchObject({ mine: true, holder: { userId: w.member.id } })
    const del = await callRoute(unlockRoute, lockPath(w.pages.pPage.id), { id: w.pages.pPage.id }, { method: 'DELETE' })
    expect(del.status).toBe(204)
    expect(await db.select().from(pageLocks)).toHaveLength(0)
    asUser(w.outsider)
    expect((await callRoute(leaseRoute, lockPath(w.pages.pPage.id), { id: w.pages.pPage.id })).status).toBe(404)
    expect((await callRoute(leaseRoute, lockPath('x'), { id: 'x' })).status).toBe(404)
    asUser(w.member)
    expect((await post(w.pages.wikiProtected.id)).status).toBe(403)
    expect((await post(w.pages.aPage.id)).status).toBe(403)
    expect((await callRoute(leaseRoute, lockPath(w.pages.aPage.id), { id: w.pages.aPage.id })).status).toBe(200)
    asUser(w.manager)
    expect((await post(w.pages.wikiProtected.id)).status).toBe(200)
  })

  it('keepalive PUT: stale → 409, current → 200 with one audit row; foreign origin → 403', async () => {
    const id = w.pages.pPage.id
    const put = (body: unknown, headers: Record<string, string> = {}) =>
      callRoute(keepaliveRoute, `/api/pages/${id}/content`, { id }, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', ...headers },
      })
    asUser(w.member)
    const mark = await auditCount()
    expect((await put({ baseVersion: 99, content: para('x') })).status).toBe(409)
    expect((await put({ baseVersion: 1, content: para('x') }, { origin: 'https://evil.example' })).status).toBe(403)
    const res = await put({ baseVersion: 1, content: para('ออกจากหน้า') })
    expect(res.status).toBe(200)
    expect((await res.json()) as SavePageResult).toMatchObject({ version: 2 })
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ entity: 'page', summary: th.audit.pageSaved(w.pages.pPage.title) })
    expect((await put({ baseVersion: 2, content: 'nope' })).status).toBe(400)
    asUser(w.outsider)
    expect((await put({ baseVersion: 2, content: para('x') })).status).toBe(404)
  })
})

describe('protect (FR-510)', () => {
  it('manager protects a wiki page (one audit row); workers 403; PROJECT pages → 400', async () => {
    asUser(w.manager)
    const mark = await auditCount()
    expect(await setPageProtected({ pageId: w.pages.wiki.id, protected: true })).toEqual({ ok: true, changed: true })
    const [r] = await db.select().from(pages).where(eq(pages.id, w.pages.wiki.id))
    expect(r!.locked).toBe(true)
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ summary: th.audit.pageProtected(w.pages.wiki.title) }),
    ])
    expect(await setPageProtected({ pageId: w.pages.wiki.id, protected: true })).toEqual({ ok: true, changed: false })
    expect(await setPageProtected({ pageId: w.pages.pPage.id, protected: true })).toMatchObject({
      code: 'VALIDATION',
      message: th.pages.errors.protectWikiOnly,
    })
    asUser(w.lead)
    expect(await setPageProtected({ pageId: w.pages.wikiProtected.id, protected: false })).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await setPageProtected({ pageId: w.pages.pPage.id, protected: true })).toMatchObject({ code: 'FORBIDDEN' })
  })
})
