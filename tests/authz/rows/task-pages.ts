// PERM-27 (เปิด task เป็นหน้า / ดูเนื้อหางาน = ดู task), PERM-28 (แก้เนื้อหางาน = แก้ task, archived → 403), PERM-16/18/19
// full width (FR-1602), PERM-16 page APIs addressed at a TASK page (FR-682 → 404 for everyone), the task search group
// (FR-690) and the removed `notes` field (FR-692) — SPEC §3.2, §4.6.4, §7.7, §8.12; plan/m06.1-task-page-ui.md §7.2
// (keys TP-*, TB-*, FW-*, SR-TASKS-*, T-UPDATE-NOTES), written from SPEC before S1's bodies exist (PLAN §4.1).
// World 'taskBodies' (S0.15): pLeafBody (P, text + image pLeafBodyImage), aTaskBody (archived A), qTaskBody (Q);
// pChildB and aTask2 have no body. "P-audit" = exactly one `page` audit row with project_id = P (the matrix checks it).
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { PageView, SetPageFullWidthResult } from '@/lib/contracts/pages'
import type { SearchResponse } from '@/lib/contracts/search'
import type { EnsureTaskBodyResult, TaskBodyView } from '@/lib/contracts/task-pages'
import {
  applyTemplate,
  createPage,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
  restorePageBatch,
  savePageContent,
  setPageCover,
  setPageFullWidth as fullWidthAction,
  setPageIcon,
  setPageProtected,
} from '@/server/actions/pages'
import { updateTask } from '@/server/actions/tasks'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { makeTaskBody, type TestUser } from '../../helpers/factories'
import { PNG_1X1 } from '../../helpers/files'
import type { World } from '../../helpers/world'
import { loaderOutcome } from '../_support/loader'
import { assertNoLeak } from '../_support/leak'
import { defineRow, type AuthzRow } from '../types'
import {
  currentVersion,
  fileGet,
  keepalive,
  lockCall,
  pageGet,
  para,
  searchGet,
  treeGet,
  upload,
} from './_m4'
import {
  ALL,
  ARCH_WRITE,
  auditFileA,
  auditFileP,
  auditPageA,
  auditPageP,
  auditPageWiki,
  auditTaskP,
  bodyGet,
  each,
  ensure,
  fullWidth,
  MGR,
  pageRow,
  PROJ,
  PROJ_400,
  subpageContent,
  TASKB,
  taskPagesOf,
} from './_m6_1'

const isOutsider = (w: World, actor: TestUser): boolean => actor.id === w.outsider.id

/** Body assertions on a 200 `TaskBodyView` (M6.1-D7). */
async function checkedBody(
  res: Response,
  want: { taskId: string; projectId: string; pageId: string | null; canEdit: boolean },
): Promise<Response> {
  if (res.status === 200) {
    const body = (await res.clone().json()) as TaskBodyView
    expect(body.taskId).toBe(want.taskId)
    expect(body.projectId).toBe(want.projectId)
    expect(body.page?.id ?? null).toBe(want.pageId)
    expect(body.can.edit).toBe(want.canEdit)
  }
  return res
}

/** A soft-deleted task (w.deletedTasks.pDeleted) whose body sits in the task's delete batch (FR-689 shape). */
const deletedTaskWithBody = async (w: World): Promise<{ bodyId: string }> => {
  const t = w.deletedTasks.pDeleted
  const body = await makeTaskBody({
    task: t,
    content: 'รายละเอียดของงานที่ลบ P-ลับ14',
    deleted: { batch: w.batches.pDeletedTask, daysAgo: 1 },
  })
  return { bodyId: body.id }
}

/** Allowed full-width toggles report the new value and a change (M6.1-D15). */
const checkedFullWidth = (r: ActionResult<SetPageFullWidthResult>): ActionResult<SetPageFullWidthResult> => {
  if (r.ok) {
    expect(r.fullWidth).toBe(true)
    expect(r.changed).toBe(true)
  }
  return r
}

export const rows: AuthzRow[] = [
  // ── /t/[taskId] loader (PERM-27, X56/X57, X86) ───────────────────────────────────────────────────────────────
  defineRow({
    id: 'TP-LOADER',
    spec: 'PERM-27 §3.2 เปิด task เป็นหน้า — /t/{pLeaf} loader (task, project, ancestors, body)',
    action: 'services.taskPages.getTaskPageView',
    mutates: false,
    with: TASKB,
    expect: PROJ,
    run: (w) =>
      loaderOutcome(async (user) => {
        const v = await services.taskPages.getTaskPageView(db, user, w.tasks.pLeaf.id)
        expect(v.task).toMatchObject({ id: w.tasks.pLeaf.id, name: w.tasks.pLeaf.name, projectId: w.P.id })
        expect(v.project).toMatchObject({ id: w.P.id, name: w.P.name, archived: false })
        expect(v.ancestors).toEqual([])
        expect(v.body.page?.id).toBe(w.taskBodies.pLeafBody.id)
        expect(v.body.can.edit).toBe(true)
        return v
      }),
  }),
  defineRow({
    id: 'TP-LOADER-CHILD',
    spec: 'PERM-27 + FR-683 — /t/{pChildB}: breadcrumb ancestors root → parent; no body row yet (page null)',
    action: 'services.taskPages.getTaskPageView',
    mutates: false,
    with: TASKB,
    expect: PROJ,
    run: (w) =>
      loaderOutcome(async (user) => {
        const v = await services.taskPages.getTaskPageView(db, user, w.tasks.pChildB.id)
        expect(v.ancestors).toEqual([{ id: w.tasks.pParent.id, name: w.tasks.pParent.name }])
        expect(v.body.page).toBeNull()
        return v
      }),
  }),
  defineRow({
    id: 'TP-LOADER-ARCH',
    spec: 'PERM-27 + X42 — /t/{aTask} of archived A is readable; the body is not editable',
    action: 'services.taskPages.getTaskPageView',
    mutates: false,
    with: TASKB,
    expect: PROJ,
    run: (w) =>
      loaderOutcome(async (user) => {
        const v = await services.taskPages.getTaskPageView(db, user, w.tasks.aTask.id)
        expect(v.project).toMatchObject({ id: w.A.id, archived: true })
        expect(v.body.page?.id).toBe(w.taskBodies.aTaskBody.id)
        expect(v.body.can.edit).toBe(false)
        return v
      }),
  }),
  defineRow({
    id: 'TP-LOADER-MISSING',
    spec: 'X86 — /t/{random uuid} is a 404 for everyone',
    action: 'services.taskPages.getTaskPageView',
    mutates: false,
    with: TASKB,
    expect: each('404'),
    run: () => loaderOutcome((user) => services.taskPages.getTaskPageView(db, user, randomUUID())),
  }),
  defineRow({
    id: 'TP-LOADER-BAD',
    spec: 'X86 — /t/not-a-uuid is a 404 for everyone (never a 22P02 → 500)',
    action: 'services.taskPages.getTaskPageView',
    mutates: false,
    with: TASKB,
    expect: each('404'),
    run: () => loaderOutcome((user) => services.taskPages.getTaskPageView(db, user, 'not-a-uuid')),
  }),
  defineRow({
    id: 'TP-LOADER-DELETED',
    spec: 'PERM-27 + FR-689 — /t of a soft-deleted task is a 404 for everyone',
    action: 'services.taskPages.getTaskPageView',
    mutates: false,
    with: TASKB,
    expect: each('404'),
    setup: deletedTaskWithBody,
    run: (w) => loaderOutcome((user) => services.taskPages.getTaskPageView(db, user, w.deletedTasks.pDeleted.id)),
  }),

  // ── GET /api/tasks/[id]/body (PERM-27, M6.1-D7) ──────────────────────────────────────────────────────────────
  defineRow({
    id: 'TB-GET',
    spec: 'PERM-27 §3.2 ดูเนื้อหางาน — GET /api/tasks/{pLeaf}/body',
    action: 'GET /api/tasks/[id]/body',
    mutates: false,
    with: TASKB,
    expect: PROJ,
    run: async (w) =>
      checkedBody(await bodyGet(w.tasks.pLeaf.id), {
        taskId: w.tasks.pLeaf.id,
        projectId: w.P.id,
        pageId: w.taskBodies.pLeafBody.id,
        canEdit: true,
      }),
  }),
  defineRow({
    id: 'TB-GET-NONE',
    spec: 'PERM-27 + FR-681 — GET /api/tasks/{pChildB}/body before the first edit → page null',
    action: 'GET /api/tasks/[id]/body',
    mutates: false,
    with: TASKB,
    expect: PROJ,
    run: async (w) => {
      const res = await checkedBody(await bodyGet(w.tasks.pChildB.id), {
        taskId: w.tasks.pChildB.id,
        projectId: w.P.id,
        pageId: null,
        canEdit: true,
      })
      // FR-681: reading never creates the row
      expect(await taskPagesOf(w.tasks.pChildB.id)).toEqual([])
      return res
    },
  }),
  defineRow({
    id: 'TB-GET-ARCH',
    spec: 'PERM-27 + X42 — GET /api/tasks/{aTask}/body of archived A (can.edit false)',
    action: 'GET /api/tasks/[id]/body',
    mutates: false,
    with: TASKB,
    expect: PROJ,
    run: async (w) =>
      checkedBody(await bodyGet(w.tasks.aTask.id), {
        taskId: w.tasks.aTask.id,
        projectId: w.A.id,
        pageId: w.taskBodies.aTaskBody.id,
        canEdit: false,
      }),
  }),
  defineRow({
    id: 'TB-GET-BAD',
    spec: 'X86 — GET /api/tasks/not-a-uuid/body is a 404',
    action: 'GET /api/tasks/[id]/body',
    mutates: false,
    with: TASKB,
    expect: each('404'),
    run: () => bodyGet('not-a-uuid'),
  }),
  defineRow({
    id: 'TB-GET-DELETED',
    spec: 'PERM-27 + FR-689 — the body of a soft-deleted task is a 404 for everyone',
    action: 'GET /api/tasks/[id]/body',
    mutates: false,
    with: TASKB,
    expect: each('404'),
    setup: deletedTaskWithBody,
    run: (w) => bodyGet(w.deletedTasks.pDeleted.id),
  }),

  // ── ensureTaskBody (PERM-28, FR-681, M6.1-D6) ────────────────────────────────────────────────────────────────
  defineRow({
    id: 'TB-ENSURE',
    spec: 'PERM-28 §3.2 แก้เนื้อหางาน — ensureTaskBody({ pChildB }) creates the TASK page (FR-693 page · create)',
    action: 'ensureTaskBody',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: PROJ,
    run: async (w) => {
      const r = await ensure(w.tasks.pChildB.id)
      if (r.ok) {
        expect(r).toMatchObject({ created: true, version: 1 })
        const rows = await taskPagesOf(w.tasks.pChildB.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
          id: r.pageId,
          kind: 'TASK',
          space: 'PROJECT',
          projectId: w.P.id,
          title: '',
          parentId: null,
          deletedAt: null,
        })
      }
      return r
    },
  }),
  defineRow({
    id: 'TB-ENSURE-EXISTING',
    spec: 'PERM-28 + M6.1-D6 — ensureTaskBody({ pLeaf }) returns the existing body; idempotent, no audit',
    action: 'ensureTaskBody',
    mutates: true,
    audit: false,
    with: TASKB,
    expect: PROJ,
    run: async (w) => {
      const r: ActionResult<EnsureTaskBodyResult> = await ensure(w.tasks.pLeaf.id)
      if (r.ok) {
        expect(r).toMatchObject({ pageId: w.taskBodies.pLeafBody.id, version: 1, created: false })
        expect(await taskPagesOf(w.tasks.pLeaf.id)).toHaveLength(1)
      }
      return r
    },
  }),
  defineRow({
    id: 'TB-ENSURE-ARCH',
    spec: 'PERM-28 + X42 — ensureTaskBody({ aTask2 }) in archived A → 403, no row',
    action: 'ensureTaskBody',
    mutates: true,
    audit: auditPageA,
    with: TASKB,
    expect: ARCH_WRITE,
    run: async (w) => {
      const r = await ensure(w.tasks.aTask2.id)
      expect(await taskPagesOf(w.tasks.aTask2.id)).toEqual([])
      return r
    },
  }),
  defineRow({
    id: 'TB-ENSURE-BAD',
    spec: 'X86 — ensureTaskBody({ taskId: "x" }) fails zod → 400 for everyone',
    action: 'ensureTaskBody',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('400'),
    run: () => ensure('x'),
  }),

  // ── M4 page routes on a TASK page (FR-687: requirePage → requireTask) ────────────────────────────────────────
  defineRow({
    id: 'TB-PAGE-GET',
    spec: 'PERM-27 + M6.1-D5 — GET /api/pages/{pLeafBody}: kind TASK, taskId, title = tasks.name (FR-682)',
    action: 'GET /api/pages/[id]',
    mutates: false,
    with: TASKB,
    expect: PROJ,
    run: async (w) => {
      const res = await pageGet(w.taskBodies.pLeafBody.id)
      if (res.status === 200) {
        const { page } = (await res.clone().json()) as PageView
        expect(page).toMatchObject({
          id: w.taskBodies.pLeafBody.id,
          kind: 'TASK',
          taskId: w.tasks.pLeaf.id,
          title: w.tasks.pLeaf.name,
          fullWidth: false,
        })
      }
      return res
    },
  }),
  defineRow({
    id: 'TB-SAVE',
    spec: 'PERM-28 §3.2 แก้เนื้อหางาน (บันทึก) — savePageContent on pLeafBody (FR-693 audit, project P)',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: PROJ,
    run: async (w) => {
      const r = await savePageContent({
        pageId: w.taskBodies.pLeafBody.id,
        baseVersion: await currentVersion(w.taskBodies.pLeafBody.id),
        content: para('รายละเอียดใหม่'),
      })
      if (r.ok) expect((await pageRow(w.taskBodies.pLeafBody.id)).contentText).toBe('รายละเอียดใหม่')
      return r
    },
  }),
  defineRow({
    id: 'TB-SAVE-ARCH',
    spec: 'PERM-28 + X42 — save on aTaskBody (archived A) → 403',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageA,
    with: TASKB,
    expect: ARCH_WRITE,
    run: async (w) =>
      savePageContent({
        pageId: w.taskBodies.aTaskBody.id,
        baseVersion: await currentVersion(w.taskBodies.aTaskBody.id),
        content: para('แก้ใหม่'),
      }),
  }),
  defineRow({
    id: 'TB-SAVE-SUBPAGE',
    spec: 'FR-680 + M6.1-D9 — a subpage block in TASK content → VALIDATION 400 (after authz: W 404)',
    action: 'savePageContent',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: PROJ_400,
    run: async (w) => {
      const r = await savePageContent({
        pageId: w.taskBodies.pLeafBody.id,
        baseVersion: await currentVersion(w.taskBodies.pLeafBody.id),
        content: subpageContent(w.pages.pPage.id),
      })
      expect((await pageRow(w.taskBodies.pLeafBody.id)).version).toBe(w.taskBodies.pLeafBody.version)
      return r
    },
  }),
  defineRow({
    id: 'TB-KEEPALIVE',
    spec: 'PERM-28 + M4-D2 — PUT /api/pages/{pLeafBody}/content (same audit as the action, X96)',
    action: 'PUT /api/pages/[id]/content',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: PROJ,
    run: async (w) =>
      keepalive(w.taskBodies.pLeafBody.id, {
        baseVersion: await currentVersion(w.taskBodies.pLeafBody.id),
        content: para('ปิดแท็บ'),
      }),
  }),
  defineRow({
    id: 'TB-KEEPALIVE-SUBPAGE',
    spec: 'FR-680 + M6.1-D9 — the keepalive PUT also rejects subpage blocks in TASK content',
    action: 'PUT /api/pages/[id]/content',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: PROJ_400,
    run: async (w) =>
      keepalive(w.taskBodies.pLeafBody.id, {
        baseVersion: await currentVersion(w.taskBodies.pLeafBody.id),
        content: subpageContent(w.pages.pPage.id),
      }),
  }),
  defineRow({
    id: 'TB-LOCK-GET',
    spec: 'PERM-27 + FR-687 — GET /api/pages/{pLeafBody}/lock (view)',
    action: 'GET /api/pages/[id]/lock',
    mutates: false,
    with: TASKB,
    expect: PROJ,
    run: (w) => lockCall('GET', w.taskBodies.pLeafBody.id),
  }),
  defineRow({
    id: 'TB-LOCK-POST',
    spec: 'PERM-28 + FR-688 — POST /api/pages/{pLeafBody}/lock (lease, not audited X44)',
    action: 'POST /api/pages/[id]/lock',
    mutates: true,
    audit: false,
    with: TASKB,
    expect: PROJ,
    run: (w) => lockCall('POST', w.taskBodies.pLeafBody.id),
  }),
  defineRow({
    id: 'TB-LOCK-POST-ARCH',
    spec: 'PERM-28 + X42 — no lease on aTaskBody (archived A)',
    action: 'POST /api/pages/[id]/lock',
    mutates: true,
    audit: false,
    with: TASKB,
    expect: ARCH_WRITE,
    run: (w) => lockCall('POST', w.taskBodies.aTaskBody.id),
  }),
  defineRow({
    id: 'TB-LOCK-DELETE',
    spec: 'PERM-27 + EDI-6 — DELETE /api/pages/{pLeafBody}/lock (idempotent release, not audited)',
    action: 'DELETE /api/pages/[id]/lock',
    mutates: true,
    audit: false,
    with: TASKB,
    expect: PROJ,
    run: (w) => lockCall('DELETE', w.taskBodies.pLeafBody.id),
  }),
  defineRow({
    id: 'TB-UPLOAD',
    spec: 'PERM-28 §3.2 แก้เนื้อหางาน (อัปโหลดไฟล์) — POST /api/files into pLeafBody (file audit, project P)',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileP,
    with: TASKB,
    expect: PROJ,
    run: (w) => upload({ pageId: w.taskBodies.pLeafBody.id, name: 'a.png', bytes: PNG_1X1 }),
  }),
  defineRow({
    id: 'TB-UPLOAD-ARCH',
    spec: 'PERM-28 + X42 — upload into aTaskBody (archived A) → 403',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileA,
    with: TASKB,
    expect: ARCH_WRITE,
    run: (w) => upload({ pageId: w.taskBodies.aTaskBody.id, name: 'a.png', bytes: PNG_1X1 }),
  }),
  defineRow({
    id: 'TB-FILE-GET',
    spec: 'PERM-27 + AC-624 — GET /api/files/{pLeafBodyImage} (a picture inside a task body)',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: TASKB,
    expect: PROJ,
    run: (w) => fileGet(w.taskBodies.pLeafBodyImage.id),
  }),

  // ── page APIs addressed at a TASK page (FR-682, M6.1-D4 requireDocPage → 404 for everyone) ──────────────────
  defineRow({
    id: 'TB-TREE-PARENT',
    spec: 'FR-682 — GET /api/pages/tree?…&parentId={pLeafBody} (a TASK page has no children) → 404',
    action: 'GET /api/pages/tree',
    mutates: false,
    with: TASKB,
    expect: each('404'),
    run: (w) => treeGet(`space=PROJECT&projectId=${w.P.id}&parentId=${w.taskBodies.pLeafBody.id}`),
  }),
  defineRow({
    id: 'TB-RENAME',
    spec: 'FR-682 — renamePage(pLeafBody): the name is always tasks.name → 404',
    action: 'renamePage',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: (w) => renamePage({ pageId: w.taskBodies.pLeafBody.id, title: 'ชื่อหน้าใหม่' }),
  }),
  defineRow({
    id: 'TB-ICON',
    spec: 'FR-682 — setPageIcon(pLeafBody) → 404',
    action: 'setPageIcon',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: (w) => setPageIcon({ pageId: w.taskBodies.pLeafBody.id, icon: '📌' }),
  }),
  defineRow({
    id: 'TB-COVER',
    spec: 'FR-682 — setPageCover(pLeafBody, its own image) → 404',
    action: 'setPageCover',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: (w) => setPageCover({ pageId: w.taskBodies.pLeafBody.id, fileId: w.taskBodies.pLeafBodyImage.id }),
  }),
  defineRow({
    id: 'TB-PROTECT',
    spec: 'FR-682 + M6.1-D4 — setPageProtected(pLeafBody) → 404 (protect on a TASK page is never visible)',
    action: 'setPageProtected',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: (w) => setPageProtected({ pageId: w.taskBodies.pLeafBody.id, protected: true }),
  }),
  defineRow({
    id: 'TB-TEMPLATE',
    spec: 'FR-682 — applyTemplate on a blank TASK page (pChildB’s fresh body) → 404',
    action: 'applyTemplate',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    // A blank body, so a missing kind guard would succeed (M4-D7 blank-only) instead of failing for another reason.
    setup: async (w) => ({ blank: await makeTaskBody({ task: w.tasks.pChildB }) }),
    run: (_w, ctx) => applyTemplate({ pageId: ctx.blank.id, baseVersion: 1, template: 'meeting' }),
  }),
  defineRow({
    id: 'TB-MOVE',
    spec: 'FR-682 — movePage(pLeafBody → root after pPage) → 404',
    action: 'movePage',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: (w) => movePage({ pageId: w.taskBodies.pLeafBody.id, parentId: null, afterId: w.pages.pPage.id }),
  }),
  defineRow({
    id: 'TB-MOVE-UNDER',
    spec: 'FR-682 + S1.3 — movePage(pChild under pLeafBody): a TASK page is never a parent → 404',
    action: 'movePage',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: (w) => movePage({ pageId: w.pages.pChild.id, parentId: w.taskBodies.pLeafBody.id, afterId: null }),
  }),
  defineRow({
    id: 'TB-DUP',
    spec: 'FR-682 + FR-689 — duplicatePage(pLeafBody): no task / body duplication → 404',
    action: 'duplicatePage',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: (w) => duplicatePage({ pageId: w.taskBodies.pLeafBody.id }),
  }),
  defineRow({
    id: 'TB-DELETE',
    spec: 'FR-682 + FR-689 — deletePage(pLeafBody): bodies go only with their task → 404, body stays live',
    action: 'deletePage',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: async (w) => {
      const r = await deletePage({ pageId: w.taskBodies.pLeafBody.id })
      expect((await pageRow(w.taskBodies.pLeafBody.id)).deletedAt).toBeNull()
      return r
    },
  }),
  defineRow({
    id: 'TB-CREATE-CHILD',
    spec: 'FR-682 — createPage({ PROJECT, P, parentId: pLeafBody }) → 404',
    action: 'createPage',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: (w) => createPage({ space: 'PROJECT', projectId: w.P.id, parentId: w.taskBodies.pLeafBody.id }),
  }),
  defineRow({
    id: 'TB-RESTORE-PAGEBATCH',
    spec: 'FR-689 + M6.1-D13 — restorePageBatch(<task delete batch holding a body>) → 404; the body stays deleted',
    action: 'restorePageBatch',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    setup: deletedTaskWithBody,
    run: async (w, ctx) => {
      const r = await restorePageBatch({ batch: w.batches.pDeletedTask })
      expect((await pageRow(ctx.bodyId)).deletedAt).not.toBeNull()
      return r
    },
  }),

  // ── setPageFullWidth (FR-1602, M6.1-D15) ─────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'FW-DOC',
    spec: 'PERM-16 + FR-1602 — setPageFullWidth({ pageId: pPage, true }) (like icon/cover; page · update audit)',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: PROJ,
    run: async (w) => {
      const r = checkedFullWidth(await fullWidth({ pageId: w.pages.pPage.id }))
      if (r.ok) expect((await pageRow(w.pages.pPage.id)).fullWidth).toBe(true)
      return r
    },
  }),
  defineRow({
    id: 'FW-DOC-SAME',
    spec: 'FR-1602 + M6.1-D15 — the same value again → changed false, no audit',
    action: 'setPageFullWidth',
    mutates: true,
    audit: false,
    with: TASKB,
    expect: PROJ,
    run: async (w) => {
      const r = await fullWidth({ pageId: w.pages.pPage.id }, false)
      if (r.ok) expect(r).toMatchObject({ pageId: w.pages.pPage.id, fullWidth: false, changed: false })
      return r
    },
  }),
  defineRow({
    id: 'FW-DOC-ARCH',
    spec: 'PERM-16 + X42 — setPageFullWidth on aPage (archived A) → 403',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageA,
    with: TASKB,
    expect: ARCH_WRITE,
    run: (w) => fullWidth({ pageId: w.pages.aPage.id }),
  }),
  defineRow({
    id: 'FW-WIKI',
    spec: 'PERM-18 — setPageFullWidth on the team wiki (every user; audit project null)',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageWiki,
    with: TASKB,
    expect: ALL,
    run: async (w) => checkedFullWidth(await fullWidth({ pageId: w.pages.wiki.id })),
  }),
  defineRow({
    id: 'FW-WIKI-PROT',
    spec: 'PERM-18 + FR-510 — setPageFullWidth on a protected wiki page: manager only, workers 403',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageWiki,
    with: TASKB,
    expect: MGR,
    run: (w) => fullWidth({ pageId: w.pages.wikiProtected.id }),
  }),
  defineRow({
    id: 'FW-PAGEID-TASK',
    spec: 'FR-682 + M6.1-D15 — { pageId: pLeafBody } (a TASK page through the DOC path) → 404; tasks use taskId',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('404'),
    run: (w) => fullWidth({ pageId: w.taskBodies.pLeafBody.id }),
  }),
  defineRow({
    id: 'FW-TASK',
    spec: 'PERM-28 + FR-1602 — setPageFullWidth({ taskId: pLeaf, true }) (page · update, project P)',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: PROJ,
    run: async (w) => {
      const r = checkedFullWidth(await fullWidth({ taskId: w.tasks.pLeaf.id }))
      if (r.ok) {
        expect(r.pageId).toBe(w.taskBodies.pLeafBody.id)
        expect((await pageRow(w.taskBodies.pLeafBody.id)).fullWidth).toBe(true)
      }
      return r
    },
  }),
  defineRow({
    id: 'FW-TASK-NEW',
    spec: 'PERM-28 + FR-681 — setPageFullWidth({ taskId: pChildB }) creates the body; exactly one audit row',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: PROJ,
    run: async (w) => {
      const r = checkedFullWidth(await fullWidth({ taskId: w.tasks.pChildB.id }))
      if (r.ok) {
        const rows = await taskPagesOf(w.tasks.pChildB.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ id: r.pageId, kind: 'TASK', fullWidth: true })
      }
      return r
    },
  }),
  defineRow({
    id: 'FW-TASK-ARCH',
    spec: 'PERM-28 + X42 — setPageFullWidth({ taskId: aTask }) (archived A) → 403',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageA,
    with: TASKB,
    expect: ARCH_WRITE,
    run: async (w) => {
      const r = await fullWidth({ taskId: w.tasks.aTask.id })
      expect((await pageRow(w.taskBodies.aTaskBody.id)).fullWidth).toBe(false)
      return r
    },
  }),
  defineRow({
    id: 'FW-TASK-ARCH-NEW',
    spec: 'PERM-28 + X42 — setPageFullWidth({ taskId: aTask2 }) (archived, no body) → 403 and no row created',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageA,
    with: TASKB,
    expect: ARCH_WRITE,
    run: async (w) => {
      const r = await fullWidth({ taskId: w.tasks.aTask2.id })
      expect(await taskPagesOf(w.tasks.aTask2.id)).toEqual([])
      return r
    },
  }),
  defineRow({
    id: 'FW-BAD',
    spec: 'M6.1-D15 — both pageId and taskId → 400 for everyone (zod before authz)',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('400'),
    run: (w) => setPageFullWidthRaw({ pageId: w.pages.pPage.id, taskId: w.tasks.pLeaf.id, fullWidth: true }),
  }),
  defineRow({
    id: 'FW-BAD-NONE',
    spec: 'M6.1-D15 — neither pageId nor taskId → 400 for everyone',
    action: 'setPageFullWidth',
    mutates: true,
    audit: auditPageP,
    with: TASKB,
    expect: each('400'),
    run: () => setPageFullWidthRaw({ fullWidth: true }),
  }),

  // ── task search group (FR-690, M6.1-D14) ─────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'SR-TASKS-NAME',
    spec: 'PERM-27 + FR-690 — GET /api/search?q=งานเดี่ยว → tasks has pLeaf (name hit) for M/L/Me, nothing of P for W',
    action: 'GET /api/search',
    mutates: false,
    with: TASKB,
    expect: ALL,
    run: async (w, _ctx, actor) => {
      const res = await searchGet(`q=${encodeURIComponent('งานเดี่ยว')}`)
      if (res.status === 200) {
        const body = (await res.clone().json()) as SearchResponse
        expect(body.tasks, 'the route always sends the tasks group').toBeDefined()
        const hit = body.tasks?.find((t) => t.id === w.tasks.pLeaf.id)
        if (isOutsider(w, actor)) {
          expect(body.tasks).toEqual([])
          assertNoLeak(body, [w.tasks.pLeaf.name, w.tasks.pLeaf.id, w.P.name, w.P.id])
        } else {
          expect(hit).toMatchObject({
            kind: 'task',
            name: w.tasks.pLeaf.name,
            projectId: w.P.id,
            projectName: w.P.name,
            projectArchived: false,
            completed: false,
            href: `/t/${w.tasks.pLeaf.id}`,
            matchedIn: 'name',
          })
        }
      }
      return res
    },
  }),
  defineRow({
    id: 'SR-TASKS-BODY',
    spec: 'PERM-27 + FR-690 — GET /api/search?q=P-ลับ11 (only in pLeafBody) → content hit for M/L/Me; W gets no P-ลับ',
    action: 'GET /api/search',
    mutates: false,
    with: TASKB,
    expect: ALL,
    run: async (w, _ctx, actor) => {
      const res = await searchGet(`q=${encodeURIComponent('P-ลับ11')}`)
      if (res.status === 200) {
        const body = (await res.clone().json()) as SearchResponse
        if (isOutsider(w, actor)) {
          expect(body.tasks ?? []).toEqual([])
          assertNoLeak(body, ['P-ลับ', w.tasks.pLeaf.id, w.taskBodies.pLeafBody.id, w.P.id])
        } else {
          expect(body.tasks?.find((t) => t.id === w.tasks.pLeaf.id)).toMatchObject({
            href: `/t/${w.tasks.pLeaf.id}`,
            matchedIn: 'content',
          })
          // FR-682: the TASK page itself is never a page hit
          expect(body.pages.map((p) => p.id)).not.toContain(w.taskBodies.pLeafBody.id)
        }
      }
      return res
    },
  }),
  defineRow({
    id: 'SR-TASKS-TITLEONLY',
    spec: 'X68 + M6.1-D14 — mention suggestions ?titleOnly=1 → tasks: [] for everyone',
    action: 'GET /api/search',
    mutates: false,
    with: TASKB,
    expect: ALL,
    run: async () => {
      const res = await searchGet(`q=${encodeURIComponent('งานเดี่ยว')}&titleOnly=1`)
      if (res.status === 200) expect(((await res.clone().json()) as SearchResponse).tasks).toEqual([])
      return res
    },
  }),

  // ── FR-692: tasks.notes is gone ──────────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'T-UPDATE-NOTES',
    spec: 'FR-692 + M6.1-D12 — updateTask({ patch: { notes } }): notes is no field any more → 400 (empty patch)',
    action: 'updateTask',
    mutates: true,
    audit: auditTaskP,
    with: TASKB,
    expect: each('400'),
    run: (w) =>
      updateTask({
        taskId: w.tasks.pLeaf.id,
        // the removed field, smuggled past the type the way an old client would send it
        patch: { notes: 'x' } as unknown as Parameters<typeof updateTask>[0]['patch'],
      }),
  }),
]

/** setPageFullWidth with an input the type forbids (FW-BAD*: zod must refuse it at runtime). */
function setPageFullWidthRaw(input: Record<string, unknown>): Promise<ActionResult<SetPageFullWidthResult>> {
  return fullWidthAction(input as unknown as Parameters<typeof fullWidthAction>[0])
}
