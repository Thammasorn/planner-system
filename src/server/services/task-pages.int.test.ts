// M6.1 S1.4–S1.9 — task bodies (TASK pages): the page view of a body, ensureTaskBody, the body read + `/t` loader,
// save rules + audit, lease / files on bodies, and the shared full-width switch (SPEC §4.6.4 FR-680…693, FR-1602,
// §7.7; M6.1-D5/D6/D7/D9/D10/D15; X42/X44/X63/X86).
import { and, count, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { GET as downloadRoute } from '@/app/api/files/[id]/route'
import { POST as uploadRoute } from '@/app/api/files/route'
import { PUT as keepaliveRoute } from '@/app/api/pages/[id]/content/route'
import { DELETE as unlockRoute, GET as leaseRoute, POST as lockRoute } from '@/app/api/pages/[id]/lock/route'
import { GET as pageRoute } from '@/app/api/pages/[id]/route'
import { GET as bodyRoute } from '@/app/api/tasks/[id]/body/route'
import type { LeaseState, PageView } from '@/lib/contracts/pages'
import type { TaskBodyView } from '@/lib/contracts/task-pages'
import type { UploadedFileDTO } from '@/lib/contracts/files'
import { duplicatePage, savePageContent, setPageFullWidth } from '../actions/pages'
import { ensureTaskBody } from '../actions/task-pages'
import { createTask, setTaskStatus, updateTask } from '../actions/tasks'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeTask } from '../../../tests/helpers/factories'
import { PNG_1X1, uploadRequest } from '../../../tests/helpers/files'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { files, pages, tasks, type PageRow } from '../db/schema'
import { taskIdOfTaskPage } from '../page-helpers'
import { getPageView } from './pages'
import { getTaskBodyView, getTaskPageView } from './task-pages'

const S = toSessionUser
let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['taskBodies'] })
})

const para = (text: string) => [{ type: 'paragraph' as const, content: text }]

async function bodyOf(taskId: string): Promise<PageRow[]> {
  return db.select().from(pages).where(eq(pages.taskId, taskId))
}

async function pageRow(id: string): Promise<PageRow> {
  const [r] = await db.select().from(pages).where(eq(pages.id, id))
  return r!
}

describe('page view of a TASK page (M6.1-D5)', () => {
  it('kind TASK, taskId, title = the task name, no breadcrumb, edit only; renames follow the task', async () => {
    const v = await getPageView(db, S(w.member), w.taskBodies.pLeafBody.id)
    expect(v.page).toMatchObject({
      id: w.taskBodies.pLeafBody.id,
      kind: 'TASK',
      taskId: w.tasks.pLeaf.id,
      title: w.tasks.pLeaf.name,
      fullWidth: false,
      projectId: w.P.id,
      projectName: w.P.name,
      isBlank: false,
    })
    expect(v.breadcrumb).toEqual([])
    expect(v.can).toEqual({ edit: true, protect: false, delete: false, createChild: false, move: false, duplicate: false })
    expect(taskIdOfTaskPage(v)).toBe(w.tasks.pLeaf.id)
    await db.update(tasks).set({ name: 'ชื่อใหม่' }).where(eq(tasks.id, w.tasks.pLeaf.id))
    expect((await getPageView(db, S(w.manager), w.taskBodies.pLeafBody.id)).page.title).toBe('ชื่อใหม่')
  })

  it('archived body: readable, can.edit false; outsider 404; DOC pages carry kind/taskId/fullWidth', async () => {
    const arch = await getPageView(db, S(w.manager), w.taskBodies.aTaskBody.id)
    expect(arch.page).toMatchObject({ kind: 'TASK', projectArchived: true })
    expect(arch.can.edit).toBe(false)
    await expect(getPageView(db, S(w.outsider), w.taskBodies.pLeafBody.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    const doc = await getPageView(db, S(w.member), w.pages.pPage.id)
    expect(doc.page).toMatchObject({ kind: 'DOC', taskId: null, fullWidth: false })
    expect(taskIdOfTaskPage(doc)).toBeNull()
  })

  it('GET /api/pages/[id] serves the body to members (editor reload), 404 to the outsider', async () => {
    asUser(w.lead)
    const v = await okJson<PageView>(
      await callRoute(pageRoute, `/api/pages/${w.taskBodies.pLeafBody.id}`, { id: w.taskBodies.pLeafBody.id }),
    )
    expect(v.page).toMatchObject({ kind: 'TASK', taskId: w.tasks.pLeaf.id })
    asUser(w.outsider)
    const res = await callRoute(pageRoute, `/api/pages/${w.taskBodies.pLeafBody.id}`, {
      id: w.taskBodies.pLeafBody.id,
    })
    expect(res.status).toBe(404)
  })
})

describe('ensureTaskBody (FR-681, M6.1-D6)', () => {
  it('first call creates an empty TASK page + one audit row; the second returns it without audit', async () => {
    asUser(w.member)
    const mark = await auditCount()
    const first = await ensureTaskBody({ taskId: w.tasks.pChildB.id })
    if (!first.ok) throw new Error(first.code)
    expect(first).toMatchObject({ version: 1, created: true })
    const [row] = await bodyOf(w.tasks.pChildB.id)
    expect(row).toMatchObject({
      id: first.pageId,
      kind: 'TASK',
      space: 'PROJECT',
      projectId: w.P.id,
      parentId: null,
      depth: 0,
      title: '',
      position: 'a0',
      content: [],
      contentText: '',
      createdBy: w.member.id,
      deletedAt: null,
    })
    const audits = await auditRowsAfter(mark)
    expect(audits).toEqual([
      expect.objectContaining({
        entity: 'page',
        action: 'create',
        entityId: first.pageId,
        projectId: w.P.id,
        summary: th.audit.taskBodyCreated(w.tasks.pChildB.name),
        after: { taskId: w.tasks.pChildB.id },
      }),
    ])
    const again = await ensureTaskBody({ taskId: w.tasks.pChildB.id })
    expect(again).toMatchObject({ ok: true, pageId: first.pageId, version: 1, created: false })
    const existing = await ensureTaskBody({ taskId: w.tasks.pLeaf.id })
    expect(existing).toMatchObject({ ok: true, pageId: w.taskBodies.pLeafBody.id, created: false })
    expect(await auditRowsAfter(mark)).toHaveLength(1)
  })

  it('two concurrent calls → one row, both succeed (R7)', async () => {
    asUser(w.lead)
    const [a, b] = await Promise.all([
      ensureTaskBody({ taskId: w.tasks.pChildB.id }),
      ensureTaskBody({ taskId: w.tasks.pChildB.id }),
    ])
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.pageId).toBe(b.pageId)
    expect([a.created, b.created].sort()).toEqual([false, true])
    expect(await bodyOf(w.tasks.pChildB.id)).toHaveLength(1)
  })

  it('archived → 403; outsider / deleted task → 404; malformed → 400', async () => {
    asUser(w.manager)
    expect(await ensureTaskBody({ taskId: w.tasks.aTask2.id })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    asUser(w.outsider)
    expect(await ensureTaskBody({ taskId: w.tasks.pChildB.id })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    asUser(w.member)
    expect(await ensureTaskBody({ taskId: 'x' })).toMatchObject({ ok: false, code: 'VALIDATION' })
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, w.tasks.pChildB.id))
    expect(await ensureTaskBody({ taskId: w.tasks.pChildB.id })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await bodyOf(w.tasks.pChildB.id)).toEqual([])
    expect(await bodyOf(w.tasks.aTask2.id)).toEqual([])
  })

  it('a soft-deleted body of a live task is revived (defensive), same id', async () => {
    await db
      .update(pages)
      .set({ deletedAt: new Date(), deletedBatch: crypto.randomUUID() })
      .where(eq(pages.id, w.taskBodies.pLeafBody.id))
    asUser(w.member)
    const r = await ensureTaskBody({ taskId: w.tasks.pLeaf.id })
    expect(r).toMatchObject({ ok: true, pageId: w.taskBodies.pLeafBody.id, created: false })
    expect(await pageRow(w.taskBodies.pLeafBody.id)).toMatchObject({ deletedAt: null, deletedBatch: null })
  })

  it('quick add (createTask) inserts no pages row (AC-627)', async () => {
    asUser(w.member)
    const before = await db.select({ n: count() }).from(pages)
    const r = await createTask({ projectId: w.P.id, name: 'งานด่วน' })
    if (!r.ok) throw new Error(r.code)
    expect(r.task.hasBody).toBe(false)
    expect(await bodyOf(r.task.id)).toEqual([])
    expect(await db.select({ n: count() }).from(pages)).toEqual(before)
  })
})

describe('body read + task page loader (M6.1-D7)', () => {
  const getBody = (id: string): Promise<Response> => callRoute(bodyRoute, `/api/tasks/${id}/body`, { id })

  it('GET /api/tasks/[id]/body: page null without a row; the body with its content; archived can.edit false', async () => {
    asUser(w.member)
    const none = await okJson<TaskBodyView>(await getBody(w.tasks.pChildB.id))
    expect(none).toMatchObject({ taskId: w.tasks.pChildB.id, projectId: w.P.id, page: null, can: { edit: true } })
    expect(none.uploadLimits.imageBytes).toBeGreaterThan(0)
    const full = await okJson<TaskBodyView>(await getBody(w.tasks.pLeaf.id))
    expect(full.page).toEqual({
      id: w.taskBodies.pLeafBody.id,
      version: 1,
      content: w.taskBodies.pLeafBody.content,
      fullWidth: false,
      isBlank: false,
    })
    asUser(w.manager)
    const arch = await okJson<TaskBodyView>(await getBody(w.tasks.aTask.id))
    expect(arch.can.edit).toBe(false)
    expect(arch.page?.id).toBe(w.taskBodies.aTaskBody.id)
  })

  it('outsider, malformed, unknown and deleted tasks → 404; a deleted body reads as page null', async () => {
    asUser(w.outsider)
    expect((await getBody(w.tasks.pLeaf.id)).status).toBe(404)
    asUser(w.member)
    expect((await getBody('not-a-uuid')).status).toBe(404)
    expect((await getBody(crypto.randomUUID())).status).toBe(404)
    await db.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, w.taskBodies.pLeafBody.id))
    expect((await okJson<TaskBodyView>(await getBody(w.tasks.pLeaf.id))).page).toBeNull()
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, w.tasks.pLeaf.id))
    expect((await getBody(w.tasks.pLeaf.id)).status).toBe(404)
  })

  it('getTaskPageView: task, project, ancestors root → parent, body; outsider / malformed 404', async () => {
    const grandchild = await makeTask({
      project: w.P,
      parent: w.tasks.pChildB,
      name: 'หลาน P',
      createdBy: w.manager,
    })
    const v = await getTaskPageView(db, S(w.member), grandchild.id)
    expect(v.task).toEqual({ id: grandchild.id, name: 'หลาน P', projectId: w.P.id })
    expect(v.project).toEqual({ id: w.P.id, name: w.P.name, color: w.P.color, archived: false })
    expect(v.ancestors).toEqual([
      { id: w.tasks.pParent.id, name: w.tasks.pParent.name },
      { id: w.tasks.pChildB.id, name: w.tasks.pChildB.name },
    ])
    expect(v.body).toMatchObject({ taskId: grandchild.id, page: null, can: { edit: true } })
    const leaf = await getTaskPageView(db, S(w.lead), w.tasks.pLeaf.id)
    expect(leaf.ancestors).toEqual([])
    expect(leaf.body.page?.id).toBe(w.taskBodies.pLeafBody.id)
    const arch = await getTaskPageView(db, S(w.member), w.tasks.aTask.id)
    expect(arch.project.archived).toBe(true)
    expect(arch.body.can.edit).toBe(false)
    await expect(getTaskPageView(db, S(w.outsider), w.tasks.pLeaf.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(getTaskPageView(db, S(w.member), 'not-a-uuid')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('saves on TASK pages (FR-680, FR-693, M6.1-D9/D10)', () => {
  const subpage = (pageId: string) => ({ type: 'subpage' as const, props: { pageId } })

  it('a member saves the body: audited without content, summary taskBodySaved, project P', async () => {
    asUser(w.member)
    const mark = await auditCount()
    const r = await savePageContent({
      pageId: w.taskBodies.pLeafBody.id,
      baseVersion: 1,
      content: para('ขอบเขต ลับมาก'),
    })
    expect(r).toMatchObject({ ok: true, version: 2 })
    const audits = await auditRowsAfter(mark)
    expect(audits).toEqual([
      expect.objectContaining({
        entity: 'page',
        action: 'update',
        entityId: w.taskBodies.pLeafBody.id,
        projectId: w.P.id,
        summary: th.audit.taskBodySaved(w.tasks.pLeaf.name),
        after: { version: 2, taskId: w.tasks.pLeaf.id },
      }),
    ])
    expect(JSON.stringify(audits)).not.toContain('ลับมาก')
    expect(await pageRow(w.taskBodies.pLeafBody.id)).toMatchObject({ contentText: 'ขอบเขต ลับมาก', version: 2 })
  })

  it('subpage blocks (top level or nested) → VALIDATION subpageNotAllowed; DOC pages still accept them', async () => {
    asUser(w.member)
    const msg = th.editor.errors.subpageNotAllowed
    const top = await savePageContent({
      pageId: w.taskBodies.pLeafBody.id,
      baseVersion: 1,
      content: [subpage(w.pages.pChild.id)],
    })
    expect(top).toMatchObject({ ok: false, code: 'VALIDATION', fieldErrors: { content: [msg] } })
    const nested = await savePageContent({
      pageId: w.taskBodies.pLeafBody.id,
      baseVersion: 1,
      content: [{ type: 'bulletListItem', content: 'x', children: [subpage(w.pages.pChild.id)] }],
    })
    expect(nested).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect((await pageRow(w.taskBodies.pLeafBody.id)).version).toBe(1)
    const doc = await savePageContent({ pageId: w.pages.pPage.id, baseVersion: 1, content: [subpage(w.pages.pChild.id)] })
    expect(doc).toMatchObject({ ok: true })
  })

  it('keepalive PUT: audited like the action; subpage → 400; archived 403; outsider 404', async () => {
    const put = (u: World['member'], id: string, body: unknown): Promise<Response> => {
      asUser(u)
      return callRoute(keepaliveRoute, `/api/pages/${id}/content`, { id }, {
        method: 'PUT',
        headers: { origin: 'http://t', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    const mark = await auditCount()
    expect((await put(w.lead, w.taskBodies.pLeafBody.id, { baseVersion: 1, content: para('ก่อนออก') })).status).toBe(
      200,
    )
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'page',
        projectId: w.P.id,
        summary: th.audit.taskBodySaved(w.tasks.pLeaf.name),
        after: { version: 2, taskId: w.tasks.pLeaf.id },
      }),
    ])
    const sub = { baseVersion: 2, content: [subpage(w.pages.pChild.id)] }
    expect((await put(w.lead, w.taskBodies.pLeafBody.id, sub)).status).toBe(400)
    expect((await put(w.member, w.taskBodies.aTaskBody.id, { baseVersion: 1, content: para('x') })).status).toBe(403)
    expect((await put(w.outsider, w.taskBodies.pLeafBody.id, { baseVersion: 2, content: para('x') })).status).toBe(
      404,
    )
  })

  it('archived body save → 403; outsider → 404', async () => {
    asUser(w.member)
    expect(
      await savePageContent({ pageId: w.taskBodies.aTaskBody.id, baseVersion: 1, content: para('x') }),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    asUser(w.outsider)
    expect(
      await savePageContent({ pageId: w.taskBodies.pLeafBody.id, baseVersion: 1, content: para('x') }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })
})

describe('lease on a body covers the body only (FR-688, X63)', () => {
  const lockPath = (id: string) => `/api/pages/${id}/lock`
  const post = (u: World['member'], id: string): Promise<Response> => {
    asUser(u)
    return callRoute(lockRoute, lockPath(id), { id }, { method: 'POST', headers: { origin: 'http://t' } })
  }

  it('lead holds the body lease; member still edits properties and may save with the current version', async () => {
    const id = w.taskBodies.pLeafBody.id
    const held = await okJson<LeaseState>(await post(w.lead, id))
    expect(held).toMatchObject({ mine: true, holder: { userId: w.lead.id } })
    asUser(w.member)
    const state = await okJson<LeaseState>(await callRoute(leaseRoute, lockPath(id), { id }))
    expect(state).toMatchObject({ mine: false, holder: { userId: w.lead.id } })
    expect(await updateTask({ taskId: w.tasks.pLeaf.id, patch: { dueDate: '2026-10-16' } })).toMatchObject({
      ok: true,
    })
    expect(
      await setTaskStatus({ taskIds: [w.tasks.pLeaf.id], statusId: w.statuses.P.doing.id }),
    ).toMatchObject({ ok: true })
    expect(await savePageContent({ pageId: id, baseVersion: 1, content: para('ของ Ivy') })).toMatchObject({
      ok: true,
      version: 2,
    })
    asUser(w.lead)
    const del = await callRoute(unlockRoute, lockPath(id), { id }, { method: 'DELETE', headers: { origin: 'http://t' } })
    expect(del.status).toBe(204)
  })

  it('archived body lease → 403; outsider → 404 on GET and POST', async () => {
    expect((await post(w.member, w.taskBodies.aTaskBody.id)).status).toBe(403)
    expect((await post(w.outsider, w.taskBodies.pLeafBody.id)).status).toBe(404)
    asUser(w.outsider)
    const id = w.taskBodies.pLeafBody.id
    expect((await callRoute(leaseRoute, lockPath(id), { id })).status).toBe(404)
  })
})

describe('files on TASK pages (AC-624, S1.8)', () => {
  const upload = async (pageId: string): Promise<Response> =>
    uploadRoute(await uploadRequest({ pageId, name: 'a.png', bytes: PNG_1X1 }), { params: Promise.resolve({}) })
  const download = (id: string): Promise<Response> => callRoute(downloadRoute, `/api/files/${id}`, { id })

  it('member uploads to the body → stored on project P, audited; outsider uploads/downloads → 404', async () => {
    asUser(w.member)
    const mark = await auditCount()
    const res = await upload(w.taskBodies.pLeafBody.id)
    expect(res.status).toBe(201)
    const dto = (await res.json()) as UploadedFileDTO
    const [row] = await db.select().from(files).where(eq(files.id, dto.id))
    expect(row).toMatchObject({ projectId: w.P.id, pageId: w.taskBodies.pLeafBody.id })
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ entity: 'file', action: 'create', projectId: w.P.id }),
    ])
    expect((await download(w.taskBodies.pLeafBodyImage.id)).status).toBe(200)
    asUser(w.outsider)
    expect((await upload(w.taskBodies.pLeafBody.id)).status).toBe(404)
    expect((await download(w.taskBodies.pLeafBodyImage.id)).status).toBe(404)
    expect((await download(dto.id)).status).toBe(404)
  })

  it('archived body upload → 403 for members and the manager', async () => {
    for (const u of [w.member, w.manager]) {
      asUser(u)
      expect((await upload(w.taskBodies.aTaskBody.id)).status).toBe(403)
    }
  })
})

describe('setPageFullWidth (FR-1602, M6.1-D15)', () => {
  it('DOC page on / no-op / off: one audit row per change, none for the no-op', async () => {
    asUser(w.member)
    const mark = await auditCount()
    const on = await setPageFullWidth({ pageId: w.pages.pPage.id, fullWidth: true })
    expect(on).toEqual({ ok: true, pageId: w.pages.pPage.id, fullWidth: true, changed: true })
    const same = await setPageFullWidth({ pageId: w.pages.pPage.id, fullWidth: true })
    expect(same).toMatchObject({ ok: true, changed: false })
    const off = await setPageFullWidth({ pageId: w.pages.pPage.id, fullWidth: false })
    expect(off).toMatchObject({ ok: true, fullWidth: false, changed: true })
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'page',
        action: 'update',
        entityId: w.pages.pPage.id,
        projectId: w.P.id,
        summary: th.audit.pageFullWidthOn(w.pages.pPage.title),
        before: { fullWidth: false },
        after: { fullWidth: true },
      }),
      expect.objectContaining({ summary: th.audit.pageFullWidthOff(w.pages.pPage.title) }),
    ])
    expect((await pageRow(w.pages.pPage.id)).version).toBe(1) // not a content save
  })

  it('protected wiki: manager ok, workers 403; archived 403; outsider 404 on P, ok on the open wiki', async () => {
    asUser(w.manager)
    expect(await setPageFullWidth({ pageId: w.pages.wikiProtected.id, fullWidth: true })).toMatchObject({
      ok: true,
      changed: true,
    })
    asUser(w.member)
    expect(await setPageFullWidth({ pageId: w.pages.wikiProtected.id, fullWidth: false })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(await setPageFullWidth({ pageId: w.pages.aPage.id, fullWidth: true })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    asUser(w.outsider)
    expect(await setPageFullWidth({ pageId: w.pages.pPage.id, fullWidth: true })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    const mark = await auditCount()
    expect(await setPageFullWidth({ pageId: w.pages.wiki.id, fullWidth: true })).toMatchObject({ ok: true })
    expect(await auditRowsAfter(mark)).toEqual([expect.objectContaining({ entity: 'page', projectId: null })])
  })

  it('task with a body: toggles it (summary = task name); pageId of a TASK page → 404', async () => {
    asUser(w.lead)
    const mark = await auditCount()
    const r = await setPageFullWidth({ taskId: w.tasks.pLeaf.id, fullWidth: true })
    expect(r).toEqual({ ok: true, pageId: w.taskBodies.pLeafBody.id, fullWidth: true, changed: true })
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'page',
        action: 'update',
        entityId: w.taskBodies.pLeafBody.id,
        projectId: w.P.id,
        summary: th.audit.pageFullWidthOn(w.tasks.pLeaf.name),
      }),
    ])
    expect(await setPageFullWidth({ pageId: w.taskBodies.pLeafBody.id, fullWidth: false })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
  })

  it('task without a body: the body is created silently, exactly one audit row (FW-TASK-NEW)', async () => {
    asUser(w.member)
    const mark = await auditCount()
    const r = await setPageFullWidth({ taskId: w.tasks.pChildB.id, fullWidth: true })
    if (!r.ok) throw new Error(r.code)
    expect(r).toMatchObject({ fullWidth: true, changed: true })
    const [row] = await bodyOf(w.tasks.pChildB.id)
    expect(row).toMatchObject({ id: r.pageId, kind: 'TASK', fullWidth: true })
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: 'update', summary: th.audit.pageFullWidthOn(w.tasks.pChildB.name) })
  })

  it('archived task 403; outsider 404; both / no ids → 400', async () => {
    asUser(w.member)
    expect(await setPageFullWidth({ taskId: w.tasks.aTask.id, fullWidth: true })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(
      await setPageFullWidth({ pageId: w.pages.pPage.id, taskId: w.tasks.pLeaf.id, fullWidth: true }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await setPageFullWidth({ fullWidth: true })).toMatchObject({ ok: false, code: 'VALIDATION' })
    asUser(w.outsider)
    expect(await setPageFullWidth({ taskId: w.tasks.pLeaf.id, fullWidth: true })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    expect(await bodyOf(w.tasks.aTask2.id)).toEqual([])
  })

  it('the value is shared (another viewer sees it) and duplicatePage copies it', async () => {
    asUser(w.lead)
    await setPageFullWidth({ pageId: w.pages.pPage.id, fullWidth: true })
    await setPageFullWidth({ taskId: w.tasks.pLeaf.id, fullWidth: true })
    expect((await getPageView(db, S(w.member), w.pages.pPage.id)).page.fullWidth).toBe(true)
    expect((await getTaskBodyView(db, S(w.manager), w.tasks.pLeaf.id)).page?.fullWidth).toBe(true)
    const dup = await duplicatePage({ pageId: w.pages.pPage.id })
    if (!dup.ok) throw new Error(dup.code)
    expect((await pageRow(dup.root.id)).fullWidth).toBe(true)
    const copies = await db
      .select({ fullWidth: pages.fullWidth })
      .from(pages)
      .where(and(eq(pages.parentId, dup.root.id)))
    expect(copies).toEqual([{ fullWidth: false }]) // pChild's copy keeps its own value
  })
})
