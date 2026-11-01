// src/server/services/teamTasks.ts — `/tasks` (SPEC v3.1 FR-665, §7.8, X75, M3-D33). camelCase file name is the
// documented exception (X80). Visibility is filtered in SQL through authz.visibleProjectIds (never on the client);
// archived projects are excluded; keyset pagination of 200 over (coalesce(due, infinity), project_id, position, id).
import { and, asc, eq, exists, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Certainty } from '@/domain/types'
import { th } from '@/i18n/th'
import type { TaskCard, TaskStatusDTO, TeamTasksResponse } from '@/lib/contracts/tasks'
import type { TeamTasksQuery } from '@/lib/schemas/tasks'
import { z } from '@/lib/z'
import * as authz from '../authz'
import { projects, taskAssignments, taskStatuses, tasks, user as users } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import type { SessionUser } from '../session'
import { toStatusDTO } from './taskStatuses'

export const TEAM_TASKS_PAGE = 200

const p1 = alias(tasks, 'p1')
const p2 = alias(tasks, 'p2')
const ta = alias(taskAssignments, 'ta')

const cursorSchema = z.tuple([z.iso.date().nullable(), z.uuid(), z.string().min(1).max(200), z.uuid()])
type Cursor = z.output<typeof cursorSchema>

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url')
}

function decodeCursor(s: string): Cursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(s, 'base64url').toString('utf8')))
  } catch {
    throw new ValidationError({ cursor: [th.errors.VALIDATION] })
  }
}

const sortKey = sql`(coalesce(${tasks.dueDate}, 'infinity'::date), ${tasks.projectId}, ${tasks.position}, ${tasks.id})`

export async function listTeamTasks(tx: DbOrTx, user: SessionUser, q: TeamTasksQuery): Promise<TeamTasksResponse> {
  const visible = await authz.visibleProjectIds(tx, user)
  if (q.projectId !== undefined && !(await authz.projectAccess(tx, user, q.projectId))) throw new NotFoundError()
  const empty: TeamTasksResponse = { cards: [], projects: [], statusesByProject: {}, nextCursor: null }
  if (visible !== 'ALL' && visible.size === 0) return empty

  const where: SQL[] = [isNull(tasks.deletedAt)]
  if (visible !== 'ALL') where.push(inArray(tasks.projectId, [...visible]))
  if (q.projectId !== undefined) where.push(eq(tasks.projectId, q.projectId))
  if (q.userId !== undefined) {
    where.push(
      exists(
        tx
          .select({ one: sql`1` })
          .from(ta)
          .where(and(eq(ta.taskId, tasks.id), eq(ta.userId, q.userId), isNull(ta.deletedAt))),
      ),
    )
  }
  if (q.positionId !== undefined) {
    where.push(
      exists(
        tx
          .select({ one: sql`1` })
          .from(ta)
          .innerJoin(users, eq(users.id, ta.userId))
          .where(and(eq(ta.taskId, tasks.id), isNull(ta.deletedAt), eq(users.positionId, q.positionId))),
      ),
    )
  }
  if (q.category !== undefined && q.category.length > 0) where.push(inArray(taskStatuses.category, q.category))
  if (!q.includeDone) where.push(ne(taskStatuses.category, 'DONE'))
  if (q.blocked) where.push(sql`${repo.tasks.blockerCountSql.open} > 0`)
  if (q.cursor !== undefined) {
    const [due, projectId, position, id] = decodeCursor(q.cursor)
    where.push(
      sql`${sortKey} > (coalesce(${due}::date, 'infinity'::date), ${projectId}::uuid, ${position}::text collate "C", ${id}::uuid)`,
    )
  }

  const rows = await tx
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      name: tasks.name,
      dueDate: tasks.dueDate,
      completedOn: tasks.completedOn,
      position: tasks.position,
      certainty: sql<Certainty>`coalesce(${tasks.certaintyOverride}, ${p1.certaintyOverride}, ${p2.certaintyOverride}, ${projects.certainty})`,
      parentName: p1.name,
      grandparentName: p2.name,
      statusId: taskStatuses.id,
      statusName: taskStatuses.name,
      statusColor: taskStatuses.color,
      statusCategory: taskStatuses.category,
      assigneeIds: sql<string[]>`coalesce((select json_agg(a.user_id order by a.created_at, a.id)
        from task_assignments a where a.task_id = ${tasks.id} and a.deleted_at is null), '[]'::json)`,
      blockersTotal: repo.tasks.blockerCountSql.total,
      blockersOpen: repo.tasks.blockerCountSql.open,
      hasBody: repo.tasks.hasBodySql, // FR-691 (M6.1-D11): only on cards of visible projects
    })
    .from(tasks)
    .innerJoin(
      projects,
      and(eq(projects.id, tasks.projectId), isNull(projects.archivedAt), isNull(projects.deletedAt)),
    )
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .leftJoin(p1, eq(p1.id, tasks.parentId))
    .leftJoin(p2, eq(p2.id, p1.parentId))
    .where(and(...where))
    .orderBy(sql`coalesce(${tasks.dueDate}, 'infinity'::date)`, asc(tasks.projectId), asc(tasks.position), asc(tasks.id))
    .limit(TEAM_TASKS_PAGE + 1)

  const page = rows.slice(0, TEAM_TASKS_PAGE)
  const last = page.at(-1)
  const nextCursor =
    rows.length > TEAM_TASKS_PAGE && last
      ? encodeCursor([last.dueDate, last.projectId, last.position, last.id])
      : null
  const cards: TaskCard[] = page.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    parentPath: [r.grandparentName, r.parentName].filter((n): n is string => n !== null),
    status: { id: r.statusId, name: r.statusName, color: r.statusColor, category: r.statusCategory },
    assigneeIds: r.assigneeIds,
    dueDate: r.dueDate,
    certainty: r.certainty,
    completed: r.completedOn !== null,
    blockers: { open: r.blockersOpen, total: r.blockersTotal },
    hasBody: r.hasBody,
  }))
  const projectIds = [...new Set(cards.map((c) => c.projectId))]
  const projectRows = await repo.projects.listProjects(tx, { ids: new Set(projectIds) })
  const statusRows = await repo.statuses.listLiveForProjects(tx, projectIds)
  const statusesByProject: Record<string, TaskStatusDTO[]> = {}
  for (const s of statusRows) (statusesByProject[s.projectId] ??= []).push(toStatusDTO(s))
  return {
    cards,
    projects: projectRows.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    statusesByProject,
    nextCursor,
  }
}
