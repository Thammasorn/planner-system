/**
 * Task rows and DB reads for the M6.1 e2e (plan/m06.1-task-page-ui.md S7.1). Plain Drizzle against `planner_e2e`
 * (X56): extras for `resetDb(undefined, { extras })` and read-only checks of what the UI wrote (pages rows of kind
 * TASK, audit rows) — the scenario itself always goes through the UI.
 */
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import { createScriptDb } from '../../scripts/lib/db'
import { auditLog, pages, projects, taskStatuses, tasks, user } from '../../src/server/db/schema'
import type { DbOrTx } from '../../src/server/db/types'
import { E2E } from '../env'

async function projectByName(db: DbOrTx, name: string): Promise<{ id: string }> {
  const rows = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, name))
  if (rows.length !== 1) throw new Error(`project ${name}: ${rows.length} rows`)
  return rows[0]!
}

/**
 * Inserts root tasks named `names` **before** every existing root task of the project (so the golden tasks end up
 * at the bottom of the list — T3 scrolls to them). Status = the project's first TODO status; creator = Manager.
 */
export async function insertRootTasksFirst(
  db: DbOrTx,
  o: { projectName: string; names: readonly string[] },
): Promise<void> {
  const project = await projectByName(db, o.projectName)
  const [manager] = await db.select({ id: user.id }).from(user).where(eq(user.nickname, 'Manager'))
  const [status] = await db
    .select({ id: taskStatuses.id })
    .from(taskStatuses)
    .where(
      and(
        eq(taskStatuses.projectId, project.id),
        eq(taskStatuses.category, 'TODO'),
        isNull(taskStatuses.deletedAt),
      ),
    )
    .orderBy(asc(taskStatuses.position))
    .limit(1)
  const [first] = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(and(eq(tasks.projectId, project.id), isNull(tasks.parentId), isNull(tasks.deletedAt)))
    .orderBy(sql`${tasks.position} collate "C"`)
    .limit(1)
  if (!manager || !status) throw new Error('insertRootTasksFirst: golden Manager / TODO status missing')
  const keys = generateNKeysBetween(null, first?.position ?? null, o.names.length)
  await db.insert(tasks).values(
    o.names.map((name, i) => ({
      projectId: project.id,
      depth: 0,
      name,
      position: keys[i]!,
      statusId: status.id,
      createdBy: manager.id,
    })),
  )
}

async function withDb<T>(fn: (db: DbOrTx) => Promise<T>): Promise<T> {
  const { db, close } = createScriptDb(E2E.databaseUrl)
  try {
    return await fn(db)
  } finally {
    await close()
  }
}

/** Id of the live task `taskName` in project `projectName` (throws unless exactly one). */
export function taskIdOf(projectName: string, taskName: string): Promise<string> {
  return withDb(async (db) => {
    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(projects.name, projectName), eq(tasks.name, taskName), isNull(tasks.deletedAt)))
    if (rows.length !== 1) throw new Error(`taskIdOf(${projectName}, ${taskName}): ${rows.length} rows`)
    return rows[0]!.id
  })
}

export interface TaskBodyRow {
  id: string
  kind: string
  title: string
  contentText: string
  fullWidth: boolean
  deletedAt: Date | null
  deletedBatch: string | null
}

/** Every `pages` row (live or deleted) whose `task_id` is the task — FR-681: at most one. */
export function taskBodyRows(taskId: string): Promise<TaskBodyRow[]> {
  return withDb((db) =>
    db
      .select({
        id: pages.id,
        kind: pages.kind,
        title: pages.title,
        contentText: pages.contentText,
        fullWidth: pages.fullWidth,
        deletedAt: pages.deletedAt,
        deletedBatch: pages.deletedBatch,
      })
      .from(pages)
      .where(eq(pages.taskId, taskId)),
  )
}

/** Count of all pages of kind TASK (FR-682 "counts equal before/after"). */
export function taskPageCount(): Promise<number> {
  return withDb(async (db) => {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(pages)
      .where(eq(pages.kind, 'TASK'))
    return r?.n ?? 0
  })
}

/** The newest audit_log id (a watermark: rows written after it are the scenario's own). */
export function auditWatermark(): Promise<number> {
  return withDb(async (db) => {
    const [r] = await db.select({ n: sql<number>`coalesce(max(${auditLog.id}), 0)::int` }).from(auditLog)
    return r?.n ?? 0
  })
}

/** Audit rows of `entity`/`entityId` written after `since` (oldest first). */
export function auditRowsSince(
  since: number,
  where: { entity: string; entityId: string },
): Promise<{ action: string; summary: string | null; projectId: string | null }[]> {
  return withDb((db) =>
    db
      .select({ action: auditLog.action, summary: auditLog.summary, projectId: auditLog.projectId })
      .from(auditLog)
      .where(
        and(
          gt(auditLog.id, since),
          eq(auditLog.entity, where.entity),
          eq(auditLog.entityId, where.entityId),
        ),
      )
      .orderBy(asc(auditLog.id)),
  )
}

/** Live task row facts the UI must agree with (AC-622). */
export function taskFacts(
  taskId: string,
): Promise<{ dueDate: string | null; completedOn: string | null; statusName: string } | undefined> {
  return withDb(async (db) => {
    const [r] = await db
      .select({ dueDate: tasks.dueDate, completedOn: tasks.completedOn, statusName: taskStatuses.name })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
      .where(eq(tasks.id, taskId))
    return r
  })
}

/** The live charter page of a project (5 golden charters share the title, so `idOf('page', …)` is ambiguous). */
export function charterIdOf(projectName: string): Promise<string> {
  return withDb(async (db) => {
    const rows = await db
      .select({ id: pages.id })
      .from(pages)
      .innerJoin(projects, eq(projects.id, pages.projectId))
      .where(and(eq(projects.name, projectName), eq(pages.isCharter, true), isNull(pages.deletedAt)))
    if (rows.length !== 1) throw new Error(`charterIdOf(${projectName}): ${rows.length} rows`)
    return rows[0]!.id
  })
}
