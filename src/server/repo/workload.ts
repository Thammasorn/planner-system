// src/server/repo/workload.ts — the people side of the workload views (SPEC §4.10 FR-1001…1005, M9-D3/D5/D9;
// plan/m09 S2.2/S2.3). No allocations here (only repo/allocations.ts touches that table, M6-D24); loads come from
// repo.allocations.loadByUserProjectWeek. Callers pass visibleUserIds(viewer) first (§3.3) — this module never decides
// visibility itself.
import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Certainty, ISODate } from '@/domain/types'
import { positions, projects, taskAssignments, tasks, user } from '../db/schema'
import type { DbOrTx } from '../db/types'

export interface WorkloadCandidate {
  id: string
  name: string
  nickname: string | null
  positionId: string | null
  positionName: string | null
  banned: boolean
  deactivatedOn: ISODate | null
  /** M2-D16: not banned and no deactivated_on. */
  active: boolean
  /** Member of ≥ 1 non-archived, non-deleted project (M9-D3). */
  isActiveMember: boolean
  /** Those projects' ids (FR-1004 project filter, M9-D5). */
  memberProjectIds: string[]
}

/**
 * Users the caller may list: `visibleUsers` ('ALL' → no id filter) ∩ `userIds` (null → no extra restriction;
 * [] → nobody, without a query — C92) ∩ `positionId` (null → any). Unordered.
 */
export async function listCandidates(
  tx: DbOrTx,
  o: {
    visibleUsers: 'ALL' | ReadonlySet<string>
    userIds: readonly string[] | null
    positionId: string | null
  },
): Promise<WorkloadCandidate[]> {
  let ids: string[] | null = o.visibleUsers === 'ALL' ? null : [...o.visibleUsers]
  if (o.userIds !== null) ids = ids === null ? [...o.userIds] : ids.filter((id) => o.userIds!.includes(id))
  if (ids !== null && ids.length === 0) return []
  const where: SQL[] = []
  if (ids !== null) where.push(inArray(user.id, [...new Set(ids)]))
  if (o.positionId !== null) where.push(eq(user.positionId, o.positionId))
  const memberIds = sql<string[]>`coalesce((select array_agg(pm.project_id::text order by pm.project_id)
      from project_members pm
      join projects mp on mp.id = pm.project_id and mp.archived_at is null and mp.deleted_at is null
      where pm.user_id = ${user.id}), '{}'::text[])`
  const rows = await tx
    .select({
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      positionId: user.positionId,
      positionName: positions.name,
      banned: sql<boolean>`(${user.banned} is true)`,
      deactivatedOn: user.deactivatedOn,
      memberProjectIds: memberIds,
    })
    .from(user)
    .leftJoin(positions, eq(positions.id, user.positionId))
    .where(where.length > 0 ? and(...where) : undefined)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nickname: r.nickname,
    positionId: r.positionId,
    positionName: r.positionName,
    banned: r.banned,
    deactivatedOn: r.deactivatedOn,
    active: !r.banned && r.deactivatedOn === null,
    isActiveMember: r.memberProjectIds.length > 0,
    memberProjectIds: r.memberProjectIds,
  }))
}

/** All positions in display order (`position` COLLATE "C", then id — X48). */
export async function listPositions(tx: DbOrTx): Promise<{ id: string; name: string }[]> {
  return tx
    .select({ id: positions.id, name: positions.name })
    .from(positions)
    .orderBy(sql`${positions.position} collate "C"`, asc(positions.id))
}

export interface CellTaskRow {
  assignmentId: string
  taskId: string
  taskName: string
  taskPosition: string
  /** Root → parent (≤ 2 names). */
  parentPath: string[]
  projectId: string
  projectName: string
  projectColor: string
  /** coalesce(t, parent, grandparent, project) — §6.5. */
  certainty: Certainty
  completed: boolean
  completedWeek: ISODate | null
}

/** FR-1005 (M9-D9): task facts behind the given live assignments (live tasks of live, non-archived projects). */
export async function listCellTasks(tx: DbOrTx, assignmentIds: readonly string[]): Promise<CellTaskRow[]> {
  if (assignmentIds.length === 0) return []
  const p1 = alias(tasks, 'p1')
  const p2 = alias(tasks, 'p2')
  const rows = await tx
    .select({
      assignmentId: taskAssignments.id,
      taskId: tasks.id,
      taskName: tasks.name,
      taskPosition: tasks.position,
      p1Name: p1.name,
      p2Name: p2.name,
      projectId: projects.id,
      projectName: projects.name,
      projectColor: projects.color,
      certainty: sql<Certainty>`coalesce(${tasks.certaintyOverride}, ${p1.certaintyOverride}, ${p2.certaintyOverride}, ${projects.certainty})`,
      completedOn: tasks.completedOn,
      completedWeek: tasks.completedWeek,
    })
    .from(taskAssignments)
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .leftJoin(p1, eq(p1.id, tasks.parentId))
    .leftJoin(p2, eq(p2.id, p1.parentId))
    .innerJoin(
      projects,
      and(eq(projects.id, tasks.projectId), isNull(projects.deletedAt), isNull(projects.archivedAt)),
    )
    .where(and(inArray(taskAssignments.id, [...new Set(assignmentIds)]), isNull(taskAssignments.deletedAt)))
  return rows.map((r) => ({
    assignmentId: r.assignmentId,
    taskId: r.taskId,
    taskName: r.taskName,
    taskPosition: r.taskPosition,
    parentPath: [r.p2Name, r.p1Name].filter((n): n is string => n !== null),
    projectId: r.projectId,
    projectName: r.projectName,
    projectColor: r.projectColor,
    certainty: r.certainty,
    completed: r.completedOn !== null,
    completedWeek: r.completedWeek,
  }))
}
