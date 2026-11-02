// src/server/repo/task-assignments.ts — task assignments (FR-605, BR-31). Active = deleted_at is null; one active
// row per (task_id, user_id) (task_assignments_active). `version` is bumped by every allocation writer (M6, BR-20b).
// Soft delete under a batch (unassign, FR-404); restore re-checks the active unique pair.
import { and, asc, eq, getTableColumns, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Certainty, ISODate } from '@/domain/types'
import { projects, taskAssignments, tasks } from '../db/schema'
import type { DbOrTx } from '../db/types'

export type AssignmentRow = typeof taskAssignments.$inferSelect

export async function insertAssignment(
  tx: DbOrTx,
  row: { taskId: string; userId: string; deletedBatch?: string | null; deletedAt?: Date | null },
): Promise<AssignmentRow> {
  const [out] = await tx
    .insert(taskAssignments)
    .values({
      taskId: row.taskId,
      userId: row.userId,
      deletedBatch: row.deletedBatch ?? null,
      deletedAt: row.deletedAt ?? null,
    })
    .returning()
  return out!
}

/** Active assignments on live tasks of the project, ORDER BY created_at, id. M6 (M6-D36) adds `version`
 *  (GridAssigneeRow.version); M3's listProjectTasks still maps only assignmentId/userId. */
export async function listActiveForProject(
  tx: DbOrTx,
  projectId: string,
): Promise<{ id: string; taskId: string; userId: string; version: number }[]> {
  return tx
    .select({
      id: taskAssignments.id,
      taskId: taskAssignments.taskId,
      userId: taskAssignments.userId,
      version: taskAssignments.version,
    })
    .from(taskAssignments)
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .where(and(eq(tasks.projectId, projectId), isNull(taskAssignments.deletedAt)))
    .orderBy(asc(taskAssignments.createdAt), asc(taskAssignments.id))
}

/** Active assignments of one task (ORDER BY created_at, id); `forUpdate` locks them (BR-31 transfers). */
export async function activeForTask(
  tx: DbOrTx,
  taskId: string,
  o?: { forUpdate?: boolean },
): Promise<AssignmentRow[]> {
  const q = tx
    .select()
    .from(taskAssignments)
    .where(and(eq(taskAssignments.taskId, taskId), isNull(taskAssignments.deletedAt)))
    .orderBy(asc(taskAssignments.createdAt), asc(taskAssignments.id))
  return o?.forUpdate ? q.for('update') : q
}

/** Active assignments of the given ids on `taskId`, locked FOR UPDATE (id order). */
export async function lockActiveOnTask(
  tx: DbOrTx,
  ids: readonly string[],
  taskId: string,
): Promise<AssignmentRow[]> {
  if (ids.length === 0) return []
  return tx
    .select()
    .from(taskAssignments)
    .where(
      and(
        inArray(taskAssignments.id, [...ids]),
        eq(taskAssignments.taskId, taskId),
        isNull(taskAssignments.deletedAt),
      ),
    )
    .orderBy(asc(taskAssignments.id))
    .for('update')
}

/** M6 plan writers (services/allocations#lockAssignments): one live assignment on a live task with what a save needs. */
export interface PlanAssignmentRow {
  id: string
  version: number
  userId: string
  taskId: string
  projectId: string
  hasChildren: boolean
  completedWeek: ISODate | null
  /** Effective certainty (BR-35): coalesce(task, parent, grandparent, project) — the §6.5 expression. */
  certainty: Certainty
}

/**
 * M6 (BR-20b, r6b E11): the live assignments among `ids` on live tasks, ORDER BY ta.id; with `lock`,
 * `FOR UPDATE OF ta` (deterministic lock order — deadlock-free batches). Missing/deleted ids are simply absent.
 */
export async function selectForPlan(
  tx: DbOrTx,
  ids: readonly string[],
  o: { lock: boolean },
): Promise<PlanAssignmentRow[]> {
  if (ids.length === 0) return []
  const p1 = alias(tasks, 'p1')
  const p2 = alias(tasks, 'p2')
  const q = tx
    .select({
      id: taskAssignments.id,
      version: taskAssignments.version,
      userId: taskAssignments.userId,
      taskId: taskAssignments.taskId,
      projectId: tasks.projectId,
      hasChildren: sql<boolean>`exists (select 1 from tasks c where c.parent_id = ${tasks.id} and c.deleted_at is null)`,
      completedWeek: tasks.completedWeek,
      certainty: sql<Certainty>`coalesce(${tasks.certaintyOverride}, ${p1.certaintyOverride}, ${p2.certaintyOverride}, ${projects.certainty})`,
    })
    .from(taskAssignments)
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .leftJoin(p1, eq(p1.id, tasks.parentId))
    .leftJoin(p2, eq(p2.id, p1.parentId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(inArray(taskAssignments.id, [...ids]), isNull(taskAssignments.deletedAt)))
    .orderBy(asc(taskAssignments.id))
  return o.lock ? q.for('update', { of: taskAssignments }) : q
}

/** ★ M6 (BR-20b, M6-D36): version + 1 for each id (the caller holds the row locks); empty → no query. */
export async function bumpVersions(tx: DbOrTx, ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const rows = await tx
    .update(taskAssignments)
    .set({ version: sql`${taskAssignments.version} + 1` })
    .where(inArray(taskAssignments.id, [...ids]))
    .returning({ id: taskAssignments.id, version: taskAssignments.version })
  return new Map(rows.map((r) => [r.id, r.version]))
}

/** X20: re-point assignments to another task and bump their version (BR-20b lock for M6 writers). */
export async function repoint(tx: DbOrTx, ids: readonly string[], toTaskId: string): Promise<void> {
  if (ids.length === 0) return
  await tx
    .update(taskAssignments)
    .set({ taskId: toTaskId, version: sql`${taskAssignments.version} + 1` })
    .where(inArray(taskAssignments.id, [...ids]))
}

/** Inserts an active assignment unless one exists (partial unique index task_assignments_active); null = existed. */
export async function insertIfAbsent(
  tx: DbOrTx,
  v: { taskId: string; userId: string },
): Promise<AssignmentRow | null> {
  const [row] = await tx
    .insert(taskAssignments)
    .values(v)
    .onConflictDoNothing({
      target: [taskAssignments.taskId, taskAssignments.userId],
      where: sql`deleted_at is null`,
    })
    .returning()
  return row ?? null
}

/** Soft-deletes the given active rows under `batch`; returns the ids it changed. */
export async function softDelete(tx: DbOrTx, ids: readonly string[], batch: string): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await tx
    .update(taskAssignments)
    .set({ deletedAt: sql`now()`, deletedBatch: batch })
    .where(and(inArray(taskAssignments.id, [...ids]), isNull(taskAssignments.deletedAt)))
    .returning({ id: taskAssignments.id })
  return rows.map((r) => r.id)
}

/** Rows of one unassign batch with the 30-day window flag (DB time, M3-D12). */
export async function listBatch(
  tx: DbOrTx,
  batch: string,
): Promise<(AssignmentRow & { withinWindow: boolean })[]> {
  return tx
    .select({
      ...getTableColumns(taskAssignments),
      withinWindow: sql<boolean>`(${taskAssignments.deletedAt} > now() - interval '30 days')`,
    })
    .from(taskAssignments)
    .where(eq(taskAssignments.deletedBatch, batch))
    .orderBy(asc(taskAssignments.createdAt), asc(taskAssignments.id))
}

/** Un-deletes one row unless the same (task, user) is already active again (never lets 23505 escape, r5 #10). */
export async function restoreOne(tx: DbOrTx, id: string): Promise<boolean> {
  const other = alias(taskAssignments, 'ta_other')
  const rows = await tx
    .update(taskAssignments)
    .set({ deletedAt: null, deletedBatch: null })
    .where(
      and(
        eq(taskAssignments.id, id),
        isNotNull(taskAssignments.deletedAt),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(other)
            .where(
              and(
                eq(other.taskId, taskAssignments.taskId),
                eq(other.userId, taskAssignments.userId),
                isNull(other.deletedAt),
              ),
            ),
        ),
      ),
    )
    .returning({ id: taskAssignments.id })
  return rows.length > 0
}

/** BR-61 / M3-D14: distinct live tasks of the project with an active assignment of the user (completed included). */
export async function countOpenAssignmentTasks(tx: DbOrTx, projectId: string, userId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(distinct ${tasks.id})::int`.mapWith(Number) })
    .from(taskAssignments)
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .where(
      and(eq(tasks.projectId, projectId), eq(taskAssignments.userId, userId), isNull(taskAssignments.deletedAt)),
    )
  return row?.n ?? 0
}

/** M3-D14: every active assignment of the user in the project (also on soft-deleted tasks). */
export async function activeIdsForMember(tx: DbOrTx, projectId: string, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: taskAssignments.id })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
    .where(
      and(eq(tasks.projectId, projectId), eq(taskAssignments.userId, userId), isNull(taskAssignments.deletedAt)),
    )
    .orderBy(asc(taskAssignments.id))
  return rows.map((r) => r.id)
}

/** M9 (C52, person grid / cell detail): live assignments of one user on live tasks of live, non-archived projects,
 *  ORDER BY project, task position (COLLATE "C"), task id. No allocations read here. */
export async function listActiveForUserLive(
  tx: DbOrTx,
  userId: string,
): Promise<{ id: string; taskId: string; projectId: string; version: number }[]> {
  return tx
    .select({
      id: taskAssignments.id,
      taskId: taskAssignments.taskId,
      projectId: tasks.projectId,
      version: taskAssignments.version,
    })
    .from(taskAssignments)
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .innerJoin(
      projects,
      and(eq(projects.id, tasks.projectId), isNull(projects.deletedAt), isNull(projects.archivedAt)),
    )
    .where(and(eq(taskAssignments.userId, userId), isNull(taskAssignments.deletedAt)))
    .orderBy(asc(tasks.projectId), sql`${tasks.position} collate "C"`, asc(tasks.id))
}
