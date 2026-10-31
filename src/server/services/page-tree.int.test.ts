// M4 S1.4 / S1.5 — tree listing, move, duplicate, delete, restore (FR-502/503/508/509, M4-D21/D22/D23/D24/D31, X63).
import { asc, count, eq, inArray, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { deletePage, duplicatePage, movePage, restorePageBatch } from '../actions/pages'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makePage } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { files, pageLocks, pages, type PageRow } from '../db/schema'
import { NotFoundError } from '../errors'
import { acquireLease } from './page-lease'
import { listTree } from './page-tree'

const S = toSessionUser
let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['pages', 'files'] })
})

async function row(id: string): Promise<PageRow> {
  const [r] = await db.select().from(pages).where(eq(pages.id, id))
  return r!
}

async function liveChildren(projectId: string | null, parentId: string | null): Promise<PageRow[]> {
  return db
    .select()
    .from(pages)
    .where(
      sql`${projectId === null ? sql`${pages.projectId} is null` : sql`${pages.projectId} = ${projectId}`}
        and ${parentId === null ? sql`${pages.parentId} is null` : sql`${pages.parentId} = ${parentId}`}
        and ${pages.deletedAt} is null`,
    )
    .orderBy(asc(pages.position), asc(pages.id))
}

describe('list', () => {
  it('P roots in order with hasChildren; children of pPage; outsider → 404', async () => {
    const roots = await listTree(db, S(w.member), { space: 'PROJECT', projectId: w.P.id })
    expect(roots.nodes.map((n) => n.id)).toEqual([w.pages.pCharter.id, w.pages.pPage.id])
    expect(roots.nodes[1]).toMatchObject({ hasChildren: true, isCharter: false, effectiveProtected: false })
    expect(roots.nodes[0]).toMatchObject({ isCharter: true, hasChildren: false })
    expect(roots.canCreate).toBe(true)
    const kids = await listTree(db, S(w.member), { space: 'PROJECT', projectId: w.P.id, parentId: w.pages.pPage.id })
    expect(kids.nodes.map((n) => n.id)).toEqual([w.pages.pChild.id])
    await expect(listTree(db, S(w.outsider), { space: 'PROJECT', projectId: w.P.id })).rejects.toBeInstanceOf(
      NotFoundError,
    )
    const arch = await listTree(db, S(w.member), { space: 'PROJECT', projectId: w.A.id })
    expect(arch.canCreate).toBe(false)
  })

  it('wiki: protection flags, inherited for children; deleted roots never listed; cross-space parent → 404', async () => {
    const roots = await listTree(db, S(w.outsider), { space: 'WORKSPACE' })
    const ids = roots.nodes.map((n) => n.id)
    expect(ids).toEqual([w.pages.wiki.id, w.pages.wikiProtected.id, w.pages.wikiFolder.id])
    expect(ids).not.toContain(w.deletedPages.wikiDeleted.id)
    expect(roots.nodes[1]).toMatchObject({ locked: true, effectiveProtected: true })
    const kids = await listTree(db, S(w.member), { space: 'WORKSPACE', parentId: w.pages.wikiProtected.id })
    expect(kids.nodes).toEqual([
      expect.objectContaining({ id: w.pages.wikiProtectedChild.id, locked: false, effectiveProtected: true }),
    ])
    expect(kids.canCreate).toBe(false)
    expect(
      (await listTree(db, S(w.manager), { space: 'WORKSPACE', parentId: w.pages.wikiProtected.id })).canCreate,
    ).toBe(true)
    await expect(
      listTree(db, S(w.member), { space: 'WORKSPACE', parentId: w.pages.pPage.id }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('move', () => {
  it('pChild to the root after pPage → depth 0 and the new order; descendants shift; one audit row', async () => {
    const grand = await makePage({ parent: w.pages.pChild, title: 'หลาน', createdBy: w.manager })
    asUser(w.member)
    const mark = await auditCount()
    const res = await movePage({ pageId: w.pages.pChild.id, parentId: null, afterId: w.pages.pPage.id })
    expect(res).toMatchObject({ ok: true, fromParentId: w.pages.pPage.id, page: { depth: 0, parentId: null } })
    expect((await liveChildren(w.P.id, null)).map((p) => p.id)).toEqual([
      w.pages.pCharter.id,
      w.pages.pPage.id,
      w.pages.pChild.id,
    ])
    expect((await row(grand.id)).depth).toBe(1)
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ entity: 'page', summary: th.audit.pageMoved(w.pages.pChild.title) })
  })

  it('cycle, cross-space, charter, depth and stale afterId are refused', async () => {
    asUser(w.member)
    expect(await movePage({ pageId: w.pages.pPage.id, parentId: w.pages.pChild.id, afterId: null })).toMatchObject({
      code: 'VALIDATION',
      message: th.pages.errors.cycle,
    })
    expect(await movePage({ pageId: w.pages.pPage.id, parentId: w.pages.wiki.id, afterId: null })).toMatchObject({
      code: 'VALIDATION',
      message: th.pages.errors.crossSpace,
    })
    expect(
      await movePage({ pageId: w.pages.pCharter.id, parentId: w.pages.pPage.id, afterId: null }),
    ).toMatchObject({ code: 'VALIDATION', message: th.pages.errors.charterRootOnly })
    // depth-8 parent + a 2-level subtree (pPage → pChild) → would end at 10
    let deep = await makePage({ project: w.P, title: 'd0', createdBy: w.manager })
    for (let d = 1; d <= 8; d++) deep = await makePage({ parent: deep, title: `d${d}`, createdBy: w.manager })
    expect(await movePage({ pageId: w.pages.pPage.id, parentId: deep.id, afterId: null })).toMatchObject({
      code: 'VALIDATION',
      message: th.pages.errors.maxDepth,
    })
    expect(
      await movePage({ pageId: w.pages.pChild.id, parentId: null, afterId: w.pages.wiki.id }),
    ).toMatchObject({ code: 'CONFLICT', message: th.pages.errors.treeChanged })
    asUser(w.lead)
    expect(await movePage({ pageId: w.pages.pChild.id, parentId: w.pages.qPage.id, afterId: null })).toMatchObject({
      code: 'NOT_FOUND',
    })
    asUser(w.manager)
    expect(await movePage({ pageId: w.pages.pChild.id, parentId: w.pages.qPage.id, afterId: null })).toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('protection: workers cannot move protected pages or into them; managers can', async () => {
    asUser(w.member)
    expect(
      await movePage({ pageId: w.pages.wikiProtectedChild.id, parentId: null, afterId: null }),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(await movePage({ pageId: w.pages.wiki.id, parentId: w.pages.wikiProtected.id, afterId: null })).toMatchObject(
      { code: 'FORBIDDEN' },
    )
    expect(await movePage({ pageId: w.pages.wikiFolder.id, parentId: w.pages.wiki.id, afterId: null })).toMatchObject({
      code: 'FORBIDDEN',
      message: th.pages.errors.subtreeProtected,
    })
    asUser(w.manager)
    const res = await movePage({ pageId: w.pages.wiki.id, parentId: w.pages.wikiProtected.id, afterId: null })
    expect(res).toMatchObject({ ok: true, page: { depth: 1, effectiveProtected: true } })
    expect((await row(w.pages.wikiChild.id)).depth).toBe(2)
  })
})

describe('duplicate', () => {
  it('pPage with a subpage card → 2 copies after pPage, card remapped, files untouched', async () => {
    await db
      .update(pages)
      .set({ content: [{ type: 'subpage', props: { pageId: w.pages.pChild.id } }] })
      .where(eq(pages.id, w.pages.pPage.id))
    const [{ n: filesBefore }] = (await db.select({ n: count() }).from(files)) as [{ n: number }]
    asUser(w.member)
    const mark = await auditCount()
    const res = await duplicatePage({ pageId: w.pages.pPage.id })
    if (!res.ok) throw new Error(res.message)
    expect(res).toMatchObject({ count: 2, space: 'PROJECT', projectId: w.P.id })
    expect(res.root).toMatchObject({ title: th.pages.copyTitle(w.pages.pPage.title), hasChildren: true, depth: 0 })
    expect((await liveChildren(w.P.id, null)).map((p) => p.id)).toEqual([
      w.pages.pCharter.id,
      w.pages.pPage.id,
      res.root.id,
    ])
    const [copiedChild] = await liveChildren(w.P.id, res.root.id)
    expect(copiedChild).toMatchObject({ title: w.pages.pChild.title, depth: 1, version: 1, isCharter: false })
    const copiedRoot = await row(res.root.id)
    expect(copiedRoot.content).toEqual([
      expect.objectContaining({ type: 'subpage', props: { pageId: copiedChild!.id } }),
    ])
    expect(copiedRoot).toMatchObject({ version: 1, locked: false, createdBy: w.member.id })
    const [{ n: filesAfter }] = (await db.select({ n: count() }).from(files)) as [{ n: number }]
    expect(filesAfter).toBe(filesBefore)
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ summary: th.audit.pageDuplicated(w.pages.pPage.title, 2) })
  })

  it('a charter copy is a normal page; outsider → 404; under a protected parent → 403 for workers', async () => {
    asUser(w.manager)
    const res = await duplicatePage({ pageId: w.pages.pCharter.id })
    if (!res.ok) throw new Error(res.message)
    expect(res.root.isCharter).toBe(false)
    expect((await row(w.pages.pCharter.id)).isCharter).toBe(true)
    asUser(w.outsider)
    expect(await duplicatePage({ pageId: w.pages.pPage.id })).toMatchObject({ code: 'NOT_FOUND' })
    asUser(w.member)
    expect(await duplicatePage({ pageId: w.pages.wikiProtectedChild.id })).toMatchObject({ code: 'FORBIDDEN' })
    expect(await duplicatePage({ pageId: w.pages.aPage.id })).toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('delete / restore', () => {
  it('delete pPage → one batch for pPage + pChild, leases gone, count 1; restore brings both back in order', async () => {
    await db.transaction(async (tx) => {
      await acquireLease(tx, S(w.member), w.pages.pPage.id, { takeover: false })
      await acquireLease(tx, S(w.lead), w.pages.pChild.id, { takeover: false })
    })
    asUser(w.member)
    const mark = await auditCount()
    const res = await deletePage({ pageId: w.pages.pPage.id })
    if (!res.ok) throw new Error(res.message)
    expect(res).toMatchObject({ count: 1, title: w.pages.pPage.title, parentId: null, projectId: w.P.id })
    const [a, b] = [await row(w.pages.pPage.id), await row(w.pages.pChild.id)]
    expect(a.deletedBatch).toBe(res.batch)
    expect(b.deletedBatch).toBe(res.batch)
    expect(
      await db.select().from(pageLocks).where(inArray(pageLocks.pageId, [a.id, b.id])),
    ).toEqual([])
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ action: 'delete', summary: th.audit.pageDeleted(w.pages.pPage.title, 2) }),
    ])
    const back = await restorePageBatch({ batch: res.batch })
    expect(back).toMatchObject({ ok: true, space: 'PROJECT', projectId: w.P.id })
    if (!back.ok) throw new Error(back.message)
    expect(new Set(back.restoredIds)).toEqual(new Set([a.id, b.id]))
    expect((await liveChildren(w.P.id, null)).map((p) => p.id)).toEqual([w.pages.pCharter.id, w.pages.pPage.id])
    expect((await row(w.pages.pChild.id)).deletedAt).toBeNull()
  })

  it('charter (even for managers), protected subtrees and archived projects cannot be deleted; wiki by anyone', async () => {
    asUser(w.manager)
    expect(await deletePage({ pageId: w.pages.pCharter.id })).toMatchObject({
      code: 'FORBIDDEN',
      message: th.pages.errors.charterNotDeletable,
    })
    asUser(w.member)
    expect(await deletePage({ pageId: w.pages.wikiFolder.id })).toMatchObject({
      code: 'FORBIDDEN',
      message: th.pages.errors.subtreeProtected,
    })
    expect(await deletePage({ pageId: w.pages.aPage.id })).toMatchObject({ code: 'FORBIDDEN' })
    asUser(w.outsider)
    expect(await deletePage({ pageId: w.pages.wiki.id })).toMatchObject({ ok: true, count: 1 })
  })

  it('restore: expired → CONFLICT, parent deleted → CONFLICT, archived → 403, invisible → 404, unknown → 404', async () => {
    asUser(w.member)
    expect(await restorePageBatch({ batch: w.batches.pOldDeletedPage })).toMatchObject({
      code: 'CONFLICT',
      message: th.pages.errors.restore.failed(th.pages.errors.restore.expired),
    })
    const child = await deletePage({ pageId: w.pages.pChild.id })
    const parent = await deletePage({ pageId: w.pages.pPage.id })
    if (!child.ok || !parent.ok) throw new Error('delete failed')
    expect(await restorePageBatch({ batch: child.batch })).toMatchObject({
      code: 'CONFLICT',
      message: th.pages.errors.restore.failed(th.pages.errors.restore.parentDeleted),
    })
    expect(await restorePageBatch({ batch: parent.batch })).toMatchObject({ ok: true })
    expect(await restorePageBatch({ batch: child.batch })).toMatchObject({ ok: true })
    expect((await row(w.pages.pChild.id)).deletedAt).toBeNull()
    expect(await restorePageBatch({ batch: w.batches.aDeletedPage })).toMatchObject({ code: 'FORBIDDEN' })
    asUser(w.outsider)
    expect(await restorePageBatch({ batch: w.batches.pDeletedPage })).toMatchObject({ code: 'NOT_FOUND' })
    expect(await restorePageBatch({ batch: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })).toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('restore under a protected parent: workers 403, managers ok; depth recomputed from the parent', async () => {
    asUser(w.manager)
    const del = await deletePage({ pageId: w.pages.wikiProtectedChild.id })
    if (!del.ok) throw new Error(del.message)
    asUser(w.member)
    expect(await restorePageBatch({ batch: del.batch })).toMatchObject({ code: 'FORBIDDEN' })
    asUser(w.manager)
    expect(await restorePageBatch({ batch: del.batch })).toMatchObject({ ok: true })
    expect((await row(w.pages.wikiProtectedChild.id)).depth).toBe(1)
  })
})
