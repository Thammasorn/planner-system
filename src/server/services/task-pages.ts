// src/server/services/task-pages.ts — task bodies (TASK pages) and the task page loader (SPEC §4.6.4, §7.7; plan/m06.1
// S0.7 signatures, S1.5/S1.6/S1.9 bodies). Every function authorises itself first (requireTask / requireDocPage)
// before touching data, inside the caller's transaction. Services never read the clock (X56).
import { and, eq, isNull } from 'drizzle-orm'
import { th } from '@/i18n/th'
import type { SetPageFullWidthResult } from '@/lib/contracts/pages'
import type { EnsureTaskBodyResult, TaskBodyView, TaskPageView } from '@/lib/contracts/task-pages'
import { isBlankPage } from '@/lib/pages/blank'
import * as audit from '../audit'
import * as authz from '../authz'
import { pages, tasks, type PageRow } from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'
import { uploadLimits } from '../env'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import type { TaskRow } from '../repo/tasks'
import type { SessionUser } from '../session'

/** BR-30: at most two ancestors (depth index 0..2); the walk is bounded anyway. */
const MAX_ANCESTORS = 2

/**
 * Insert-or-get of the body of an authorised live task. The task row is locked FOR SHARE first, so a concurrent
 * deleteTaskTree (which updates it) either commits before — the task is gone → 404 — or waits for this insert and
 * then soft-deletes the new body with its batch (R7). A soft-deleted body of a live task is revived (defensive).
 */
async function insertOrGetBody(
  tx: Tx,
  user: SessionUser,
  task: TaskRow,
): Promise<{ page: PageRow; created: boolean }> {
  const [live] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, task.id), isNull(tasks.deletedAt)))
    .for('share')
  if (!live) throw new NotFoundError()
  const inserted = await repo.pages.insertTaskBodyIfMissing(tx, {
    taskId: task.id,
    projectId: task.projectId,
    userId: user.id,
  })
  if (inserted) return { page: inserted, created: true }
  const existing = await repo.pages.getTaskBodyRow(tx, task.id, { forUpdate: true })
  if (!existing) throw new NotFoundError() // cascaded away with its task in between (cannot happen under the lock)
  if (existing.deletedAt !== null) return { page: await repo.pages.reviveTaskBody(tx, existing.id), created: false }
  return { page: existing, created: false }
}

/**
 * M6.1-D6: requireTask(edit) → insert the TASK page (`on conflict (task_id) do nothing`) or return the existing one;
 * a soft-deleted body of a live task is revived; audits `page · create` only when it inserted (`audited`).
 * Never called by createTask / quick add (AC-627).
 */
export async function ensureTaskBody(
  tx: Tx,
  user: SessionUser,
  taskId: string,
): Promise<EnsureTaskBodyResult & { audited: boolean }> {
  const a = await authz.requireTask(tx, user, taskId, 'edit') // W → 404, archived → 403
  const { page, created } = await insertOrGetBody(tx, user, a.task)
  if (created) {
    await audit.log(tx, user, {
      entity: 'page',
      entityId: page.id,
      action: 'create',
      projectId: a.task.projectId,
      summary: th.audit.taskBodyCreated(a.task.name),
      after: { taskId: a.task.id },
    })
  }
  return { pageId: page.id, version: page.version, created, audited: created }
}

/** The body view of a task the caller already authorised for `view`. */
async function bodyViewOf(tx: DbOrTx, task: TaskRow, archived: boolean): Promise<TaskBodyView> {
  const row = await repo.pages.getTaskBodyRow(tx, task.id)
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
  return { taskId: task.id, projectId: task.projectId, page, can: { edit: !archived }, uploadLimits: uploadLimits() }
}

/** M6.1-D7: requireTask(view) → the body (page null when no row), can.edit = !archived, upload limits. */
export async function getTaskBodyView(tx: DbOrTx, user: SessionUser, taskId: string): Promise<TaskBodyView> {
  const a = await authz.requireTask(tx, user, taskId, 'view') // W / deleted / malformed → 404
  return bodyViewOf(tx, a.task, a.archived)
}

/** `/t/[taskId]` first paint (M6.1-D7): requireTask(view) → project, live ancestors (root → parent), body view. */
export async function getTaskPageView(tx: DbOrTx, user: SessionUser, taskId: string): Promise<TaskPageView> {
  const a = await authz.requireTask(tx, user, taskId, 'view')
  const project = await repo.projects.getProject(tx, a.task.projectId)
  if (!project) throw new NotFoundError()
  const ancestors: { id: string; name: string }[] = []
  let parentId = a.task.parentId
  while (parentId !== null && ancestors.length < MAX_ANCESTORS) {
    const parent = await repo.tasks.getLive(tx, parentId)
    if (!parent) break // a live task never has a deleted parent (BR-32 deletes subtrees); stop defensively
    ancestors.unshift({ id: parent.id, name: parent.name })
    parentId = parent.parentId
  }
  return {
    task: { id: a.task.id, name: a.task.name, projectId: a.task.projectId },
    project: { id: project.id, name: project.name, color: project.color, archived: project.archivedAt !== null },
    ancestors,
    body: await bodyViewOf(tx, a.task, a.archived),
  }
}

/**
 * M6.1-D15: DOC → requireDocPage(edit); task → requireTask(edit) + silent ensure (no create audit). Exactly one
 * `page · update` audit row per change; the same value → `{ changed: false }` without audit. No lease needed.
 */
export async function setFullWidth(
  tx: Tx,
  user: SessionUser,
  target: { pageId: string } | { taskId: string },
  fullWidth: boolean,
): Promise<SetPageFullWidthResult> {
  let pageId: string
  let label: string
  if ('pageId' in target) {
    const a = await authz.requireDocPage(tx, user, target.pageId, 'edit') // protected (workers) / archived → 403
    pageId = a.page.id
    label = a.page.title
  } else {
    const a = await authz.requireTask(tx, user, target.taskId, 'edit') // W → 404, archived → 403
    pageId = (await insertOrGetBody(tx, user, a.task)).page.id // silent: no `create` audit (M6.1-D15)
    label = a.task.name
  }
  // Row lock: two concurrent toggles serialise, so each change writes exactly one audit row (AC-1602).
  const [cur] = await tx.select().from(pages).where(eq(pages.id, pageId)).for('update')
  if (!cur || cur.deletedAt !== null) throw new NotFoundError()
  if (cur.fullWidth === fullWidth) return { pageId: cur.id, fullWidth, changed: false }
  await repo.pages.setFullWidth(tx, cur.id, fullWidth, user.id)
  await audit.log(tx, user, {
    entity: 'page',
    entityId: cur.id,
    action: 'update',
    projectId: cur.projectId,
    summary: fullWidth ? th.audit.pageFullWidthOn(label) : th.audit.pageFullWidthOff(label),
    before: { fullWidth: cur.fullWidth },
    after: { fullWidth },
  })
  return { pageId: cur.id, fullWidth, changed: true }
}
