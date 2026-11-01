'use server'
// src/server/actions/pages.ts — page writes (FR-504…510, FR-531/543, X63, plan/m04 S1).
// Shape: zod → db.transaction(authz.requirePage / requirePageCreate → service → audit) → result. No action calls
// refresh() (M4-D29); clients invalidate TanStack queries (invalidatePages / invalidatePage).
// Audit (M4-D38): createPage, renamePage and savePageContent write their row here after the service; every other
// service audits itself. Tree services (move/duplicate/delete/restore) authorise inside, before touching data.
// M6.1 (FR-682, M6.1-D4): title / icon / cover / protect / template are document-only (requireDocPage: a TASK page →
// 404); saves keep requirePage because they serve task bodies too (FR-687).
import { th } from '@/i18n/th'
import type {
  ApplyTemplateResult,
  CreatePageResult,
  DeletePageResult,
  DuplicatePageResult,
  MovePageResult,
  PageDTO,
  RestorePageResult,
  SavePageResult,
  SetPageFullWidthResult,
} from '@/lib/contracts/pages'
import { fileUrl } from '@/lib/files/upload-rules'
import {
  applyTemplateSchema,
  createPageSchema,
  movePageSchema,
  pageIdSchema,
  renamePageSchema,
  restorePageBatchSchema,
  savePageContentSchema,
  setPageCoverSchema,
  setPageFullWidthSchema,
  setPageIconSchema,
  setPageProtectedSchema,
} from '@/lib/schemas/pages'
import { action } from '../action'
import * as audit from '../audit'
import * as authz from '../authz'
import { serverToday } from '../clock'
import { db } from '../db/client'
import type { Tx } from '../db/types'
import type { PageContent } from '@/lib/schemas/page-content'
import * as pageService from '../services/pages'
import * as pageTree from '../services/page-tree'
import * as taskPages from '../services/task-pages'
import type { SessionUser } from '../session'

export const createPage = action(createPageSchema, (input, { user }): Promise<CreatePageResult> =>
  db.transaction(async (tx) => {
    const page = await pageTree.createPage(tx, user, input) // requirePageCreate inside (M4-D31)
    await audit.log(tx, user, {
      entity: 'page',
      entityId: page.id,
      action: 'create',
      projectId: page.projectId,
      summary: th.audit.pageCreated(page.title),
      after: { parentId: page.parentId, space: page.space },
    })
    return {
      page: await pageTree.treeNodeOf(tx, page),
      space: page.space,
      projectId: page.projectId,
      href: `/p/${page.id}`,
    }
  }),
)

export const renamePage = action(renamePageSchema, ({ pageId, title }, { user }): Promise<{ title: string }> =>
  db.transaction(async (tx) => {
    const a = await authz.requireDocPage(tx, user, pageId, 'edit')
    const r = await pageService.renamePage(tx, user, a, title)
    if (r.before !== r.after) {
      await audit.log(tx, user, {
        entity: 'page',
        entityId: pageId,
        action: 'update',
        projectId: a.page.projectId,
        summary: th.audit.pageRenamed(r.before, r.after),
        before: { title: r.before },
        after: { title: r.after },
      })
    }
    return { title: r.after }
  }),
)

export const setPageIcon = action(setPageIconSchema, ({ pageId, icon }, { user }): Promise<{ icon: string | null }> =>
  db.transaction(async (tx) => {
    const a = await authz.requireDocPage(tx, user, pageId, 'edit')
    await pageService.setPageIcon(tx, user, a, icon)
    return { icon }
  }),
)

export const setPageCover = action(
  setPageCoverSchema,
  ({ pageId, fileId }, { user }): Promise<{ cover: PageDTO['cover'] }> =>
    db.transaction(async (tx) => {
      const a = await authz.requireDocPage(tx, user, pageId, 'edit')
      await pageService.setPageCover(tx, user, a, fileId)
      return { cover: fileId ? { fileId, url: fileUrl(fileId) } : null }
    }),
)

export const movePage = action(movePageSchema, (input, { user }): Promise<MovePageResult> =>
  db.transaction(async (tx) => {
    const { page, fromParentId } = await pageTree.movePage(tx, user, input) // requireDocPage(edit) inside
    return {
      page: await pageTree.treeNodeOf(tx, page),
      space: page.space,
      projectId: page.projectId,
      fromParentId,
    }
  }),
)

export const duplicatePage = action(pageIdSchema, ({ pageId }, { user }): Promise<DuplicatePageResult> =>
  db.transaction(async (tx) => {
    const { root, count } = await pageTree.duplicatePage(tx, user, pageId) // requireDocPage(view) + create inside
    return { root: await pageTree.treeNodeOf(tx, root), count, space: root.space, projectId: root.projectId }
  }),
)

export const deletePage = action(pageIdSchema, ({ pageId }, { user }): Promise<DeletePageResult> =>
  db.transaction(async (tx) => {
    const { batch, root, ids } = await pageTree.softDeleteSubtree(tx, user, pageId) // requireDocPage(edit) inside
    return {
      batch,
      count: ids.length - 1, // descendants, for the toast
      title: root.title,
      space: root.space,
      projectId: root.projectId,
      parentId: root.parentId,
    }
  }),
)

export const restorePageBatch = action(restorePageBatchSchema, ({ batch }, { user }): Promise<RestorePageResult> =>
  db.transaction(async (tx) => {
    const { roots, ids } = await pageTree.restorePageBatch(tx, user, batch) // authz on the roots inside
    const first = roots[0]!
    return { restoredIds: ids, space: first.space, projectId: first.projectId }
  }),
)

export const setPageProtected = action(
  setPageProtectedSchema,
  ({ pageId, protected: value }, { user }): Promise<{ changed: boolean }> =>
    db.transaction(async (tx) => {
      const a = await authz.requireDocPage(tx, user, pageId, 'protect')
      return pageService.setPageProtected(tx, user, a, value)
    }),
)

export const applyTemplate = action(
  applyTemplateSchema,
  ({ pageId, baseVersion, template }, { user }): Promise<ApplyTemplateResult> =>
    db.transaction(async (tx) => {
      const a = await authz.requireDocPage(tx, user, pageId, 'edit')
      return pageService.applyTemplate(tx, user, a, { baseVersion, template, today: serverToday() })
    }),
)

/** authz → save → audit (M4-D38). The keepalive `PUT /api/pages/[id]/content` repeats these three steps (a 'use server'
 *  module may export only actions). */
async function saveWithAudit(
  tx: Tx,
  user: SessionUser,
  i: { pageId: string; baseVersion: number; content: PageContent },
): Promise<SavePageResult> {
  const a = await authz.requirePage(tx, user, i.pageId, 'edit') // DOC or task body (FR-687)
  const res = await pageService.savePageContent(tx, user, a, i)
  await audit.log(tx, user, pageService.saveAuditInput(a, res.version)) // FR-693 summary for bodies
  return res
}

export const savePageContent = action(savePageContentSchema, (input, { user }): Promise<SavePageResult> =>
  db.transaction((tx) => saveWithAudit(tx, user, input)),
)

/**
 * FR-1602 / M6.1-D15: shared "เต็มความกว้าง" of a DOC page (`pageId`) or a task body (`taskId`, created when missing).
 * The service authorises first (requireDocPage(edit) / requireTask(edit)) and writes one audit row per change.
 */
export const setPageFullWidth = action(
  setPageFullWidthSchema,
  ({ pageId, taskId, fullWidth }, { user }): Promise<SetPageFullWidthResult> =>
    db.transaction((tx) =>
      taskPages.setFullWidth(tx, user, pageId !== undefined ? { pageId } : { taskId: taskId! }, fullWidth),
    ),
)
