// src/server/services/projects.ts — projects (FR-401, FR-405..FR-409 part, M2-D03, M2-D11, M2-D17, M2-D20, X26).
// Loaders start with authz (requireProject / visibleProjectIds) and throw NotFoundError for invisible projects; pages
// wrap them in orNotFound() (M2-D21). Mutations run inside the caller's transaction after authz; the action writes
// the audit row in the same transaction.
import { th } from '@/i18n/th'
import { sortByThai } from '@/lib/collate'
import { displayName } from '@/lib/display-name'
import type { ClientRef } from '@/lib/contracts/clients'
import type {
  MemberUser,
  ProjectAccessRole,
  ProjectHeader,
  ProjectListItem,
  ProjectOverview,
} from '@/lib/contracts/projects'
import type { createProjectSchema, updateProjectSchema } from '@/lib/schemas/projects'
import type { z } from '@/lib/z'
import * as authz from '../authz'
import type { ProjectRow } from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'
import { NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import * as filesRepo from '../repo/files'
import type { ProjectPatch } from '../repo/projects'
import type { SessionUser } from '../session'
import { compareByDisplayName, compareMembers, toClientRef, toMemberUser, toProjectMember } from './shared'
import { getStorage } from '../storage'
import { createCharter } from './charters'
import { ensureProjectStatuses } from './taskStatuses'

const fieldError = (field: string, message: string): ValidationError =>
  new ValidationError({ [field]: [message] }, message)

async function clientRefs(tx: DbOrTx, ids: Iterable<string | null>): Promise<Map<string, ClientRef>> {
  const set = new Set<string>()
  for (const id of ids) if (id) set.add(id)
  if (set.size === 0) return new Map()
  const rows = await repo.clients.listClients(tx, { ids: set, includeArchived: true })
  return new Map(rows.map((c) => [c.id, toClientRef(c)]))
}

/**
 * List rows for projects the caller already selected from the viewer's visible set (`/projects`, client detail).
 * myRole: MANAGER for managers, else the viewer's membership role.
 */
export async function projectListItems(
  tx: DbOrTx,
  user: SessionUser,
  rows: readonly ProjectRow[],
): Promise<ProjectListItem[]> {
  if (rows.length === 0) return []
  const [clients, members] = await Promise.all([
    clientRefs(
      tx,
      rows.map((p) => p.clientId),
    ),
    repo.members.listMembersOf(
      tx,
      rows.map((p) => p.id),
    ),
  ])
  const manager = authz.isManager(user)
  return rows.map((p) => {
    const mine = members.filter((m) => m.projectId === p.id)
    const leads: MemberUser[] = mine
      .filter((m) => m.role === 'LEAD')
      .map(toMemberUser)
      .sort(compareByDisplayName)
    const myMembership = mine.find((m) => m.userId === user.id)
    const myRole: ProjectAccessRole = manager ? 'MANAGER' : (myMembership?.role ?? 'MEMBER')
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      color: p.color,
      certainty: p.certainty,
      archived: p.archivedAt !== null,
      client: p.clientId ? (clients.get(p.clientId) ?? null) : null,
      leads,
      memberCount: mine.length,
      myRole,
    }
  })
}

/** `/projects` (archived: false) and `/projects?archived=1` (archived: true); only visible projects. */
export async function listProjectsForViewer(
  tx: DbOrTx,
  user: SessionUser,
  opts: { archived: boolean },
): Promise<ProjectListItem[]> {
  const visible = await authz.visibleProjectIds(tx, user)
  const rows = await repo.projects.listProjects(tx, { ids: visible, archived: opts.archived })
  return sortByThai(await projectListItems(tx, user, rows), (p) => p.name)
}

function headerOf(p: ProjectRow, client: ClientRef | null, role: ProjectAccessRole): ProjectHeader {
  const archived = p.archivedAt !== null
  const managing = role === 'MANAGER' || role === 'LEAD'
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    color: p.color,
    certainty: p.certainty,
    certaintyNote: p.certaintyNote,
    archived,
    client,
    myRole: role,
    can: { manage: managing && !archived, unarchive: managing && archived, delete: role === 'MANAGER' },
  }
}

async function loadHeader(tx: DbOrTx, user: SessionUser, projectId: string): Promise<ProjectHeader> {
  const access = await authz.requireProject(tx, user, projectId, 'view')
  const p = await repo.projects.getProject(tx, projectId)
  if (!p) throw new NotFoundError()
  const client = p.clientId ? await repo.clients.getClient(tx, p.clientId) : null
  return headerOf(p, client ? toClientRef(client) : null, access.role)
}

/** Project layout header (authz first: 404 for invisible / unknown / malformed ids). */
export async function getProjectHeader(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string,
): Promise<ProjectHeader> {
  return loadHeader(tx, user, projectId)
}

/** ภาพรวม tab: header + members (LEAD first, then display name) + `noLead` = no active LEAD (M2-D17). */
export async function getProjectOverview(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string,
): Promise<ProjectOverview> {
  const project = await loadHeader(tx, user, projectId)
  const members = (await repo.members.listMembers(tx, projectId)).map(toProjectMember).sort(compareMembers)
  const noLead = !members.some((m) => m.role === 'LEAD' && m.active)
  return { project, members, warnings: { noLead } }
}

/** A client the project may point to: must exist and not be archived (FR-302). */
async function assertPickableClient(tx: DbOrTx, clientId: string): Promise<void> {
  const client = await repo.clients.getClient(tx, clientId)
  if (!client) throw fieldError('clientId', th.projects.errors.clientNotFound)
  if (client.archivedAt !== null) throw fieldError('clientId', th.projects.errors.clientArchived)
}

/** Project row + optional LEAD row (added_by = user). Validates client (exists, not archived) and LEAD (active). */
export async function createProject(
  tx: Tx,
  user: SessionUser,
  input: z.output<typeof createProjectSchema>,
): Promise<ProjectRow & { charterPageId: string }> {
  if (input.clientId) await assertPickableClient(tx, input.clientId)
  const client = input.clientId ? await repo.clients.getClient(tx, input.clientId) : null
  const lead = input.leadUserId ? await repo.people.getPerson(tx, input.leadUserId) : null
  if (input.leadUserId) {
    if (!lead) throw new NotFoundError()
    if (!lead.active) throw fieldError('leadUserId', th.projects.errors.leadInactive)
  }
  const project = await repo.projects.insertProject(tx, {
    name: input.name,
    clientId: input.clientId ?? null,
    code: input.code ?? null,
    certaintyNote: input.certaintyNote ?? null,
    createdBy: user.id,
    ...(input.color ? { color: input.color } : {}),
    ...(input.certainty ? { certainty: input.certainty } : {}),
  })
  if (input.leadUserId) {
    await repo.members.insertMember(tx, {
      projectId: project.id,
      userId: input.leadUserId,
      role: 'LEAD',
      addedBy: user.id,
    })
  }
  await ensureProjectStatuses(tx, project.id) // FR-621 / X70: the 5 defaults in the same transaction
  // FR-402 / X25 / M4-D5: the Project Charter in the same transaction; the action's single audit row names it.
  const charter = await createCharter(tx, {
    projectId: project.id,
    projectName: project.name,
    actorId: user.id,
    clientName: client?.name ?? '—',
    leadName: lead ? displayName(lead) : '—',
    certainty: project.certainty,
  })
  return { ...project, charterPageId: charter.id }
}

/** FR-409 progress (M3-D21): completed / all non-deleted tasks at every depth. Callers authorise the project first. */
export function projectProgress(tx: DbOrTx, projectId: string): Promise<{ done: number; total: number }> {
  return repo.tasks.progress(tx, projectId)
}

/** undefined = unchanged; null clears clientId / code / certaintyNote. Re-picking the current (even archived) client is
 *  allowed; switching to another archived or unknown client is a ValidationError. */
export async function updateProject(
  tx: DbOrTx,
  _user: SessionUser,
  input: z.output<typeof updateProjectSchema>,
): Promise<{ before: ProjectRow; after: ProjectRow; certaintyChanged: boolean }> {
  const before = await repo.projects.getProject(tx, input.projectId)
  if (!before) throw new NotFoundError()
  const patch: ProjectPatch = {}
  if (input.name !== undefined && input.name !== before.name) patch.name = input.name
  if (input.clientId !== undefined && input.clientId !== before.clientId) {
    if (input.clientId !== null) await assertPickableClient(tx, input.clientId)
    patch.clientId = input.clientId
  }
  if (input.code !== undefined && input.code !== before.code) patch.code = input.code
  if (input.color !== undefined && input.color !== before.color) patch.color = input.color
  if (input.certainty !== undefined && input.certainty !== before.certainty) patch.certainty = input.certainty
  if (input.certaintyNote !== undefined && input.certaintyNote !== before.certaintyNote) {
    patch.certaintyNote = input.certaintyNote
  }
  if (Object.keys(patch).length === 0) return { before, after: before, certaintyChanged: false }
  const after = await repo.projects.updateProjectRow(tx, before.id, patch)
  return { before, after, certaintyChanged: patch.certainty !== undefined }
}

/** No-op `{ changed: false }` when already in the requested state (M2-D20). */
export async function setProjectArchived(
  tx: DbOrTx,
  projectId: string,
  archived: boolean,
): Promise<{ project: ProjectRow; changed: boolean }> {
  const cur = await repo.projects.getProject(tx, projectId)
  if (!cur) throw new NotFoundError()
  if ((cur.archivedAt !== null) === archived) return { project: cur, changed: false }
  return { project: await repo.projects.setProjectArchivedAt(tx, projectId, archived), changed: true }
}

/** Storage keys to unlink after a permanent delete commits (X26): collected inside the delete transaction. */
export function collectProjectFileKeys(tx: DbOrTx, projectId: string): Promise<string[]> {
  return filesRepo.listProjectFileKeys(tx, projectId)
}

/** Hard DELETE … RETURNING (M2-D11); FK cascades remove members (and later tables). */
export async function deleteProjectRow(tx: DbOrTx, projectId: string): Promise<ProjectRow> {
  const row = await repo.projects.deleteProject(tx, projectId)
  if (!row) throw new NotFoundError()
  return row
}

/** Best-effort unlink after commit (X26): a missing file or an unlink error is logged (key only), never thrown. */
export async function unlinkFilesBestEffort(keys: readonly string[]): Promise<void> {
  const storage = getStorage()
  for (const key of keys) {
    try {
      await storage.remove(key)
    } catch {
      console.warn('[projects] could not remove file after permanent delete', { key })
    }
  }
}
