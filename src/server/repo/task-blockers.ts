// src/server/repo/task-blockers.ts — "ถูกขวางโดย" edges (SPEC v3.1 FR-640–645, X73): `task_id` is blocked by
// `blocker_task_id`, both in `project_id` (composite FKs). Live = deleted_at is null. Live = deleted_at is null (and both tasks live for reads).
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { BlockerEdgeDTO } from '@/lib/contracts/tasks'
import { taskBlockers, tasks } from '../db/schema'
import type { DbOrTx } from '../db/types'

export type TaskBlockerRow = typeof taskBlockers.$inferSelect

export async function insertBlocker(
  tx: DbOrTx,
  row: {
    projectId: string
    taskId: string
    blockerTaskId: string
    createdBy: string
    deletedBatch?: string | null
    deletedAt?: Date | null
  },
): Promise<TaskBlockerRow> {
  const [out] = await tx
    .insert(taskBlockers)
    .values({
      projectId: row.projectId,
      taskId: row.taskId,
      blockerTaskId: row.blockerTaskId,
      createdBy: row.createdBy,
      deletedBatch: row.deletedBatch ?? null,
      deletedAt: row.deletedAt ?? null,
    })
    .returning()
  return out!
}

const blockerTask = alias(tasks, 'bt')
const blockedTask = alias(tasks, 'tt')

/** Live edges of the project whose two tasks are live (M3-D37 `blockerEdges`), id order. */
export async function listLiveEdges(tx: DbOrTx, projectId: string): Promise<BlockerEdgeDTO[]> {
  return tx
    .select({ id: taskBlockers.id, taskId: taskBlockers.taskId, blockerTaskId: taskBlockers.blockerTaskId })
    .from(taskBlockers)
    .innerJoin(blockedTask, and(eq(blockedTask.id, taskBlockers.taskId), isNull(blockedTask.deletedAt)))
    .innerJoin(blockerTask, and(eq(blockerTask.id, taskBlockers.blockerTaskId), isNull(blockerTask.deletedAt)))
    .where(and(eq(taskBlockers.projectId, projectId), isNull(taskBlockers.deletedAt)))
    .orderBy(asc(taskBlockers.createdAt), asc(taskBlockers.id))
}

/** The live edge `taskId` blocked by `blockerTaskId`, or null. */
export async function findLive(
  tx: DbOrTx,
  taskId: string,
  blockerTaskId: string,
): Promise<TaskBlockerRow | null> {
  const [row] = await tx
    .select()
    .from(taskBlockers)
    .where(
      and(
        eq(taskBlockers.taskId, taskId),
        eq(taskBlockers.blockerTaskId, blockerTaskId),
        isNull(taskBlockers.deletedAt),
      ),
    )
  return row ?? null
}

/** A live edge by id, or null. */
export async function getLive(tx: DbOrTx, id: string): Promise<TaskBlockerRow | null> {
  const [row] = await tx
    .select()
    .from(taskBlockers)
    .where(and(eq(taskBlockers.id, id), isNull(taskBlockers.deletedAt)))
  return row ?? null
}

/** M3-D31: a hand-removed edge keeps `deleted_batch = null` (batches are only for task-tree deletion, §7.8). */
export async function softDeleteOne(tx: DbOrTx, id: string): Promise<void> {
  await tx
    .update(taskBlockers)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(taskBlockers.id, id), isNull(taskBlockers.deletedAt)))
}

/** FR-645: soft-deletes every live edge touching the given tasks under the tree-deletion batch. */
export async function softDeleteTouching(tx: DbOrTx, taskIds: readonly string[], batch: string): Promise<number> {
  if (taskIds.length === 0) return 0
  const rows = await tx
    .update(taskBlockers)
    .set({ deletedAt: sql`now()`, deletedBatch: batch })
    .where(
      and(
        isNull(taskBlockers.deletedAt),
        or(inArray(taskBlockers.taskId, [...taskIds]), inArray(taskBlockers.blockerTaskId, [...taskIds])),
      ),
    )
    .returning({ id: taskBlockers.id })
  return rows.length
}

/** Restores the edges of a tree-deletion batch whose two tasks are live again (X73); an edge whose other task was
 *  deleted in another batch stays deleted. Skips a pair that is live again (re-added meanwhile). */
export async function restoreBatch(tx: DbOrTx, batch: string): Promise<number> {
  const rows = await tx.execute<{ id: string }>(sql`
    update task_blockers b set deleted_at = null, deleted_batch = null
    where b.deleted_batch = ${batch}
      and exists (select 1 from tasks t where t.id = b.task_id and t.deleted_at is null)
      and exists (select 1 from tasks t where t.id = b.blocker_task_id and t.deleted_at is null)
      and not exists (select 1 from task_blockers o where o.task_id = b.task_id
                        and o.blocker_task_id = b.blocker_task_id and o.deleted_at is null)
    returning b.id`)
  return rows.length
}
