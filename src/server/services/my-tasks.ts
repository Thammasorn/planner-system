// src/server/services/my-tasks.ts — `/my` basic (FR-1009 basic, X22, M3-D8) and the sidebar count. Only the caller's
// own assignments are selected: open (completed_on null), assigned, live leaf tasks in non-archived projects the
// caller is a member of — BR-60 makes every legitimate assignment a member's, and the membership filter keeps a
// stray one (e.g. on a task restored after its assignee left) from leaking a project the caller cannot see (§3.3).
// M9 adds buckets and redefines the count (M9-D17).
// M6.1: rows carry `hasBody` (FR-691) and the response the live statuses of the listed projects only (FR-1606 "/my
// เปลี่ยนสถานะ", M6.1-D12/D25) — every group is a member project, so nothing outside the viewer's projects leaks.
import { and, asc, eq, exists, isNull, notExists, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { compareThai } from '@/lib/collate'
import type { MyTaskDTO, MyTasksResponse, TaskStatusDTO } from '@/lib/contracts/tasks'
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

export async function listMyTasks(tx: DbOrTx, user: SessionUser): Promise<MyTasksResponse> {
  authz.requireUser(user)
  const rows = await tx
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      name: tasks.name,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
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
    .where(myOpenFilters(tx, user.id))
    .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt), asc(tasks.id))
  const groups = new Map<string, MyTasksResponse['groups'][number]>()
  for (const r of rows) {
    let g = groups.get(r.projectId)
    if (!g) {
      g = {
        project: { id: r.projectId, name: r.projectName, color: r.projectColor, certainty: r.projectCertainty },
        tasks: [],
      }
      groups.set(r.projectId, g)
    }
    const t: MyTaskDTO = {
      id: r.id,
      projectId: r.projectId,
      name: r.name,
      parentName: r.parentName,
      startDate: r.startDate,
      dueDate: r.dueDate,
      status: { id: r.statusId, name: r.statusName, color: r.statusColor, category: r.statusCategory },
      hasBody: r.hasBody,
    }
    g.tasks.push(t)
  }
  const sorted = [...groups.values()].sort(
    (a, b) => compareThai(a.project.name, b.project.name) || compareThai(a.project.id, b.project.id),
  )
  const statusesByProject: Record<string, TaskStatusDTO[]> = {}
  const statusRows = await repo.statuses.listLiveForProjects(
    tx,
    sorted.map((g) => g.project.id),
  )
  for (const s of statusRows) (statusesByProject[s.projectId] ??= []).push(toStatusDTO(s))
  return { groups: sorted, count: rows.length, statusesByProject }
}

/** Sidebar "งานของฉัน N" (X22): the number of tasks on `/my`. */
export async function countMyOpenTasks(tx: DbOrTx, userId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(taskAssignments)
    .innerJoin(tasks, taskJoin)
    .innerJoin(projects, projectJoin)
    .where(myOpenFilters(tx, userId))
  return row?.n ?? 0
}
