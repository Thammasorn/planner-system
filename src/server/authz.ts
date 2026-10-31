// src/server/authz.ts — every permission decision lives here (SPEC §3.4 AZ-1, PLAN.md §3.4.4).
// Each milestone's S0 adds signatures; the backend stream writes the bodies. M1: role helpers · M2: project / client
// access and the §3.3 visibility helpers. Not visible → NotFoundError (404); visible but not allowed → ForbiddenError.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { th } from '@/i18n/th'
import type { ProjectAccessRole } from '@/lib/contracts/projects'
import { z } from '@/lib/z'
import type { PageSpace } from '@/lib/contracts/pages'
import {
  clients,
  type FileRow,
  type PageRow,
  projectMembers,
  projects,
  taskAssignments,
  taskStatuses,
  tasks,
  user as userTable,
} from './db/schema'
import type { DbOrTx } from './db/types'
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from './errors'
import * as filesRepo from './repo/files'
import * as pagesRepo from './repo/pages'
import type { TaskRow } from './repo/tasks'
import type { AssignmentRow } from './repo/task-assignments'
import type { TaskStatusRow } from './repo/task-statuses'
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

// ---------------------------------------------------------------------------------------------------------------
// M3 — task / assignment / status access (plan/m03 S0.6, R-AUTHZ: multi-id helpers added to PLAN §3.4.4).
// Signatures by S0; bodies by S2.1. Each resolves the owning project, then delegates to requireProject(need).
// Malformed ids are a 404 like unknown ones (no 22P02 → 500, X86).
// ---------------------------------------------------------------------------------------------------------------

export type ProjectAccessInfo = ProjectAccess

/** One project for a set of rows: any invisible project → 404 (checked before the multi-project rule, so nothing
 *  leaks); more than one → VALIDATION sameProjectOnly (M3-D23); then requireProject(need). */
async function requireOneProject(
  tx: DbOrTx,
  user: SessionUser,
  projectIds: readonly string[],
  need: Need,
): Promise<{ projectId: string } & ProjectAccessInfo> {
  const distinct = [...new Set(projectIds)]
  if (distinct.length === 0) throw new NotFoundError()
  for (const id of distinct) if (!(await projectAccess(tx, user, id))) throw new NotFoundError()
  if (distinct.length > 1) {
    throw new ValidationError({ taskIds: [th.tasks.errors.sameProjectOnly] }, th.tasks.errors.sameProjectOnly)
  }
  const projectId = distinct[0]!
  const access = await requireProject(tx, user, projectId, need)
  return { projectId, ...access }
}

/** Live task → its project → requireProject(need). Missing/deleted task or invisible project → NotFoundError. */
export async function requireTask(
  tx: DbOrTx,
  user: SessionUser,
  taskId: string,
  need: Need,
): Promise<{ task: TaskRow } & ProjectAccessInfo> {
  requireUser(user)
  if (!isUuid(taskId)) throw new NotFoundError()
  const [task] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
  if (!task) throw new NotFoundError()
  const access = await requireProject(tx, user, task.projectId, need)
  return { task, ...access }
}

/** All live; any missing or invisible → 404; more than one project → ValidationError(th.tasks.errors.sameProjectOnly);
 *  then requireProject(need). Rows come back in id order. */
export async function requireTasks(
  tx: DbOrTx,
  user: SessionUser,
  taskIds: readonly string[],
  need: Need,
): Promise<{ projectId: string; tasks: TaskRow[] } & ProjectAccessInfo> {
  requireUser(user)
  const ids = [...new Set(taskIds)]
  if (ids.length === 0 || !ids.every(isUuid)) throw new NotFoundError()
  const rows = await tx
    .select()
    .from(tasks)
    .where(and(inArray(tasks.id, ids), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.id))
  if (rows.length !== ids.length) throw new NotFoundError()
  const access = await requireOneProject(
    tx,
    user,
    rows.map((r) => r.projectId),
    need,
  )
  return { ...access, tasks: rows }
}

/** Active or batch-deleted assignment rows → their live tasks (or any task with `includeDeletedTasks`, used by batch
 *  restores whose rows may sit on a since-deleted task) → one project → requireProject(need). */
export async function requireAssignments(
  tx: DbOrTx,
  user: SessionUser,
  assignmentIds: readonly string[],
  need: Need,
  o?: { includeDeletedTasks?: boolean },
): Promise<{ projectId: string; rows: AssignmentRow[] } & ProjectAccessInfo> {
  requireUser(user)
  const ids = [...new Set(assignmentIds)]
  if (ids.length === 0 || !ids.every(isUuid)) throw new NotFoundError()
  const found = await tx
    .select({ row: taskAssignments, projectId: tasks.projectId })
    .from(taskAssignments)
    .innerJoin(
      tasks,
      o?.includeDeletedTasks
        ? eq(tasks.id, taskAssignments.taskId)
        : and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)),
    )
    .where(inArray(taskAssignments.id, ids))
    .orderBy(asc(taskAssignments.id))
  if (found.length !== ids.length) throw new NotFoundError()
  const access = await requireOneProject(
    tx,
    user,
    found.map((f) => f.projectId),
    need,
  )
  return { ...access, rows: found.map((f) => f.row) }
}

/** v3.1: live status (or a batch-deleted one when includeDeleted) → its project → requireProject(need). Missing or
 *  invisible → NotFoundError. PERM-23 callers pass 'manage' (X79). */
export async function requireStatus(
  tx: DbOrTx,
  user: SessionUser,
  statusId: string,
  need: Need,
  o?: { includeDeleted?: boolean },
): Promise<{ status: TaskStatusRow } & ProjectAccessInfo> {
  requireUser(user)
  if (!isUuid(statusId)) throw new NotFoundError()
  const [status] = await tx
    .select()
    .from(taskStatuses)
    .where(
      o?.includeDeleted
        ? eq(taskStatuses.id, statusId)
        : and(eq(taskStatuses.id, statusId), isNull(taskStatuses.deletedAt)),
    )
  if (!status) throw new NotFoundError()
  const access = await requireProject(tx, user, status.projectId, need)
  return { status, ...access }
}

// ---------------------------------------------------------------------------------------------------------------
// M4 — pages and files (SPEC §3.2 PERM-16…19, FR-510, X41/X42/X63, M4-D17/D24/D31). Signatures by S0; bodies by S1.
// Invisible (non-member project, deleted, malformed id) → NotFoundError; visible but not allowed (protected for a
// worker, archived project write) → ForbiddenError.
// ---------------------------------------------------------------------------------------------------------------

/** view: everyone who can see the space · edit: + not archived, not effectively protected for workers · protect:
 *  managers on WORKSPACE pages (PROJECT page → VALIDATION protectWikiOnly for managers, 403 workers). */
export type PageNeed = 'view' | 'edit' | 'protect'

export interface PageAccess {
  page: PageRow
  /** MANAGER for managers everywhere; LEAD/MEMBER on PROJECT pages; WIKI for workers on WORKSPACE pages. */
  role: 'MANAGER' | 'LEAD' | 'MEMBER' | 'WIKI'
  archived: boolean
  /** The page or an ancestor has locked = true (WORKSPACE only, M4-D24). */
  effectiveProtected: boolean
  isManager: boolean
}

/** Live page → PROJECT: requireProject(view|edit) · WORKSPACE: any user; edit blocked by effective protection for
 *  workers. Missing/deleted/malformed id → NotFoundError (X86). */
export async function requirePage(
  tx: DbOrTx,
  user: SessionUser,
  pageId: string,
  need: PageNeed,
): Promise<PageAccess> {
  requireUser(user)
  const page = await pagesRepo.getLivePageOrNotFound(tx, pageId)
  return accessForPage(tx, user, page, need)
}

/** requirePage's rules for a row the caller already loaded (restore checks a soft-deleted batch root this way). */
export async function accessForPage(
  tx: DbOrTx,
  user: SessionUser,
  page: PageRow,
  need: PageNeed,
): Promise<PageAccess> {
  requireUser(user)
  const manager = isManager(user)
  if (page.space === 'PROJECT') {
    const acc = await requireProject(tx, user, page.projectId!, need === 'view' ? 'view' : 'edit') // W → 404
    if (need === 'protect') {
      if (!manager) throw new ForbiddenError()
      const msg = th.pages.errors.protectWikiOnly
      throw new ValidationError({ pageId: [msg] }, msg)
    }
    return { page, role: acc.role, archived: acc.archived, effectiveProtected: false, isManager: manager }
  }
  const prot = await effectiveProtection(tx, page.id)
  if (need === 'protect' && !manager) throw new ForbiddenError()
  if (need === 'edit' && prot && !manager) throw new ForbiddenError(th.pages.errors.protectedReadOnly)
  return {
    page,
    role: manager ? 'MANAGER' : 'WIKI',
    archived: false,
    effectiveProtected: prot,
    isManager: manager,
  }
}

const crossSpace = (): ValidationError => {
  const msg = th.pages.errors.crossSpace
  return new ValidationError({ parentId: [msg] }, msg)
}

/** M4-D31 for a second page named by a request: view (404) → same space/project (400 crossSpace) → edit (403). */
export async function assertSecondPage(
  tx: DbOrTx,
  user: SessionUser,
  otherId: string,
  scope: { space: PageSpace; projectId: string | null },
): Promise<PageAccess> {
  const seen = await requirePage(tx, user, otherId, 'view') // invisible / deleted → 404
  if (seen.page.space !== scope.space || seen.page.projectId !== scope.projectId) throw crossSpace()
  return accessForPage(tx, user, seen.page, 'edit') // protected (workers) / archived → 403
}

/** May the user create a page at `target` (space root or under `parentId`)? Parent checks follow M4-D31. */
export async function requirePageCreate(
  tx: DbOrTx,
  user: SessionUser,
  target: { space: PageSpace; projectId: string | null; parentId: string | null },
): Promise<{ parent: PageAccess | null }> {
  requireUser(user)
  if ((target.space === 'PROJECT') !== (target.projectId !== null)) throw crossSpace()
  // The named project itself must be visible first: a 400 for a visible parent would otherwise confirm that an
  // invisible target project exists (PG-CREATE-X: W → 404).
  if (target.space === 'PROJECT') await requireProject(tx, user, target.projectId!, 'view')
  if (target.parentId) {
    return { parent: await assertSecondPage(tx, user, target.parentId, target) }
  }
  if (target.space === 'PROJECT') await requireProject(tx, user, target.projectId!, 'edit')
  return { parent: null }
}

/** Workers may not delete/move a subtree that contains a protected page (M4-D24); managers pass. */
export async function requireSubtreeUnprotected(
  tx: DbOrTx,
  user: SessionUser,
  pageId: string,
): Promise<void> {
  requireUser(user)
  if (isManager(user)) return
  if (await pagesRepo.subtreeHasLocked(tx, pageId)) throw new ForbiddenError(th.pages.errors.subtreeProtected)
}

/** Download authz by `files.project_id` only (M4-D17): null → any user; else requireProject(view), archived ok. */
export async function requireFile(tx: DbOrTx, user: SessionUser, fileId: string): Promise<{ file: FileRow }> {
  requireUser(user)
  const file = await filesRepo.getFile(tx, fileId)
  if (!file) throw new NotFoundError()
  if (file.projectId) await requireProject(tx, user, file.projectId, 'view')
  return { file }
}

/** True when the page or an ancestor is locked (recursive CTE, ≤ 10 levels; WORKSPACE only). */
export function effectiveProtection(tx: DbOrTx, pageId: string): Promise<boolean> {
  return pagesRepo.anyLockedUpward(tx, pageId)
}

// ---------------------------------------------------------------------------------------------------------------
// M5 — leave (SPEC §3.2 PERM-20/21, §3.3, M5-D3, X41).
// Entry actions look the entry up first (getLiveOrNotFound) and pass its user_id as the target.
// ---------------------------------------------------------------------------------------------------------------

/** M5-D3: self → ok; manager → ok (404 if the user does not exist); worker → 404 if the target is outside
 *  visibleUserIds(user) or does not exist, else ForbiddenError. */
export async function requireTimeOffEdit(tx: DbOrTx, user: SessionUser, targetUserId: string): Promise<void> {
  requireUser(user)
  if (user.id === targetUserId) return
  if (!isManager(user)) {
    const visible = await visibleUserIds(tx, user)
    if (visible !== 'ALL' && !visible.has(targetUserId)) throw new NotFoundError()
  }
  // Deactivated users exist too (their past leave stays editable by the manager, X64).
  const [hit] = await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, targetUserId))
  if (!hit) throw new NotFoundError()
  if (!isManager(user)) throw new ForbiddenError()
}

/** §3.3: the leave type and note of `ownerId`'s entries are visible only to managers and the owner. Pure. */
export function canSeeLeaveDetails(viewer: Pick<SessionUser, 'id' | 'role'>, ownerId: string): boolean {
  return isManager(viewer) || viewer.id === ownerId
}
