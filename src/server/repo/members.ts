// src/server/repo/members.ts — typed queries on `project_members` (FR-403, BR-62). Namespace `repo.members` (X87;
// M10 reuses listMembers). S0: the insert used by the golden seed and the services (M2-D13); S1 adds the rest.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { ProjectRole } from '@/domain/types'
import type { MemberUser } from '@/lib/contracts/projects'
import { positions, projectMembers, projects, user, type ProjectMemberRow } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { personActive } from './people'

export async function insertMember(
  tx: DbOrTx,
  v: { projectId: string; userId: string; role: ProjectRole; addedBy: string | null },
): Promise<ProjectMemberRow> {
  const [row] = await tx.insert(projectMembers).values(v).returning()
  if (!row) throw new Error('insert failed')
  return row
}

export type MemberWithUser = ProjectMemberRow & MemberUser

const memberColumns = {
  projectId: projectMembers.projectId,
  userId: projectMembers.userId,
  role: projectMembers.role,
  addedBy: projectMembers.addedBy,
  addedAt: projectMembers.addedAt,
  name: user.name,
  nickname: user.nickname,
  positionName: positions.name,
  color: user.color,
  active: personActive,
}

export async function getMember(
  tx: DbOrTx,
  projectId: string,
  userId: string,
): Promise<ProjectMemberRow | null> {
  const [row] = await tx
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  return row ?? null
}

/** Members of one project with their user fields (unordered; services sort LEAD first, then compareThai). */
export async function listMembers(tx: DbOrTx, projectId: string): Promise<MemberWithUser[]> {
  return tx
    .select(memberColumns)
    .from(projectMembers)
    .innerJoin(user, eq(user.id, projectMembers.userId))
    .leftJoin(positions, eq(positions.id, user.positionId))
    .where(eq(projectMembers.projectId, projectId))
}

/** Members of several projects (list pages); an empty id list yields []. */
export async function listMembersOf(tx: DbOrTx, projectIds: readonly string[]): Promise<MemberWithUser[]> {
  if (projectIds.length === 0) return []
  return tx
    .select(memberColumns)
    .from(projectMembers)
    .innerJoin(user, eq(user.id, projectMembers.userId))
    .leftJoin(positions, eq(positions.id, user.positionId))
    .where(inArray(projectMembers.projectId, [...projectIds]))
}

/**
 * BR-62 guard (M2-D06): locks the project's LEAD rows (only project_members rows, in user-id order so concurrent
 * callers cannot deadlock) until the transaction ends. A concurrent demotion/removal that committed first is
 * re-evaluated by Postgres and drops out of the result.
 */
export async function lockLeadRows(
  tx: DbOrTx,
  projectId: string,
): Promise<{ userId: string; active: boolean }[]> {
  return tx
    .select({ userId: projectMembers.userId, active: personActive })
    .from(projectMembers)
    .innerJoin(user, eq(user.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'LEAD')))
    .orderBy(asc(projectMembers.userId))
    .for('update', { of: projectMembers })
}

export async function updateMemberRole(
  tx: DbOrTx,
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  await tx
    .update(projectMembers)
    .set({ role })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
}

export async function deleteMember(tx: DbOrTx, projectId: string, userId: string): Promise<boolean> {
  const rows = await tx
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .returning({ userId: projectMembers.userId })
  return rows.length > 0
}

/** The user's memberships on non-deleted projects (archived included). */
export async function membershipsOf(
  tx: DbOrTx,
  userId: string,
): Promise<{ projectId: string; role: ProjectRole; archived: boolean }[]> {
  const rows = await tx
    .select({
      projectId: projectMembers.projectId,
      role: projectMembers.role,
      archivedAt: projects.archivedAt,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), isNull(projects.deletedAt)))
  return rows.map((r) => ({ projectId: r.projectId, role: r.role, archived: r.archivedAt !== null }))
}
