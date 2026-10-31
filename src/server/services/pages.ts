// src/server/services/pages.ts — single-page reads and writes (FR-504/505/507/510/531/543, M4-D4/D6/D7/D9/D29).
// `a` is the caller's authz.requirePage result. Services never read the clock (X56): `today` comes from the action.
// Audit (M4-D38): renamePage and savePageContent never audit (their action/route does, X96); the others write
// their own row as their last statement. Page saves are audited without content (X44).
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { buildTemplate, type TemplateId } from '@/i18n/templates.th'
import type {
  ApplyTemplateResult,
  PageCan,
  PageTitleItem,
  PageTitlesResponse,
  PageView,
  SavePageResult,
} from '@/lib/contracts/pages'
import { displayName } from '@/lib/display-name'
import { extractContentText } from '@/lib/editor/content-text'
import { fileUrl } from '@/lib/files/upload-rules'
import { formatThaiDate } from '@/lib/format'
import { isBlankPage } from '@/lib/pages/blank'
import { PAGE_TITLE_MAX } from '@/lib/schemas/pages'
import { sanitizeContent, type PageContent } from '@/lib/schemas/page-content'
import * as audit from '../audit'
import * as authz from '../authz'
import type { PageAccess } from '../authz'
import { pages } from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'
import { uploadLimits } from '../env'
import { ConflictError, NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import * as filesRepo from '../repo/files'
import * as pagesRepo from '../repo/pages'
import type { SessionUser } from '../session'
import { getLease } from './page-lease'
import { getBreadcrumb, PAGE_MAX_DEPTH_INDEX } from './page-tree'

const versionConflict = (version: number): ConflictError =>
  new ConflictError('VERSION_CONFLICT', undefined, { current: { version } })

/** What the viewer may do on the page, computed without throwing (mirrors requirePage / requirePageCreate). */
async function pageCan(tx: DbOrTx, a: PageAccess): Promise<PageCan> {
  const p = a.page
  const edit = !a.archived && (!a.effectiveProtected || a.isManager)
  const subtreeOk = a.isManager || !(await pagesRepo.subtreeHasLocked(tx, p.id))
  let duplicate: boolean
  if (p.space === 'PROJECT') duplicate = !a.archived
  else if (p.parentId === null || a.isManager) duplicate = true
  else duplicate = !(await authz.effectiveProtection(tx, p.parentId))
  return {
    edit,
    protect: a.isManager && p.space === 'WORKSPACE',
    delete: edit && !p.isCharter && subtreeOk,
    createChild: edit && p.depth < PAGE_MAX_DEPTH_INDEX,
    move: edit,
    duplicate,
  }
}

/** Everything /p/[pageId] renders; authorises `view` itself (wrap in orNotFound(), X57). */
export async function getPageView(tx: DbOrTx, user: SessionUser, pageId: string): Promise<PageView> {
  const a = await authz.requirePage(tx, user, pageId, 'view')
  const p = a.page
  const project = p.projectId ? await repo.projects.getProject(tx, p.projectId) : null
  const updater = await repo.people.getPerson(tx, p.updatedBy)
  return {
    page: {
      id: p.id,
      space: p.space,
      projectId: p.projectId,
      projectName: project?.name ?? null,
      projectArchived: a.archived,
      parentId: p.parentId,
      depth: p.depth,
      title: p.title,
      icon: p.icon,
      cover: p.coverFileId ? { fileId: p.coverFileId, url: fileUrl(p.coverFileId) } : null,
      isCharter: p.isCharter,
      locked: p.locked,
      effectiveProtected: a.effectiveProtected,
      version: p.version,
      content: p.content,
      isBlank: isBlankPage(p),
      updatedAt: p.updatedAt.toISOString(),
      updatedBy: { id: p.updatedBy, name: updater ? displayName(updater) : '' },
    },
    breadcrumb: await getBreadcrumb(tx, p.id),
    can: await pageCan(tx, a),
    uploadLimits: uploadLimits(),
  }
}

/** M4-D28: trimmed, ≤ 200 characters (the schema already validates; this is the service-level cap). */
export async function renamePage(
  tx: Tx,
  user: SessionUser,
  a: PageAccess,
  title: string,
): Promise<{ before: string; after: string }> {
  const next = title.trim().slice(0, PAGE_TITLE_MAX)
  const before = a.page.title
  if (next !== before) {
    await tx.update(pages).set({ title: next, updatedBy: user.id }).where(eq(pages.id, a.page.id))
  }
  return { before, after: next }
}

export async function setPageIcon(tx: Tx, user: SessionUser, a: PageAccess, icon: string | null): Promise<void> {
  await tx.update(pages).set({ icon, updatedBy: user.id }).where(eq(pages.id, a.page.id))
  await audit.log(tx, user, {
    entity: 'page',
    entityId: a.page.id,
    action: 'update',
    projectId: a.page.projectId,
    summary: th.audit.pageIconChanged(a.page.title),
    before: { icon: a.page.icon },
    after: { icon },
  })
}

/** Cover must be an IMAGE file of the same project_id (M4-D17). */
export async function setPageCover(
  tx: Tx,
  user: SessionUser,
  a: PageAccess,
  fileId: string | null,
): Promise<void> {
  if (fileId !== null) {
    const file = await filesRepo.getFile(tx, fileId)
    if (!file || file.kind !== 'IMAGE' || file.projectId !== a.page.projectId) {
      const msg = th.pages.errors.coverNotImage
      throw new ValidationError({ fileId: [msg] }, msg)
    }
  }
  await tx.update(pages).set({ coverFileId: fileId, updatedBy: user.id }).where(eq(pages.id, a.page.id))
  await audit.log(tx, user, {
    entity: 'page',
    entityId: a.page.id,
    action: 'update',
    projectId: a.page.projectId,
    summary: th.audit.pageCoverChanged(a.page.title),
    before: { coverFileId: a.page.coverFileId },
    after: { coverFileId: fileId },
  })
}

/** FR-510 (caller ran requirePage('protect')). No-op `{ changed: false }` when already in that state. */
export async function setPageProtected(
  tx: Tx,
  user: SessionUser,
  a: PageAccess,
  value: boolean,
): Promise<{ changed: boolean }> {
  if (a.page.locked === value) return { changed: false }
  await tx.update(pages).set({ locked: value, updatedBy: user.id }).where(eq(pages.id, a.page.id))
  await audit.log(tx, user, {
    entity: 'page',
    entityId: a.page.id,
    action: 'update',
    projectId: a.page.projectId,
    summary: value ? th.audit.pageProtected(a.page.title) : th.audit.pageUnprotected(a.page.title),
    before: { locked: a.page.locked },
    after: { locked: value },
  })
  return { changed: true }
}

/** `UPDATE … WHERE version = base` → the new version, or VERSION_CONFLICT / NOT_FOUND after a re-read. */
async function bumpContent(
  tx: Tx,
  user: SessionUser,
  pageId: string,
  baseVersion: number,
  set: { content: unknown[]; title?: string; icon?: string | null },
): Promise<number> {
  const rows = await tx
    .update(pages)
    .set({
      content: set.content,
      contentText: extractContentText(set.content),
      ...(set.title !== undefined ? { title: set.title } : {}),
      ...(set.icon !== undefined ? { icon: set.icon } : {}),
      version: sql`${pages.version} + 1`,
      updatedBy: user.id,
      updatedAt: sql`now()`,
    })
    .where(and(eq(pages.id, pageId), eq(pages.version, baseVersion), isNull(pages.deletedAt)))
    .returning({ version: pages.version })
  const row = rows[0]
  if (row) return row.version
  const cur = await pagesRepo.getPage(tx, pageId)
  if (!cur || cur.deletedAt !== null) throw new NotFoundError()
  throw versionConflict(cur.version)
}

/** Blank pages only (M4-D7); bumps version. A page that is no longer blank → VERSION_CONFLICT (reload). */
export async function applyTemplate(
  tx: Tx,
  user: SessionUser,
  a: PageAccess,
  i: { baseVersion: number; template: TemplateId; today: ISODate },
): Promise<ApplyTemplateResult> {
  const cur = await pagesRepo.getLivePageOrNotFound(tx, a.page.id)
  if (cur.version !== i.baseVersion || !isBlankPage(cur)) throw versionConflict(cur.version)
  const t = buildTemplate(i.template, { dateLabel: formatThaiDate(i.today, 'medium') })
  const version = await bumpContent(tx, user, cur.id, i.baseVersion, {
    content: t.content,
    title: t.title,
    icon: t.icon,
  })
  await audit.log(tx, user, {
    entity: 'page',
    entityId: cur.id,
    action: 'update',
    projectId: cur.projectId,
    summary: th.audit.pageTemplateApplied(t.title),
    after: { template: i.template, version },
  })
  return { version, title: t.title, icon: t.icon }
}

/** FR-543: `UPDATE … WHERE version = baseVersion`; mismatch → VERSION_CONFLICT. Content is sanitised (M4-D9).
 *  The lease is not required (X63): anyone who may edit and has the current version saves. */
export async function savePageContent(
  tx: Tx,
  user: SessionUser,
  a: PageAccess,
  i: { baseVersion: number; content: PageContent },
): Promise<SavePageResult> {
  const content = sanitizeContent(i.content)
  const version = await bumpContent(tx, user, a.page.id, i.baseVersion, { content })
  return { version, lease: await getLease(tx, user, a.page.id) }
}

/** Mention/sub-page chips (M4-D20, M4-D32): invisible → `{ id, visible: false }` only. */
export async function getPageTitles(
  tx: DbOrTx,
  user: SessionUser,
  ids: readonly string[],
): Promise<PageTitlesResponse> {
  authz.requireUser(user)
  const unique = [...new Set(ids)]
  const rows = new Map((await pagesRepo.getPages(tx, unique)).map((r) => [r.id, r]))
  const vis = await authz.visibleProjectIds(tx, user)
  const items = unique.map((id): PageTitleItem => {
    const p = rows.get(id)
    if (!p) return { id, visible: false }
    if (p.space === 'PROJECT' && vis !== 'ALL' && !vis.has(p.projectId!)) return { id, visible: false }
    if (p.deletedAt !== null) return { id, visible: true, deleted: true }
    return { id, visible: true, deleted: false, title: p.title, icon: p.icon }
  })
  return { items }
}
