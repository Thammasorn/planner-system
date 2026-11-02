// src/server/services/my-tasks.ts — `/my` basic (FR-1009 basic, X22, M3-D8) and the sidebar count. Only the caller's
// own assignments are selected: open (completed_on null), assigned, live leaf tasks in non-archived projects the
// caller is a member of — BR-60 makes every legitimate assignment a member's, and the membership filter keeps a
// stray one (e.g. on a task restored after its assignee left) from leaking a project the caller cannot see (§3.3).
// M9 adds buckets and redefines the count (M9-D17).
// M6.1: rows carry `hasBody` (FR-691) and the response the live statuses of the listed projects only (FR-1606 "/my
// เปลี่ยนสถานะ", M6.1-D12/D25) — every group is a member project, so nothing outside the viewer's projects leaks.
import { and, eq, exists, isNull, notExists, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { addWeeks, weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import type { MyBucketTask, MyTaskBucketsResponse, TaskStatusDTO } from '@/lib/contracts/tasks'
import { bucketOf, MY_BUCKETS, sortBucketTasks } from '@/lib/my/buckets'
import * as authz from '../authz'
import { projectMembers, projects, taskAssignments, taskStatuses, tasks } from '../db/schema'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'
import type { SessionUser } from '../session'
import { toStatusDTO } from './taskStatuses'

const parentTask = alias(tasks, 'par')
const childTask = alias(tasks, 'c')

function myOpenFilters(tx: DbOrTx, userId: string): SQL {
  return and(
    eq(taskAssignments.userId, userId),
    isNull(taskAssignments.deletedAt),
    exists(
      tx
        .select({ one: sql`1` })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, userId))),
    ),
    notExists(
      tx
        .select({ one: sql`1` })
        .from(childTask)
        .where(and(eq(childTask.parentId, tasks.id), isNull(childTask.deletedAt))),
    ),
  )!
}

const taskJoin = and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt), isNull(tasks.completedOn))
const projectJoin = and(eq(projects.id, tasks.projectId), isNull(projects.archivedAt), isNull(projects.deletedAt))

/** M9 (M9-D17): my open assignments behind `/my` (the M3 /my filters) — assignment id + task facts. */
async function myOpenRows(tx: DbOrTx, userId: string) {
  return tx
    .select({
      assignmentId: taskAssignments.id,
      id: tasks.id,
      projectId: tasks.projectId,
      name: tasks.name,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      parentName: parentTask.name,
      projectName: projects.name,
      projectColor: projects.color,
      projectCertainty: projects.certainty,
      statusId: taskStatuses.id,
      statusName: taskStatuses.name,
      statusColor: taskStatuses.color,
      statusCategory: taskStatuses.category,
      hasBody: repo.tasks.hasBodySql,
    })
    .from(taskAssignments)
    .innerJoin(tasks, taskJoin)
    .innerJoin(projects, projectJoin)
    .leftJoin(parentTask, eq(parentTask.id, tasks.parentId))
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(myOpenFilters(tx, userId))
}

/** FR-1009 horizon (M9-D17): [weekStart(today), +157 w) — the timeline's forward bound (X65). */
const bucketRange = (today: ISODate) => ({ from: weekStart(today), to: addWeeks(weekStart(today), 157) })

/** Sidebar "งานของฉัน N" (X22, M9-D17): my open tasks in สัปดาห์นี้ (= `/my` THIS_WEEK count). */
export async function countMyOpenTasks(tx: DbOrTx, userId: string, today: ISODate): Promise<number> {
  const rows = await tx
    .select({ id: taskAssignments.id })
    .from(taskAssignments)
    .innerJoin(tasks, taskJoin)
    .innerJoin(projects, projectJoin)
    .where(myOpenFilters(tx, userId))
  const ws = weekStart(today)
  const sums = await repo.allocations.sumCountedByAssignment(
    tx,
    rows.map((r) => r.id),
    { from: ws, to: addWeeks(ws, 1) },
  )
  let n = 0
  for (const cd of sums.values()) if (cd > 0) n++
  return n
}

// ── M9 (FR-1009 buckets, M9-D17, X95) ──

/** `/my` grouped by the earliest week ≥ weekStart(today) with my counted cd > 0 (bounded to +157 w). */
export async function listMyTaskBuckets(
  tx: DbOrTx,
  user: SessionUser,
  today: ISODate,
): Promise<MyTaskBucketsResponse> {
  authz.requireUser(user)
  const rows = await myOpenRows(tx, user.id)
  const first = await repo.allocations.firstPlannedWeekByAssignment(
    tx,
    rows.map((r) => r.assignmentId),
    bucketRange(today),
  )
  const items = rows.map((r) => {
    const f = first.get(r.assignmentId) ?? null
    const task: MyBucketTask = {
      id: r.id,
      projectId: r.projectId,
      name: r.name,
      parentName: r.parentName,
      startDate: r.startDate,
      dueDate: r.dueDate,
      status: { id: r.statusId, name: r.statusName, color: r.statusColor, category: r.statusCategory },
      hasBody: r.hasBody,
      project: { id: r.projectId, name: r.projectName, color: r.projectColor, certainty: r.projectCertainty },
      firstWeek: f?.week ?? null,
      plannedCd: f?.cd ?? null,
    }
    return { task, firstWeek: task.firstWeek, dueDate: task.dueDate, createdAt: r.createdAt.toISOString(), id: r.id }
  })
  const buckets = MY_BUCKETS.map((key) => ({
    key,
    tasks: sortBucketTasks(items.filter((i) => bucketOf(i.firstWeek, today) === key)).map((i) => i.task),
  }))
  const statusesByProject: Record<string, TaskStatusDTO[]> = {}
  const projectIds = [...new Set(rows.map((r) => r.projectId))].sort()
  for (const st of await repo.statuses.listLiveForProjects(tx, projectIds)) {
    ;(statusesByProject[st.projectId] ??= []).push(toStatusDTO(st))
  }
  return { today, buckets, count: buckets.find((b) => b.key === 'THIS_WEEK')!.tasks.length, statusesByProject }
}
