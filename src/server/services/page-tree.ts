// src/server/services/page-tree.ts — page tree reads and structural writes (FR-502/503/506/508/509, X48/X58/X63,
// M4-D21/D22/D23/D31). Services never read the clock (X56); 30-day windows use the DB now().
// Order keys are generated here between real neighbours under pg_advisory_xact_lock(hashtext('pages:' …)).
// Audit (M4-D38): createPage never audits (its action does, X96); move/duplicate/delete/restore write their own row.
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { th } from '@/i18n/th'
import type { PageCrumb, PageSpace, PageTreeNode, PageTreeResponse } from '@/lib/contracts/pages'
import { extractContentText, remapSubpageIds } from '@/lib/editor/content-text'
import type { CreatePageInput, MovePageInput, TreeQuery } from '@/lib/schemas/pages'
import * as audit from '../audit'
import * as authz from '../authz'
import type { NewPage, PageRow } from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'
import * as order from '../repo/order'
import * as pagesRepo from '../repo/pages'
import type { SessionUser } from '../session'
import { keyAmong } from './order-keys'
import { clearLeases } from './page-lease'

/** FR-502: depth index 0..9 (ten levels). */
export const PAGE_MAX_DEPTH_INDEX = 9

type Scope = { space: PageSpace; projectId: string | null; parentId: string | null }

const validation = (field: string, message: string): ValidationError =>
  new ValidationError({ [field]: [message] }, message)
const treeChanged = (): ConflictError => new ConflictError('CONFLICT', th.pages.errors.treeChanged)
const restoreFailed = (reason: string): ConflictError =>
  new ConflictError('CONFLICT', th.pages.errors.restore.failed(reason))

/** Tree DTO of a repo row; `effectiveProtected` only exists on WORKSPACE pages (M4-D24). */
export function toTreeNode(
  r: pagesRepo.TreeRow,
  space: PageSpace,
  parentProtected: boolean,
): PageTreeNode {
  return {
    id: r.id,
    parentId: r.parentId,
    title: r.title,
    icon: r.icon,
    depth: r.depth,
    position: r.position,
    hasChildren: r.hasChildren,
    locked: r.locked,
    effectiveProtected: space === 'WORKSPACE' && (parentProtected || r.locked),
    isCharter: r.isCharter,
  }
}

/** Fresh tree node of one page (action results). */
export async function treeNodeOf(tx: DbOrTx, page: PageRow): Promise<PageTreeNode> {
  const row = await pagesRepo.treeRow(tx, page.id)
  if (!row) throw new NotFoundError()
  const parentProtected =
    page.space === 'WORKSPACE' && page.parentId !== null
      ? await authz.effectiveProtection(tx, page.parentId)
      : false
  return toTreeNode(row, page.space, parentProtected)
}

/** Children of `parentId` (or the space root) the viewer may see, plus `canCreate` (M4-D23). */
export async function listTree(tx: DbOrTx, user: SessionUser, q: TreeQuery): Promise<PageTreeResponse> {
  authz.requireUser(user)
  const projectId = q.projectId ?? null
  const parentId = q.parentId ?? null
  let archived = false
  if (q.space === 'PROJECT') {
    if (projectId === null) throw new NotFoundError()
    archived = (await authz.requireProject(tx, user, projectId, 'view')).archived
  }
  let parentProtected = false
  let parentDepth = -1
  if (parentId !== null) {
    const parent = await authz.requirePage(tx, user, parentId, 'view')
    // A parent from another space/project is treated as unknown here (never confirms it exists).
    if (parent.page.space !== q.space || parent.page.projectId !== projectId) throw new NotFoundError()
    parentProtected = parent.effectiveProtected
    parentDepth = parent.page.depth
  }
  const rows = await pagesRepo.listLevel(tx, { space: q.space, projectId, parentId })
  const manager = authz.isManager(user)
  const canCreate =
    !archived && parentDepth < PAGE_MAX_DEPTH_INDEX && (!parentProtected || manager)
  return { nodes: rows.map((r) => toTreeNode(r, q.space, parentProtected)), canCreate }
}

/** Ancestors of the page, root first, the page itself excluded. Callers have authorised the page already. */
export async function getBreadcrumb(tx: DbOrTx, pageId: string): Promise<PageCrumb[]> {
  const rows = await pagesRepo.ancestors(tx, pageId)
  return rows.map((r) => ({ id: r.id, title: r.title, icon: r.icon }))
}

/** pg_advisory_xact_lock on the sibling scope (X48). */
export async function lockPageScope(tx: Tx, s: Scope): Promise<void> {
  await order.lockOrderScope(tx, `pages:${s.space}:${s.projectId ?? ''}:${s.parentId ?? 'root'}`)
}

/** Order key after `afterId` (null = first, undefined = last) among live siblings, optionally ignoring `excludeId`.
 *  A stale / non-sibling afterId → CONFLICT treeChanged; equal neighbours → the scope is re-keyed first (X48). */
export async function keyAt(
  tx: Tx,
  a: Scope & { afterId: string | null | undefined; excludeId?: string },
): Promise<string> {
  const siblings = (await pagesRepo.liveSiblings(tx, a)).filter((s) => s.id !== a.excludeId)
  if (typeof a.afterId === 'string' && !siblings.some((s) => s.id === a.afterId)) throw treeChanged()
  return keyAmong(siblings, a.afterId, (id, position) => pagesRepo.setPosition(tx, id, position))
}

/** The live subtree rooted at `rootId` (root included), parents before children. */
export async function subtreeRows(
  tx: DbOrTx,
  rootId: string,
): Promise<Pick<PageRow, 'id' | 'parentId' | 'depth' | 'position' | 'locked' | 'isCharter' | 'title'>[]> {
  const rows = await pagesRepo.liveSubtree(tx, rootId)
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    depth: r.depth,
    position: r.position,
    locked: r.locked,
    isCharter: r.isCharter,
    title: r.title,
  }))
}

const heightOf = (rows: readonly { depth: number }[], rootDepth: number): number =>
  rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.depth)) - rootDepth

/** FR-506. The action writes the audit row (X96, M4-D38). */
export async function createPage(tx: Tx, user: SessionUser, input: CreatePageInput): Promise<PageRow> {
  const scope: Scope = { space: input.space, projectId: input.projectId, parentId: input.parentId }
  const { parent } = await authz.requirePageCreate(tx, user, scope)
  const depth = parent ? parent.page.depth + 1 : 0
  if (depth > PAGE_MAX_DEPTH_INDEX) throw validation('parentId', th.pages.errors.maxDepth)
  await lockPageScope(tx, scope)
  const position = await keyAt(tx, { ...scope, afterId: input.afterId })
  return pagesRepo.insertPage(tx, {
    space: scope.space,
    projectId: scope.projectId,
    parentId: scope.parentId,
    depth,
    position,
    title: '',
    content: [],
    contentText: '',
    createdBy: user.id,
    updatedBy: user.id,
  })
}

/** FR-503 move within one space/project; depth ≤ 9; charter stays at the root. Writes its audit row. */
export async function movePage(
  tx: Tx,
  user: SessionUser,
  input: MovePageInput,
): Promise<{ page: PageRow; fromParentId: string | null }> {
  const a = await authz.requirePage(tx, user, input.pageId, 'edit')
  const page = a.page
  await authz.requireSubtreeUnprotected(tx, user, page.id)
  let parentDepth = -1
  if (input.parentId !== null) {
    const parent = await authz.assertSecondPage(tx, user, input.parentId, {
      space: page.space,
      projectId: page.projectId,
    })
    parentDepth = parent.page.depth
  }
  const sub = await pagesRepo.liveSubtree(tx, page.id)
  if (input.parentId !== null && sub.some((r) => r.id === input.parentId)) {
    throw validation('parentId', th.pages.errors.cycle)
  }
  if (page.isCharter && input.parentId !== null) throw validation('parentId', th.pages.errors.charterRootOnly)
  const newDepth = parentDepth + 1
  if (newDepth + heightOf(sub, page.depth) > PAGE_MAX_DEPTH_INDEX) {
    throw validation('parentId', th.pages.errors.maxDepth)
  }
  const scope: Scope = { space: page.space, projectId: page.projectId, parentId: input.parentId }
  await lockPageScope(tx, scope)
  const position = await keyAt(tx, { ...scope, afterId: input.afterId, excludeId: page.id })
  await pagesRepo.shiftSubtreeDepth(tx, page.id, newDepth - page.depth)
  const moved = await pagesRepo.updatePlacement(tx, page.id, {
    parentId: input.parentId,
    position,
    depth: newDepth,
    updatedBy: user.id,
  })
  await audit.log(tx, user, {
    entity: 'page',
    entityId: page.id,
    action: 'update',
    projectId: page.projectId,
    summary: th.audit.pageMoved(page.title),
    before: { parentId: page.parentId },
    after: { parentId: input.parentId },
  })
  return { page: moved, fromParentId: page.parentId }
}

/** FR-508 deep copy (M4-D22). Writes its audit row. */
export async function duplicatePage(
  tx: Tx,
  user: SessionUser,
  pageId: string,
): Promise<{ root: PageRow; count: number }> {
  const a = await authz.requirePage(tx, user, pageId, 'view')
  const source = a.page
  const scope: Scope = { space: source.space, projectId: source.projectId, parentId: source.parentId }
  await authz.requirePageCreate(tx, user, scope)
  const rows = await pagesRepo.liveSubtree(tx, source.id)
  const fresh = await tx.execute<{ id: string }>(
    sql`select gen_random_uuid() as id from generate_series(1, ${rows.length})`,
  )
  const map = new Map<string, string>(rows.map((r, i) => [r.id, fresh[i]!.id]))
  await lockPageScope(tx, scope)
  const rootPosition = await keyAt(tx, { ...scope, afterId: source.id })
  let root: PageRow | undefined
  for (const r of rows) {
    const isRoot = r.id === source.id
    const content = remapSubpageIds(r.content, map)
    const values: NewPage = {
      id: map.get(r.id)!,
      space: r.space,
      projectId: r.projectId,
      parentId: isRoot ? r.parentId : map.get(r.parentId!)!,
      depth: r.depth,
      position: isRoot ? rootPosition : r.position,
      title: isRoot ? th.pages.copyTitle(r.title) : r.title,
      icon: r.icon,
      coverFileId: r.coverFileId,
      content,
      contentText: extractContentText(content),
      isCharter: false,
      locked: false,
      version: 1,
      createdBy: user.id,
      updatedBy: user.id,
    }
    const inserted = await pagesRepo.insertPage(tx, values)
    if (isRoot) root = inserted
  }
  await audit.log(tx, user, {
    entity: 'page',
    entityId: root!.id,
    action: 'create',
    projectId: source.projectId,
    summary: th.audit.pageDuplicated(source.title, rows.length),
    after: { sourceId: source.id, count: rows.length },
  })
  return { root: root!, count: rows.length }
}

/** FR-509 soft delete of the subtree under one batch; clears leases (M4-D21). Writes its audit row. */
export async function softDeleteSubtree(
  tx: Tx,
  user: SessionUser,
  pageId: string,
): Promise<{ batch: string; root: PageRow; ids: string[] }> {
  const a = await authz.requirePage(tx, user, pageId, 'edit')
  if (a.page.isCharter) throw new ForbiddenError(th.pages.errors.charterNotDeletable) // managers too (M4-D6)
  await authz.requireSubtreeUnprotected(tx, user, pageId)
  const batch = randomUUID()
  const ids = await pagesRepo.softDeleteSubtree(tx, pageId, batch)
  await clearLeases(tx, ids)
  await audit.log(tx, user, {
    entity: 'page',
    entityId: pageId,
    action: 'delete',
    projectId: a.page.projectId,
    summary: th.audit.pageDeleted(a.page.title, ids.length),
    after: { batch, count: ids.length },
  })
  return { batch, root: a.page, ids }
}

/** Undo of FR-509 (M4-D21: authz on the roots, 30 days, parent alive, depth ≤ 9). Writes its audit row per root. */
export async function restorePageBatch(
  tx: Tx,
  user: SessionUser,
  batch: string,
): Promise<{ roots: PageRow[]; ids: string[] }> {
  authz.requireUser(user)
  const rows = await pagesRepo.listBatch(tx, batch)
  if (rows.length === 0) throw new NotFoundError()
  const inBatch = new Set(rows.map((r) => r.id))
  const roots = rows.filter((r) => r.parentId === null || !inBatch.has(r.parentId))
  // Authz on every root first (invisible → 404, archived / protected parent for workers → 403).
  for (const root of roots) await authz.accessForPage(tx, user, root, 'edit')
  if (rows.some((r) => r.expired)) throw restoreFailed(th.pages.errors.restore.expired)
  const childrenOf = new Map<string, typeof rows>()
  for (const r of rows) {
    if (r.parentId === null) continue
    const list = childrenOf.get(r.parentId) ?? []
    list.push(r)
    childrenOf.set(r.parentId, list)
  }
  const restored: string[] = []
  for (const root of roots) {
    let newDepth = 0
    if (root.parentId !== null) {
      const parent = await pagesRepo.getPage(tx, root.parentId)
      if (!parent || parent.deletedAt !== null) throw restoreFailed(th.pages.errors.restore.parentDeleted)
      newDepth = parent.depth + 1
    }
    const group: typeof rows = []
    const stack = [root]
    while (stack.length > 0) {
      const r = stack.pop()!
      group.push(r)
      stack.push(...(childrenOf.get(r.id) ?? []))
    }
    const delta = newDepth - root.depth
    if (Math.max(...group.map((r) => r.depth)) + delta > PAGE_MAX_DEPTH_INDEX) {
      throw restoreFailed(th.pages.errors.restore.tooDeep)
    }
    const ids = group.map((r) => r.id)
    await pagesRepo.restoreRows(tx, ids, delta)
    restored.push(...ids)
    await audit.log(tx, user, {
      entity: 'page',
      entityId: root.id,
      action: 'restore',
      projectId: root.projectId,
      summary: th.audit.pageRestored(root.title, ids.length),
      after: { batch, count: ids.length },
    })
  }
  const live = await pagesRepo.getPages(
    tx,
    roots.map((r) => r.id),
  )
  return { roots: live, ids: restored }
}
