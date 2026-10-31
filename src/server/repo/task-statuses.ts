// src/server/repo/task-statuses.ts — per-project task statuses (SPEC v3.1 FR-620–624, X70, X72). Live = deleted_at is
// null; board order ORDER BY position, id (COLLATE "C", X48). Soft delete under a batch (X72).
import { and, asc, eq, getTableColumns, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm'
import type { ISODate, TaskStatusCategory } from '@/domain/types'
import { projects, taskStatuses, tasks } from '../db/schema'
import type { DbOrTx } from '../db/types'

export type TaskStatusRow = typeof taskStatuses.$inferSelect

export async function insertTaskStatus(
  tx: DbOrTx,
  row: {
    projectId: string
    name: string
    category: TaskStatusCategory
    color: string
    position: string
    deletedBatch?: string | null
    deletedAt?: Date | null
  },
): Promise<TaskStatusRow> {
  const [out] = await tx
    .insert(taskStatuses)
    .values({
      projectId: row.projectId,
      name: row.name,
      category: row.category,
      color: row.color,
      position: row.position,
      deletedBatch: row.deletedBatch ?? null,
      deletedAt: row.deletedAt ?? null,
    })
    .returning()
  return out!
}

/** Live statuses of the project, ORDER BY position, id. */
export async function listLiveStatuses(tx: DbOrTx, projectId: string): Promise<TaskStatusRow[]> {
  return tx
    .select()
    .from(taskStatuses)
    .where(and(eq(taskStatuses.projectId, projectId), isNull(taskStatuses.deletedAt)))
    .orderBy(asc(taskStatuses.position), asc(taskStatuses.id))
}

/** Live status of the given project, or null (other project / deleted / unknown — callers answer NOT_FOUND). */
export async function getLiveInProject(
  tx: DbOrTx,
  projectId: string,
  id: string,
): Promise<TaskStatusRow | null> {
  const [row] = await tx
    .select()
    .from(taskStatuses)
    .where(and(eq(taskStatuses.id, id), eq(taskStatuses.projectId, projectId), isNull(taskStatuses.deletedAt)))
  return row ?? null
}

/** Live tasks per live status of the project (statuses without tasks are absent). */
export async function usage(tx: DbOrTx, projectId: string): Promise<Record<string, number>> {
  const rows = await tx
    .select({ statusId: tasks.statusId, n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(tasks)
    .innerJoin(taskStatuses, and(eq(taskStatuses.id, tasks.statusId), isNull(taskStatuses.deletedAt)))
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .groupBy(tasks.statusId)
  return Object.fromEntries(rows.map((r) => [r.statusId, r.n]))
}

/** Number of live tasks on one status. */
export async function liveTaskCount(tx: DbOrTx, statusId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(tasks)
    .where(and(eq(tasks.statusId, statusId), isNull(tasks.deletedAt)))
  return row?.n ?? 0
}

/** Every task on the status (live and soft-deleted), locked FOR UPDATE in id order (status delete, X72/M3-D29). */
export async function lockTasksOnStatus(
  tx: DbOrTx,
  statusId: string,
): Promise<{ id: string; completedOn: ISODate | null; completedBy: string | null; live: boolean }[]> {
  const rows = await tx
    .select({
      id: tasks.id,
      completedOn: tasks.completedOn,
      completedBy: tasks.completedBy,
      deletedAt: tasks.deletedAt,
    })
    .from(tasks)
    .where(eq(tasks.statusId, statusId))
    .orderBy(asc(tasks.id))
    .for('update')
  return rows.map((r) => ({ id: r.id, completedOn: r.completedOn, completedBy: r.completedBy, live: r.deletedAt === null }))
}

export type StatusPatch = Partial<Pick<TaskStatusRow, 'name' | 'category' | 'color' | 'position'>>

export async function updateStatusRow(tx: DbOrTx, id: string, patch: StatusPatch): Promise<TaskStatusRow> {
  const [row] = await tx.update(taskStatuses).set(patch).where(eq(taskStatuses.id, id)).returning()
  if (!row) throw new Error('update failed')
  return row
}

export async function softDelete(tx: DbOrTx, id: string, batch: string): Promise<void> {
  await tx
    .update(taskStatuses)
    .set({ deletedAt: sql`now()`, deletedBatch: batch })
    .where(and(eq(taskStatuses.id, id), isNull(taskStatuses.deletedAt)))
}

/** The status deleted under `batch` with the 30-day window flag (DB time), or null. */
export async function getByBatch(
  tx: DbOrTx,
  batch: string,
): Promise<(TaskStatusRow & { withinWindow: boolean }) | null> {
  const [row] = await tx
    .select({
      ...getTableColumns(taskStatuses),
      withinWindow: sql<boolean>`(${taskStatuses.deletedAt} > now() - interval '30 days')`,
    })
    .from(taskStatuses)
    .where(and(eq(taskStatuses.deletedBatch, batch), isNotNull(taskStatuses.deletedAt)))
    .limit(1)
  return row ?? null
}

export async function undelete(tx: DbOrTx, id: string): Promise<TaskStatusRow> {
  const [row] = await tx
    .update(taskStatuses)
    .set({ deletedAt: null, deletedBatch: null })
    .where(eq(taskStatuses.id, id))
    .returning()
  if (!row) throw new Error('update failed')
  return row
}

/** Non-deleted projects without any live status (X70 backfill), id order. */
export async function projectIdsWithoutStatuses(tx: DbOrTx): Promise<string[]> {
  const rows = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        isNull(projects.deletedAt),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(taskStatuses)
            .where(and(eq(taskStatuses.projectId, projects.id), isNull(taskStatuses.deletedAt))),
        ),
      ),
    )
    .orderBy(asc(projects.id))
  return rows.map((r) => r.id)
}

/** Live statuses of several projects (team tasks), ORDER BY project, position, id. */
export async function listLiveForProjects(tx: DbOrTx, projectIds: readonly string[]): Promise<TaskStatusRow[]> {
  if (projectIds.length === 0) return []
  return tx
    .select()
    .from(taskStatuses)
    .where(and(inArray(taskStatuses.projectId, [...projectIds]), isNull(taskStatuses.deletedAt)))
    .orderBy(asc(taskStatuses.projectId), asc(taskStatuses.position), asc(taskStatuses.id))
}

/** Live status by id (any project), or null. */
export async function getLiveById(tx: DbOrTx, id: string): Promise<TaskStatusRow | null> {
  const [row] = await tx
    .select()
    .from(taskStatuses)
    .where(and(eq(taskStatuses.id, id), isNull(taskStatuses.deletedAt)))
  return row ?? null
}

/** id → name of the given statuses (deleted included; audit summaries). */
export async function namesByIds(tx: DbOrTx, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await tx
    .select({ id: taskStatuses.id, name: taskStatuses.name })
    .from(taskStatuses)
    .where(inArray(taskStatuses.id, [...ids]))
  return new Map(rows.map((r) => [r.id, r.name]))
}
