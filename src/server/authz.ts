// src/server/authz.ts — every permission decision lives here (SPEC §3.4 AZ-1, PLAN.md §3.4.4).
// Each milestone's S0 adds signatures; the backend stream writes the bodies. M1: role helpers · M2: project / client
// access and the §3.3 visibility helpers. Not visible → NotFoundError (404); visible but not allowed → ForbiddenError.
import { and, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { th } from '@/i18n/th'
import type { ProjectAccessRole } from '@/lib/contracts/projects'
import { z } from '@/lib/z'
import { clients, projectMembers, projects } from './db/schema'
import type { DbOrTx } from './db/types'
import { ForbiddenError, NotFoundError, UnauthenticatedError } from './errors'
import type { SessionUser } from './session'

export type SystemRole = 'manager' | 'worker'

/** Better Auth types `user.role` as `string | null`; only exactly 'manager' is a manager. */
export function narrowRole(role: string | null | undefined): SystemRole {
  return role === 'manager' ? 'manager' : 'worker'
}

export function requireUser(user: SessionUser | null | undefined): asserts user is SessionUser {
  if (!user) throw new UnauthenticatedError()
}

export function isManager(user: Pick<SessionUser, 'role'>): boolean {
  return user.role === 'manager'
}

/** Manager-only global actions (§3.2 PERM-01, PERM-02): workers get FORBIDDEN (X41). */
export function requireManager(user: SessionUser): void {
  requireUser(user)
  if (!isManager(user)) throw new ForbiddenError()
}

// ---------------------------------------------------------------------------------------------------------------
// M2 — project / client authorization and §3.3 visibility (PLAN.md §3.4.4, M2-D01, M2-D02, X42, X43).
// Queries live here (not in repo/) so authz stays self-contained; every projects query filters deleted_at is null.
// ---------------------------------------------------------------------------------------------------------------

/**
 * view: M, L, Me (archived allowed) · edit: M, L, Me (archived → FORBIDDEN) · manage: M, L (archived → FORBIDDEN
 * unless `allowArchived`) · owner: M (archived allowed — permanent delete).
 */
export type Need = 'view' | 'edit' | 'manage' | 'owner'

export interface ProjectAccess {
  role: ProjectAccessRole
  archived: boolean
}

const uuidSchema = z.uuid()
const isUuid = (id: string): boolean => uuidSchema.safeParse(id).success

/** Null when the project is unknown, malformed, deleted, or the worker is not a member. Managers → MANAGER. */
export async function projectAccess(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string,
): Promise<ProjectAccess | null> {
  if (!isUuid(projectId)) return null // no 22P02 → 500 (M2-D02, X86)
  const [row] = await tx
    .select({ archivedAt: projects.archivedAt, role: projectMembers.role })
    .from(projects)
    .leftJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, user.id)),
    )
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
  if (!row) return null
  const archived = row.archivedAt !== null
  if (isManager(user)) return { role: 'MANAGER', archived }
  return row.role ? { role: row.role, archived } : null
}

/** Null access → NotFoundError; insufficient role or archived write → ForbiddenError (X42, M2-D02). */
export async function requireProject(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string,
  need: Need,
  opts?: { allowArchived?: boolean },
): Promise<ProjectAccess> {
  requireUser(user)
  const access = await projectAccess(tx, user, projectId)
  if (!access) throw new NotFoundError()
  if (need === 'view') return access
  if (access.archived && (need === 'edit' || need === 'manage') && !opts?.allowArchived) {
    throw new ForbiddenError(th.projects.errors.archivedReadOnly)
  }
  const ok =
    need === 'edit' ||
    (need === 'manage' && (access.role === 'MANAGER' || access.role === 'LEAD')) ||
    (need === 'owner' && access.role === 'MANAGER')
  if (!ok) throw new ForbiddenError()
  return access
}

/** "ดูลูกค้า" (§3.2): manager, or a worker who is a member of ≥ 1 project of the client; else NotFoundError (M2-D01). */
export async function requireClient(
  tx: DbOrTx,
  user: SessionUser,
  clientId: string,
): Promise<{ clientId: string }> {
  requireUser(user)
  if (!isUuid(clientId)) throw new NotFoundError()
  const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId))
  if (!client) throw new NotFoundError()
  if (isManager(user)) return { clientId }
  const [hit] = await tx
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(
      and(eq(projects.clientId, clientId), isNull(projects.deletedAt), eq(projectMembers.userId, user.id)),
    )
    .limit(1)
  if (!hit) throw new NotFoundError()
  return { clientId }
}

/** Projects whose details the user may see: manager → 'ALL'; worker → member projects incl. archived (X43). */
export async function visibleProjectIds(tx: DbOrTx, user: SessionUser): Promise<'ALL' | Set<string>> {
  requireUser(user)
  if (isManager(user)) return 'ALL'
  const rows = await tx
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, user.id), isNull(projects.deletedAt)))
  return new Set(rows.map((r) => r.id))
}

/** Users whose totals the user may see (§3.3, X43): manager or LEAD of a non-archived project → 'ALL'; else self ∪
 *  users sharing ≥ 1 non-archived project (deactivated users included). */
export async function visibleUserIds(tx: DbOrTx, user: SessionUser): Promise<'ALL' | Set<string>> {
  requireUser(user)
  if (isManager(user) || (await isLeadAnywhere(tx, user))) return 'ALL'
  const mine = alias(projectMembers, 'pm_mine')
  const rows = await tx
    .selectDistinct({ userId: projectMembers.userId })
    .from(mine)
    .innerJoin(
      projects,
      and(eq(projects.id, mine.projectId), isNull(projects.archivedAt), isNull(projects.deletedAt)),
    )
    .innerJoin(projectMembers, eq(projectMembers.projectId, mine.projectId))
    .where(eq(mine.userId, user.id))
  const out = new Set(rows.map((r) => r.userId))
  out.add(user.id)
  return out
}

/** `visibleUserIds(viewer)` contains `userId` (M9 /people/[id]). */
export async function canSeeUserDetails(tx: DbOrTx, viewer: SessionUser, userId: string): Promise<boolean> {
  const visible = await visibleUserIds(tx, viewer)
  return visible === 'ALL' || visible.has(userId)
}

/** LEAD of at least one non-archived project. */
export async function isLeadAnywhere(tx: DbOrTx, user: SessionUser): Promise<boolean> {
  requireUser(user)
  const [hit] = await tx
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .innerJoin(
      projects,
      and(eq(projects.id, projectMembers.projectId), isNull(projects.archivedAt), isNull(projects.deletedAt)),
    )
    .where(and(eq(projectMembers.userId, user.id), eq(projectMembers.role, 'LEAD')))
    .limit(1)
  return hit !== undefined
}
