// src/server/repo/tasks.ts — tasks (FR-601, BR-30, X48). Live = deleted_at is null; siblings ORDER BY position, id.
// Plan dates are ISODate strings (date mode 'string'); `completed_week` is generated and never written (R6).
// Small typed queries; services compose them inside the caller's transaction (PLAN §3.4.5).
import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { Certainty, ISODate, TaskStatusCategory } from '@/domain/types'
import { taskStatuses, tasks } from '../db/schema'
import type { DbOrTx } from '../db/types'

export type TaskRow = typeof tasks.$inferSelect

export interface InsertTaskRow {
  projectId: string
  parentId?: string | null
  depth?: 0 | 1 | 2
  name: string
  position: string
  createdBy: string
  statusId: string
  notes?: string | null
  startDate?: ISODate | null
  dueDate?: ISODate | null
  certaintyOverride?: Certainty | null
  completedOn?: ISODate | null
  completedBy?: string | null
  deletedBatch?: string | null
  deletedAt?: Date | null
}

export async function insertTask(tx: DbOrTx, row: InsertTaskRow): Promise<TaskRow> {
  const [out] = await tx
    .insert(tasks)
    .values({
      projectId: row.projectId,
      parentId: row.parentId ?? null,
      depth: row.depth ?? 0,
      name: row.name,
      position: row.position,
      createdBy: row.createdBy,
      statusId: row.statusId,
      notes: row.notes ?? null,
      startDate: row.startDate ?? null,
      dueDate: row.dueDate ?? null,
      certaintyOverride: row.certaintyOverride ?? null,
      completedOn: row.completedOn ?? null,
      completedBy: row.completedBy ?? null,
      deletedBatch: row.deletedBatch ?? null,
      deletedAt: row.deletedAt ?? null,
    })
    .returning()
  return out!
}

/** Key of the last live child of `parentId` (null = roots) in display order; null when there is none. */
export async function lastChildPosition(
  tx: DbOrTx,
  projectId: string,
  parentId: string | null,
): Promise<string | null> {
  const [row] = await tx
    .select({ position: tasks.position })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        parentId === null ? isNull(tasks.parentId) : eq(tasks.parentId, parentId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(desc(tasks.position), desc(tasks.id))
    .limit(1)
  return row?.position ?? null
}

/** Row of the project task list loader (M3-D39); M6's grid chunk reuses it unchanged. */
export interface TaskListRow {
  id: string
  projectId: string
  parentId: string | null
  depth: number
  position: string
  name: string
  notes: string | null
  startDate: ISODate | null
  dueDate: ISODate | null
  certaintyOverride: Certainty | null
  statusId: string
  statusCategory: TaskStatusCategory
  completedOn: ISODate | null
  completedWeek: ISODate | null
  /** BR-86: live edges whose blocker task is live, and those whose blocker is not DONE (X73). */
  blockersOpen: number
  blockersTotal: number
}

/** BR-86 (X73): live edges whose blocker task is live / and whose blocker is not DONE — counted in SQL. */
const blockersTotalSql = sql<number>`(select count(*)::int from task_blockers b
    join tasks bt on bt.id = b.blocker_task_id and bt.deleted_at is null
    where b.task_id = ${tasks.id} and b.deleted_at is null)`.mapWith(Number)
const blockersOpenSql = sql<number>`(select count(*)::int from task_blockers b
    join tasks bt on bt.id = b.blocker_task_id and bt.deleted_at is null
    join task_statuses bs on bs.id = bt.status_id
    where b.task_id = ${tasks.id} and b.deleted_at is null and bs.category <> 'DONE')`.mapWith(Number)

/** SQL fragments shared with the team-tasks query (S2.16). */
export const blockerCountSql = { total: blockersTotalSql, open: blockersOpenSql }

const listColumns = {
  id: tasks.id,
  projectId: tasks.projectId,
  parentId: tasks.parentId,
  depth: tasks.depth,
  position: tasks.position,
  name: tasks.name,
  notes: tasks.notes,
  startDate: tasks.startDate,
  dueDate: tasks.dueDate,
  certaintyOverride: tasks.certaintyOverride,
  statusId: tasks.statusId,
  statusCategory: taskStatuses.category,
  completedOn: tasks.completedOn,
  completedWeek: tasks.completedWeek,
  blockersOpen: blockersOpenSql,
  blockersTotal: blockersTotalSql,
}

/** Live tasks of the project with blocker counts, no assignees (M3-D39). Parents before children. */
export async function listLiveWithBlockerCounts(tx: DbOrTx, projectId: string): Promise<TaskListRow[]> {
  return tx
    .select(listColumns)
    .from(tasks)
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.depth), sql`${tasks.parentId} asc nulls first`, asc(tasks.position), asc(tasks.id))
}

/** One live task in the list-loader shape (results of single-task mutations). */
export async function getLiveWithBlockerCounts(tx: DbOrTx, id: string): Promise<TaskListRow | null> {
  const [row] = await tx
    .select(listColumns)
    .from(tasks)
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
  return row ?? null
}

/** Live task or null; `forUpdate` locks the row until the transaction ends. */
export async function getLive(
  tx: DbOrTx,
  id: string,
  o?: { forUpdate?: boolean },
): Promise<TaskRow | null> {
  const q = tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
  const [row] = o?.forUpdate ? await q.for('update') : await q
  return row ?? null
}

/** Any task (live or soft-deleted) or null; `forUpdate` locks the row until the transaction ends. */
export async function getAny(tx: DbOrTx, id: string, o?: { forUpdate?: boolean }): Promise<TaskRow | null> {
  const q = tx.select().from(tasks).where(eq(tasks.id, id))
  const [row] = o?.forUpdate ? await q.for('update') : await q
  return row ?? null
}

/** Live children of `parentId` (null = roots) in display order (ORDER BY position, id). */
export async function liveChildren(
  tx: DbOrTx,
  projectId: string,
  parentId: string | null,
): Promise<{ id: string; position: string; depth: number }[]> {
  return tx
    .select({ id: tasks.id, position: tasks.position, depth: tasks.depth })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        parentId === null ? isNull(tasks.parentId) : eq(tasks.parentId, parentId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(tasks.position), asc(tasks.id))
}

export async function hasLiveChildren(tx: DbOrTx, id: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.parentId, id), isNull(tasks.deletedAt)))
    .limit(1)
  return row !== undefined
}

/** Ids among `ids` that have at least one live child. */
export async function idsWithLiveChildren(tx: DbOrTx, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await tx
    .selectDistinct({ id: tasks.parentId })
    .from(tasks)
    .where(and(inArray(tasks.parentId, [...ids]), isNull(tasks.deletedAt)))
  return new Set(rows.flatMap((r) => (r.id ? [r.id] : [])))
}

export async function setPosition(tx: DbOrTx, id: string, position: string): Promise<void> {
  await tx.update(tasks).set({ position }).where(eq(tasks.id, id))
}

export async function updatePlacement(
  tx: DbOrTx,
  id: string,
  v: { parentId: string | null; depth: number; position: string },
): Promise<void> {
  await tx.update(tasks).set(v).where(eq(tasks.id, id))
}

export async function shiftDepth(tx: DbOrTx, ids: readonly string[], delta: number): Promise<void> {
  if (ids.length === 0 || delta === 0) return
  await tx
    .update(tasks)
    .set({ depth: sql`${tasks.depth} + ${delta}` })
    .where(inArray(tasks.id, [...ids]))
}

const uuidArray = (ids: readonly string[]): SQL =>
  sql`array[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`

/** The live subtree of `rootId` (root first, BFS order, ≤ 3 levels); [] when the root is not live. */
export async function liveSubtree(tx: DbOrTx, rootId: string): Promise<{ id: string; depth: number }[]> {
  const rows = await tx.execute<{ id: string; depth: number }>(sql`
    with recursive sub as (
      select id, depth, 0 as lvl from tasks where id = ${rootId} and deleted_at is null
      union all
      select c.id, c.depth, sub.lvl + 1 from tasks c join sub on c.parent_id = sub.id
      where c.deleted_at is null and sub.lvl < 3
    )
    select id, depth::int as depth from sub order by lvl, id`)
  return [...rows]
}

/** Open (status not DONE) live descendants of the given roots (roots excluded), id order. */
export async function openLiveDescendantIds(tx: DbOrTx, rootIds: readonly string[]): Promise<string[]> {
  if (rootIds.length === 0) return []
  const rows = await tx.execute<{ id: string }>(sql`
    with recursive sub as (
      select c.id, 1 as lvl from tasks c
      where c.parent_id = any(${uuidArray(rootIds)}) and c.deleted_at is null
      union all
      select c.id, sub.lvl + 1 from tasks c join sub on c.parent_id = sub.id
      where c.deleted_at is null and sub.lvl < 3
    )
    select distinct sub.id from sub
    join tasks t on t.id = sub.id
    join task_statuses s on s.id = t.status_id
    where s.category <> 'DONE'
    order by sub.id`)
  return rows.map((r) => r.id)
}

/** Soft-deletes the live subtree of `rootId` under `batch` (BR-32); returns the ids it deleted. */
export async function softDeleteSubtree(tx: DbOrTx, rootId: string, batch: string): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    with recursive sub as (
      select id, 0 as lvl from tasks where id = ${rootId} and deleted_at is null
      union all
      select c.id, sub.lvl + 1 from tasks c join sub on c.parent_id = sub.id
      where c.deleted_at is null and sub.lvl < 3
    )
    update tasks set deleted_at = now(), deleted_batch = ${batch}, updated_at = now()
    where id in (select id from sub) and deleted_at is null
    returning id`)
  return rows.map((r) => r.id)
}

/** Rows of one deletion batch with whether they are still inside the 30-day window (DB time, M3-D12). */
export async function listBatch(
  tx: DbOrTx,
  batch: string,
): Promise<(TaskRow & { withinWindow: boolean })[]> {
  return tx
    .select({
      ...getTableColumns(tasks),
      withinWindow: sql<boolean>`(${tasks.deletedAt} > now() - interval '30 days')`,
    })
    .from(tasks)
    .where(eq(tasks.deletedBatch, batch))
    .orderBy(asc(tasks.depth), asc(tasks.position), asc(tasks.id))
}

/** Un-deletes the given rows of a batch, shifting their depth by `delta`. */
export async function restoreRows(tx: DbOrTx, ids: readonly string[], delta: number): Promise<void> {
  if (ids.length === 0) return
  await tx
    .update(tasks)
    .set({ deletedAt: null, deletedBatch: null, depth: sql`${tasks.depth} + ${delta}` })
    .where(inArray(tasks.id, [...ids]))
}

/** id → name for the given ids (audit summaries); deleted rows included. */
export async function namesByIds(tx: DbOrTx, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await tx
    .select({ id: tasks.id, name: tasks.name })
    .from(tasks)
    .where(inArray(tasks.id, [...ids]))
  return new Map(rows.map((r) => [r.id, r.name]))
}

export type TaskFieldPatch = Partial<
  Pick<TaskRow, 'name' | 'notes' | 'startDate' | 'dueDate' | 'certaintyOverride'>
>

export async function updateFields(tx: DbOrTx, id: string, patch: TaskFieldPatch): Promise<void> {
  await tx.update(tasks).set(patch).where(eq(tasks.id, id))
}

/** Live tasks of `ids` with their status category, locked FOR UPDATE OF tasks in id order (BR-80 writers). */
export async function lockWithCategory(
  tx: DbOrTx,
  projectId: string,
  ids: readonly string[],
): Promise<
  { id: string; statusId: string; completedOn: ISODate | null; completedBy: string | null; category: TaskStatusCategory }[]
> {
  if (ids.length === 0) return []
  return tx
    .select({
      id: tasks.id,
      statusId: tasks.statusId,
      completedOn: tasks.completedOn,
      completedBy: tasks.completedBy,
      category: taskStatuses.category,
    })
    .from(tasks)
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(and(eq(tasks.projectId, projectId), inArray(tasks.id, [...ids]), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.id))
    .for('update', { of: tasks })
}

export async function setStatusRow(
  tx: DbOrTx,
  id: string,
  v: { statusId: string; completedOn: ISODate | null; completedBy: string | null },
): Promise<void> {
  await tx.update(tasks).set(v).where(eq(tasks.id, id))
}

/** FR-409 progress (M3-D21): completed / all non-deleted tasks of the project, every depth. */
export async function progress(tx: DbOrTx, projectId: string): Promise<{ done: number; total: number }> {
  const [row] = await tx
    .select({
      done: sql<number>`count(*) filter (where ${tasks.completedOn} is not null)::int`.mapWith(Number),
      total: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
  return row ?? { done: 0, total: 0 }
}

/** id → parent id of the project's live tasks (blocker ancestry checks, BR-85). */
export async function parentMap(tx: DbOrTx, projectId: string): Promise<Map<string, string | null>> {
  const rows = await tx
    .select({ id: tasks.id, parentId: tasks.parentId })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
  return new Map(rows.map((r) => [r.id, r.parentId]))
}

/** Current status ids of the given tasks (audit summaries after a status change). */
export async function statusIdsOf(tx: DbOrTx, ids: readonly string[]): Promise<{ id: string; statusId: string }[]> {
  if (ids.length === 0) return []
  return tx
    .select({ id: tasks.id, statusId: tasks.statusId })
    .from(tasks)
    .where(inArray(tasks.id, [...ids]))
}
