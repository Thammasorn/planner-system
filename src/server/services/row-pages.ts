// src/server/services/row-pages.ts — database row bodies and the row page (SPEC §4.14 FR-1453, §7.7; plan/m11 S0.7
// signatures, S2 bodies; M11-D8). Mirrors services/task-pages.ts (M6.1): authz.requireDbRow first, DB_ROW page
// created lazily with `on conflict (database_row_id) do nothing`, audited only when inserted.
import { and, eq, isNull } from 'drizzle-orm'
import { th } from '@/i18n/th'
import type { SetPageFullWidthResult } from '@/lib/contracts/pages'
import type { EnsureRowBodyResult, RowBodyView, RowPageView } from '@/lib/contracts/row-pages'
import { isBlankPage } from '@/lib/pages/blank'
import * as audit from '../audit'
import * as authz from '../authz'
import type { DatabaseAccess } from '../authz'
import { databaseRows, pages, type DbRowRow, type PageRow } from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'
import { uploadLimits } from '../env'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import * as dbRepo from '../repo/databases'
import type { SessionUser } from '../session'

/**
 * Insert-or-get of the body of an authorised live row. The row is locked FOR SHARE first, so a concurrent
 * deleteDatabaseRows either commits before (row gone → 404) or waits for this insert and then deletes the new body
 * with its batch. A soft-deleted body of a live row is revived (defensive).
 */
async function insertOrGetBody(
  tx: Tx,
  user: SessionUser,
  a: DatabaseAccess & { row: DbRowRow },
): Promise<{ page: PageRow; created: boolean }> {
  const [live] = await tx
    .select({ id: databaseRows.id })
    .from(databaseRows)
    .where(and(eq(databaseRows.id, a.row.id), isNull(databaseRows.deletedAt)))
    .for('share')
  if (!live) throw new NotFoundError()
  const owner = a.owner.page
  const [inserted] = await tx
    .insert(pages)
    .values({
      space: owner.space,
      projectId: owner.projectId,
      kind: 'DB_ROW',
      databaseRowId: a.row.id,
      title: '',
      content: [],
      contentText: '',
      position: 'a0', // X48: fixed key, never part of a sibling scope
      createdBy: user.id,
      updatedBy: user.id,
    })
    .onConflictDoNothing({ target: pages.databaseRowId })
    .returning()
  if (inserted) return { page: inserted, created: true }
  const existing = await dbRepo.getRowBodyPage(tx, a.row.id, { forUpdate: true })
  if (!existing) throw new NotFoundError()
  if (existing.deletedAt !== null) {
    const [revived] = await tx
      .update(pages)
      .set({ deletedAt: null, deletedBatch: null })
      .where(eq(pages.id, existing.id))
      .returning()
    return { page: revived!, created: false }
  }
  return { page: existing, created: false }
}

/** requireDbRow(edit), row FOR SHARE, insert-or-get; `audited` = this call inserted (audit `page · create`). */
export async function ensureRowBody(
  tx: Tx,
  user: SessionUser,
  rowId: string,
): Promise<EnsureRowBodyResult & { audited: boolean }> {
  const a = await authz.requireDbRow(tx, user, rowId, 'edit') // W → 404, archived / locked (workers) → 403
  const { page, created } = await insertOrGetBody(tx, user, a)
  if (created) {
    await audit.log(tx, user, {
      entity: 'page',
      entityId: page.id,
      action: 'create',
      projectId: page.projectId,
      summary: th.audit.rowBodyCreated(a.database.title),
      after: { rowId: a.row.id },
    })
  }
  return { pageId: page.id, version: page.version, created, audited: created }
}

async function bodyViewOf(tx: DbOrTx, a: DatabaseAccess & { row: DbRowRow }): Promise<RowBodyView> {
  const row = await dbRepo.getRowBodyPage(tx, a.row.id)
  const page =
    row && row.deletedAt === null
      ? {
          id: row.id,
          version: row.version,
          content: row.content,
          fullWidth: row.fullWidth,
          isBlank: isBlankPage({ title: '', content: row.content }),
        }
      : null
  return {
    rowId: a.row.id,
    databaseId: a.database.id,
    ownerPageId: a.owner.page.id,
    space: a.owner.page.space,
    projectId: a.owner.page.projectId,
    page,
    can: { edit: a.canEdit },
    uploadLimits: uploadLimits(),
  }
}

/** GET /api/database-rows/[id]/body: requireDbRow(view) → body (page null when none), can.edit = canEditDatabase. */
export async function getRowBodyView(tx: DbOrTx, user: SessionUser, rowId: string): Promise<RowBodyView> {
  const a = await authz.requireDbRow(tx, user, rowId, 'view')
  return bodyViewOf(tx, a)
}

/** `/r/[rowId]` first paint (M11-D27). */
export async function getRowPageView(tx: DbOrTx, user: SessionUser, rowId: string): Promise<RowPageView> {
  const a = await authz.requireDbRow(tx, user, rowId, 'view')
  const ownerPage = a.owner.page
  const project = ownerPage.projectId ? await repo.projects.getProject(tx, ownerPage.projectId) : null
  const task = a.owner.task
  return {
    row: { id: a.row.id, title: a.row.title, databaseId: a.database.id },
    database: { id: a.database.id, title: a.database.title, ownerPageId: ownerPage.id },
    owner: {
      kind: task ? 'TASK' : 'DOC',
      pageId: ownerPage.id,
      title: task ? task.name : ownerPage.title,
      href: task ? `/t/${task.id}` : `/p/${ownerPage.id}`,
      projectId: ownerPage.projectId,
      projectName: project?.name ?? null,
      archived: a.owner.archived,
    },
    body: await bodyViewOf(tx, a),
  }
}

/** setPageFullWidth({ rowId }) (M11-D8): requireDbRow(edit) + silent ensure, one `page · update` audit per change. */
export async function setFullWidth(
  tx: Tx,
  user: SessionUser,
  target: { rowId: string },
  fullWidth: boolean,
): Promise<SetPageFullWidthResult> {
  const a = await authz.requireDbRow(tx, user, target.rowId, 'edit')
  const { page } = await insertOrGetBody(tx, user, a) // silent: no `create` audit (M6.1-D15)
  const [cur] = await tx.select().from(pages).where(eq(pages.id, page.id)).for('update')
  if (!cur || cur.deletedAt !== null) throw new NotFoundError()
  if (cur.fullWidth === fullWidth) return { pageId: cur.id, fullWidth, changed: false }
  await repo.pages.setFullWidth(tx, cur.id, fullWidth, user.id)
  const label = a.database.title // never the row title in audit (M11-D5)
  await audit.log(tx, user, {
    entity: 'page',
    entityId: cur.id,
    action: 'update',
    projectId: cur.projectId,
    summary: fullWidth ? th.audit.pageFullWidthOn(label) : th.audit.pageFullWidthOff(label),
    before: { fullWidth: cur.fullWidth },
    after: { fullWidth, rowId: a.row.id },
  })
  return { pageId: cur.id, fullWidth, changed: true }
}
