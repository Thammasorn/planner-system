// M6.1 S1.2 / S1.3 — TASK pages stay out of every document path (SPEC §4.6.4 FR-682, AC-628, M6.1-D4/D13, X48):
// trees and sibling keys see kind = 'DOC' only, page search / titles never show a body, and every document-only
// page API addressed at a TASK page is a 404 for everyone.
import { and, eq, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as searchRoute } from '@/app/api/search/route'
import { GET as treeRoute } from '@/app/api/pages/tree/route'
import type { SearchResponse } from '@/lib/contracts/search'
import {
  applyTemplate,
  createPage,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
  restorePageBatch,
  setPageCover,
  setPageIcon,
  setPageProtected,
} from '../actions/pages'
import { deleteTaskTree } from '../actions/tasks'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount } from '../../../tests/helpers/audit'
import { makeTask, makeTaskBody } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { pages } from '../db/schema'
import * as pagesRepo from '../repo/pages'
import { getPageTitles } from './pages'
import { listTree } from './page-tree'

const S = toSessionUser
let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['taskBodies'] })
})

describe('trees and sibling keys (FR-682, X48)', () => {
  it('a project with 3 task bodies: the tree root lists only DOC pages; has_children ignores bodies', async () => {
    for (const name of ['งาน B1', 'งาน B2']) {
      const t = await makeTask({ project: w.P, name, createdBy: w.manager })
      await makeTaskBody({ task: t, content: `เนื้อหา ${name}`, createdBy: w.manager })
    }
    const roots = await listTree(db, S(w.member), { space: 'PROJECT', projectId: w.P.id })
    expect(roots.nodes.map((n) => n.id)).toEqual([w.pages.pCharter.id, w.pages.pPage.id])
    expect(roots.nodes.every((n) => n.title !== '')).toBe(true)
    const json = JSON.stringify(roots)
    expect(json).not.toContain(w.taskBodies.pLeafBody.id)
    // The sibling scope (keys, append target) ignores the 'a0' bodies.
    const scope = { space: 'PROJECT' as const, projectId: w.P.id, parentId: null }
    expect((await pagesRepo.liveSiblings(db, scope)).map((s) => s.id)).toEqual([
      w.pages.pCharter.id,
      w.pages.pPage.id,
    ])
    expect((await pagesRepo.lastLiveSibling(db, scope))?.id).toBe(w.pages.pPage.id)
  })

  it('a new DOC page is keyed after the last DOC sibling; a TASK page is never a valid afterId', async () => {
    asUser(w.member)
    const res = await createPage({ space: 'PROJECT', projectId: w.P.id, parentId: null })
    if (!res.ok) throw new Error(res.code)
    const roots = await listTree(db, S(w.member), { space: 'PROJECT', projectId: w.P.id })
    expect(roots.nodes.map((n) => n.id)).toEqual([w.pages.pCharter.id, w.pages.pPage.id, res.page.id])
    expect(res.page.position > w.pages.pPage.position).toBe(true)
    const stale = await createPage({
      space: 'PROJECT',
      projectId: w.P.id,
      parentId: null,
      afterId: w.taskBodies.pLeafBody.id,
    })
    expect(stale).toMatchObject({ ok: false, code: 'CONFLICT' })
  })

  it('tree parentId = a TASK page → 404 for everyone (TB-TREE-PARENT)', async () => {
    for (const u of [w.manager, w.lead, w.member, w.outsider]) {
      asUser(u)
      const res = await callRoute(
        treeRoute,
        `/api/pages/tree?space=PROJECT&projectId=${w.P.id}&parentId=${w.taskBodies.pLeafBody.id}`,
      )
      expect(res.status).toBe(404)
    }
  })
})

describe('document-only page APIs on a TASK page → 404 (FR-682, M6.1-D4)', () => {
  it('rename / icon / cover / protect / template / move / duplicate / delete / create-child, even for the manager', async () => {
    const id = w.taskBodies.pLeafBody.id
    const before = await auditCount()
    for (const u of [w.manager, w.member, w.outsider]) {
      asUser(u)
      const results = [
        await renamePage({ pageId: id, title: 'x' }),
        await setPageIcon({ pageId: id, icon: '📄' }),
        await setPageCover({ pageId: id, fileId: null }),
        await setPageProtected({ pageId: id, protected: true }),
        await applyTemplate({ pageId: id, baseVersion: 1, template: 'sop' }),
        await movePage({ pageId: id, parentId: null, afterId: null }),
        await movePage({ pageId: id, parentId: w.pages.pPage.id, afterId: null }),
        await movePage({ pageId: w.pages.pChild.id, parentId: id, afterId: null }),
        await duplicatePage({ pageId: id }),
        await deletePage({ pageId: id }),
        await createPage({ space: 'PROJECT', projectId: w.P.id, parentId: id }),
      ]
      for (const r of results) expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    }
    expect(await auditCount()).toBe(before)
    const [row] = await db.select().from(pages).where(eq(pages.id, id))
    expect(row).toMatchObject({ title: '', icon: null, locked: false, parentId: null, deletedAt: null })
  })

  it('restorePageBatch with a task delete batch → 404, the body stays deleted (TB-RESTORE-PAGEBATCH)', async () => {
    asUser(w.member)
    const del = await deleteTaskTree({ taskIds: [w.tasks.pLeaf.id] })
    if (!del.ok) throw new Error(del.code)
    expect(await pagesRepo.listBatch(db, del.batch)).toEqual([])
    for (const u of [w.manager, w.member]) {
      asUser(u)
      expect(await restorePageBatch({ batch: del.batch })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    }
    const live = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.id, w.taskBodies.pLeafBody.id), isNull(pages.deletedAt)))
    expect(live).toEqual([])
  })
})

describe('titles and page search (FR-682, AC-628)', () => {
  it('getPageTitles of a TASK page id → visible:false, for the manager too', async () => {
    for (const u of [w.manager, w.member]) {
      const res = await getPageTitles(db, S(u), [w.taskBodies.pLeafBody.id, w.pages.pPage.id])
      expect(res.items[0]).toEqual({ id: w.taskBodies.pLeafBody.id, visible: false })
      expect(res.items[1]).toMatchObject({ visible: true, title: w.pages.pPage.title })
    }
  })

  it('a word only in a task body is not in the pages group (title or content)', async () => {
    asUser(w.manager)
    const res = await okJson<SearchResponse>(
      await callRoute(searchRoute, `/api/search?q=${encodeURIComponent('P-ลับ11')}`),
    )
    expect(res.pages).toEqual([])
    const all = await okJson<SearchResponse>(
      await callRoute(searchRoute, `/api/search?q=${encodeURIComponent('รายละเอียด')}`),
    )
    expect(all.pages.map((p) => p.id)).not.toContain(w.taskBodies.pLeafBody.id)
  })
})
