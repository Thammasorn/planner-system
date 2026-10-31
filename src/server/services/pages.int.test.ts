// M4 S1.3 / S1.4 — page create, header fields, templates, content save, titles (FR-504/506/507/529/531/543,
// M4-D4/D7/D9/D20/D28/D29/D31/D32/D38, X63).
import { asc, eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { formatThaiDate } from '@/lib/format'
import {
  applyTemplate,
  createPage,
  renamePage,
  savePageContent,
  setPageCover,
  setPageIcon,
} from '../actions/pages'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makePage } from '../../../tests/helpers/factories'
import { testCache } from '../../../tests/helpers/request'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { pages, type PageRow } from '../db/schema'
import { acquireLease } from './page-lease'
import { getPageTitles, getPageView } from './pages'

const S = toSessionUser
let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['pages', 'files'] })
})

async function row(id: string): Promise<PageRow> {
  const [r] = await db.select().from(pages).where(eq(pages.id, id))
  return r!
}

async function liveRootTitles(projectId: string): Promise<string[]> {
  const rows = await db
    .select({ title: pages.title })
    .from(pages)
    .where(sql`${pages.projectId} = ${projectId} and ${pages.parentId} is null and ${pages.deletedAt} is null`)
    .orderBy(asc(pages.position), asc(pages.id))
  return rows.map((r) => r.title)
}

const para = (text: string) => [{ type: 'paragraph' as const, content: text }]

/** A WORKSPACE chain root → … → depth `n` (returns the deepest page). */
async function chain(n: number): Promise<PageRow> {
  let cur = await makePage({ title: 'ลึก 0', createdBy: w.manager })
  for (let d = 1; d <= n; d++) cur = await makePage({ parent: cur, title: `ลึก ${d}`, createdBy: w.manager })
  return cur
}

describe('create', () => {
  it('member appends a P root (depth 0, after pPage) with one audit row; child of pChild → depth 2', async () => {
    asUser(w.member)
    const mark = await auditCount()
    const res = await createPage({ space: 'PROJECT', projectId: w.P.id, parentId: null })
    if (!res.ok) throw new Error(res.message)
    expect(res.href).toBe(`/p/${res.page.id}`)
    expect(res.page).toMatchObject({ depth: 0, title: '', hasChildren: false, isCharter: false })
    expect(await liveRootTitles(w.P.id)).toEqual([w.pages.pCharter.title, w.pages.pPage.title, ''])
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      entity: 'page',
      action: 'create',
      entityId: res.page.id,
      projectId: w.P.id,
      summary: th.audit.pageCreated(''),
    })
    const child = await createPage({ space: 'PROJECT', projectId: w.P.id, parentId: w.pages.pChild.id })
    expect(child).toMatchObject({ ok: true, page: { depth: 2, parentId: w.pages.pChild.id } })
    const first = await createPage({ space: 'PROJECT', projectId: w.P.id, parentId: null, afterId: null })
    if (!first.ok) throw new Error(first.message)
    expect((await liveRootTitles(w.P.id))[0]).toBe('')
    expect(testCache.refresh).not.toHaveBeenCalled()
  })

  it('depth 9 parent → VALIDATION maxDepth; foreign afterId → CONFLICT', async () => {
    const deep = await chain(9)
    asUser(w.member)
    expect(await createPage({ space: 'WORKSPACE', projectId: null, parentId: deep.id })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.pages.errors.maxDepth,
    })
    expect(
      await createPage({ space: 'PROJECT', projectId: w.P.id, parentId: null, afterId: w.pages.pChild.id }),
    ).toMatchObject({ ok: false, code: 'CONFLICT', message: th.pages.errors.treeChanged })
  })

  it('two concurrent appends under one parent get distinct, ordered keys', async () => {
    asUser(w.member)
    const [a, b] = await Promise.all([
      createPage({ space: 'PROJECT', projectId: w.P.id, parentId: w.pages.pPage.id }),
      createPage({ space: 'PROJECT', projectId: w.P.id, parentId: w.pages.pPage.id }),
    ])
    if (!a.ok || !b.ok) throw new Error('create failed')
    expect(a.page.position).not.toBe(b.page.position)
    const kids = await db
      .select({ id: pages.id, position: pages.position })
      .from(pages)
      .where(eq(pages.parentId, w.pages.pPage.id))
      .orderBy(asc(pages.position), asc(pages.id))
    expect(kids.map((k) => k.id)[0]).toBe(w.pages.pChild.id)
    expect(new Set(kids.map((k) => k.position)).size).toBe(3)
  })

  it('authz: outsider in P → 404, member in A → 403, anyone at the wiki root, worker under wikiProtected → 403', async () => {
    asUser(w.outsider)
    expect(await createPage({ space: 'PROJECT', projectId: w.P.id, parentId: null })).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await createPage({ space: 'WORKSPACE', projectId: null, parentId: null })).toMatchObject({ ok: true })
    asUser(w.member)
    expect(await createPage({ space: 'PROJECT', projectId: w.A.id, parentId: null })).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(
      await createPage({ space: 'WORKSPACE', projectId: null, parentId: w.pages.wikiProtected.id }),
    ).toMatchObject({ code: 'FORBIDDEN' })
    asUser(w.manager)
    expect(
      await createPage({ space: 'WORKSPACE', projectId: null, parentId: w.pages.wikiProtected.id }),
    ).toMatchObject({ ok: true, page: { effectiveProtected: true, locked: false } })
  })
})

describe('save', () => {
  it('bumps the version, stores content_text, audits without content; a stale base → VERSION_CONFLICT', async () => {
    asUser(w.member)
    const mark = await auditCount()
    const res = await savePageContent({ pageId: w.pages.pPage.id, baseVersion: 1, content: para('เนื้อหาใหม่') })
    expect(res).toMatchObject({ ok: true, version: 2 })
    const r = await row(w.pages.pPage.id)
    expect(r.version).toBe(2)
    expect(r.contentText).toBe('เนื้อหาใหม่')
    expect(r.updatedBy).toBe(w.member.id)
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      entity: 'page',
      action: 'update',
      projectId: w.P.id,
      summary: th.audit.pageSaved(w.pages.pPage.title),
      after: { version: 2 },
    })
    expect(JSON.stringify(audits[0])).not.toContain('content')
    expect(JSON.stringify(audits[0])).not.toContain('เนื้อหาใหม่')
    const stale = await savePageContent({ pageId: w.pages.pPage.id, baseVersion: 1, content: para('x') })
    expect(stale).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', current: { version: 2 } })
    expect((await row(w.pages.pPage.id)).contentText).toBe('เนื้อหาใหม่')
    expect(testCache.refresh).not.toHaveBeenCalled()
  })

  it('external images become links; javascript: links and oversized docs are rejected', async () => {
    asUser(w.member)
    const res = await savePageContent({
      pageId: w.pages.pPage.id,
      baseVersion: 1,
      content: [{ type: 'image', props: { url: 'https://example.com/a.png', name: 'a.png' } }],
    })
    expect(res).toMatchObject({ ok: true })
    const stored = (await row(w.pages.pPage.id)).content as { type: string; content: unknown }[]
    expect(stored[0]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'link', href: 'https://example.com/a.png' }],
    })
    expect(
      await savePageContent({
        pageId: w.pages.pPage.id,
        baseVersion: 2,
        content: [{ type: 'paragraph', content: [{ type: 'link', href: 'javascript:alert(1)', content: 'x' }] }],
      }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
    const big = Array.from({ length: 23 }, () => ({ type: 'paragraph', content: 'ก'.repeat(90_000) }))
    const tooLarge = await savePageContent({ pageId: w.pages.pPage.id, baseVersion: 2, content: big })
    expect(tooLarge).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(JSON.stringify(tooLarge)).toContain(th.pages.errors.contentTooLarge)
  })

  it('a soft-deleted page → 404; an editor without the lease saves with the current version (X63)', async () => {
    asUser(w.member)
    expect(
      await savePageContent({ pageId: w.deletedPages.pDeleted.id, baseVersion: 1, content: para('x') }),
    ).toMatchObject({ code: 'NOT_FOUND' })
    await db.transaction((tx) => acquireLease(tx, S(w.lead), w.pages.pPage.id, { takeover: false }))
    const res = await savePageContent({ pageId: w.pages.pPage.id, baseVersion: 1, content: para('ของสมาชิก') })
    expect(res).toMatchObject({ ok: true, version: 2, lease: { mine: false, holder: { userId: w.lead.id } } })
  })

  it('workers cannot save protected or archived pages', async () => {
    asUser(w.member)
    expect(
      await savePageContent({ pageId: w.pages.wikiProtectedChild.id, baseVersion: 1, content: para('x') }),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      await savePageContent({ pageId: w.pages.aPage.id, baseVersion: 1, content: para('x') }),
    ).toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('header', () => {
  it('rename trims, caps at 200, never bumps the version; one audit row from the action', async () => {
    asUser(w.member)
    const mark = await auditCount()
    expect(await renamePage({ pageId: w.pages.pPage.id, title: '  ชื่อใหม่  ' })).toEqual({
      ok: true,
      title: 'ชื่อใหม่',
    })
    const r = await row(w.pages.pPage.id)
    expect(r).toMatchObject({ title: 'ชื่อใหม่', version: 1 })
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      summary: th.audit.pageRenamed(w.pages.pPage.title, 'ชื่อใหม่'),
      before: { title: w.pages.pPage.title },
      after: { title: 'ชื่อใหม่' },
    })
    expect(await renamePage({ pageId: w.pages.pPage.id, title: 'ก'.repeat(201) })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await renamePage({ pageId: w.pages.pPage.id, title: 'ก'.repeat(200) })).toMatchObject({ ok: true })
    expect(testCache.refresh).not.toHaveBeenCalled()
  })

  it('icon must be curated; covers must be IMAGE files of the same project', async () => {
    asUser(w.member)
    expect(await setPageIcon({ pageId: w.pages.pPage.id, icon: 'x' as '📌' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await setPageIcon({ pageId: w.pages.pPage.id, icon: '📌' })).toEqual({ ok: true, icon: '📌' })
    expect(await setPageCover({ pageId: w.pages.pPage.id, fileId: w.files.pPdf.id })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.pages.errors.coverNotImage,
    })
    expect(await setPageCover({ pageId: w.pages.pPage.id, fileId: w.files.qFile.id })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    const ok = await setPageCover({ pageId: w.pages.pPage.id, fileId: w.files.pImage.id })
    expect(ok).toEqual({ ok: true, cover: { fileId: w.files.pImage.id, url: `/api/files/${w.files.pImage.id}` } })
    expect((await row(w.pages.pPage.id)).version).toBe(1)
    expect(await setPageCover({ pageId: w.pages.pPage.id, fileId: null })).toEqual({ ok: true, cover: null })
    expect(testCache.refresh).not.toHaveBeenCalled()
  })
})

describe('template', () => {
  it('meeting on a blank page: dated title, 📝, version 2; sop → empty title, 📘; non-blank → conflict', async () => {
    vi.stubEnv('ALLOW_TEST_HOOKS', '1')
    vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
    const blank = await makePage({ project: w.P, title: '', createdBy: w.member })
    asUser(w.member)
    const res = await applyTemplate({ pageId: blank.id, baseVersion: 1, template: 'meeting' })
    const title = th.pages.meetingTitle(formatThaiDate('2026-09-30', 'medium'))
    expect(formatThaiDate('2026-09-30', 'medium')).toBe('30 ก.ย. 2569')
    expect(res).toEqual({ ok: true, version: 2, title, icon: '📝' })
    const r = await row(blank.id)
    expect(r).toMatchObject({ title, icon: '📝', version: 2 })
    expect(r.contentText).toContain('วาระ')
    const sop = await makePage({ title: '', createdBy: w.member })
    expect(await applyTemplate({ pageId: sop.id, baseVersion: 1, template: 'sop' })).toEqual({
      ok: true,
      version: 2,
      title: '',
      icon: '📘',
    })
    expect(await applyTemplate({ pageId: w.pages.pPage.id, baseVersion: 1, template: 'sop' })).toMatchObject({
      ok: false,
      code: 'VERSION_CONFLICT',
    })
  })
})

describe('view', () => {
  it('PageView: breadcrumb (ancestors only), can flags, cover url, updatedBy name', async () => {
    const v = await getPageView(db, S(w.member), w.pages.pChild.id)
    expect(v.breadcrumb).toEqual([{ id: w.pages.pPage.id, title: w.pages.pPage.title, icon: null }])
    expect(v.page).toMatchObject({ projectName: w.P.name, depth: 1, projectArchived: false, version: 1 })
    expect(v.can).toEqual({ edit: true, protect: false, delete: true, createChild: true, move: true, duplicate: true })
    const charter = await getPageView(db, S(w.member), w.pages.pCharter.id)
    expect(charter.can.delete).toBe(false)
    const folder = await getPageView(db, S(w.member), w.pages.wikiFolder.id)
    expect(folder.can).toMatchObject({ edit: true, delete: false })
    const prot = await getPageView(db, S(w.member), w.pages.wikiProtectedChild.id)
    expect(prot.can).toMatchObject({ edit: false, createChild: false, duplicate: false })
    expect(prot.page.effectiveProtected).toBe(true)
    const m = await getPageView(db, S(w.manager), w.pages.wiki.id)
    expect(m.can).toMatchObject({ edit: true, protect: true })
    const arch = await getPageView(db, S(w.member), w.pages.aPage.id)
    expect(arch.can.edit).toBe(false)
    expect(arch.page.projectArchived).toBe(true)
    await expect(getPageView(db, S(w.outsider), w.pages.pPage.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('titles', () => {
  it('masks invisible pages, flags deleted visible ones, never leaks a title', async () => {
    const random = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const ids = [w.pages.pPage.id, w.pages.qPage.id, w.pages.wiki.id, w.deletedPages.pDeleted.id, random]
    const out = await getPageTitles(db, S(w.outsider), ids)
    expect(out.items).toEqual([
      { id: w.pages.pPage.id, visible: false },
      { id: w.pages.qPage.id, visible: true, deleted: false, title: w.pages.qPage.title, icon: null },
      { id: w.pages.wiki.id, visible: true, deleted: false, title: w.pages.wiki.title, icon: null },
      { id: w.deletedPages.pDeleted.id, visible: false },
      { id: random, visible: false },
    ])
    const json = JSON.stringify(out)
    expect(json).not.toContain(w.pages.pPage.title)
    expect(json).not.toContain(w.deletedPages.pDeleted.title)
    const member = await getPageTitles(db, S(w.member), [w.deletedPages.pDeleted.id])
    expect(member.items).toEqual([{ id: w.deletedPages.pDeleted.id, visible: true, deleted: true }])
  })
})
