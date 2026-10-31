'use server'
// src/server/actions/projects.ts — projects (§3.2 PERM-05..PERM-10, FR-401, FR-405..FR-407, M2-D03, M2-D09).
// Shape: zod (wrapper) → authz (requireManager / requireProject) → service + audit in one tx → refresh() where
// M2-D09 says so (not createProject / deleteProjectPermanently; the client navigates). File unlink after commit (X26).
import { refresh } from 'next/cache'
import { th } from '@/i18n/th'
import type { Ok } from '@/lib/action-result'
import {
  createProjectSchema,
  deleteProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from '@/lib/schemas/projects'
import { action } from '../action'
import * as audit from '../audit'
import * as authz from '../authz'
import { db } from '../db/client'
import type { ProjectRow } from '../db/schema'
import { NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'
import type { SessionUser } from '../session'

type ProjectField = 'name' | 'clientId' | 'code' | 'color' | 'certainty' | 'certaintyNote'
const PROJECT_FIELDS: readonly ProjectField[] = [
  'name',
  'clientId',
  'code',
  'color',
  'certainty',
  'certaintyNote',
]

/** Only the columns that changed (audit before/after never carry unrelated columns). */
function pickChanged(
  before: ProjectRow,
  after: ProjectRow,
): { before: Partial<ProjectRow>; after: Partial<ProjectRow> } {
  const b: Partial<ProjectRow> = {}
  const a: Partial<ProjectRow> = {}
  for (const k of PROJECT_FIELDS) {
    if (before[k] !== after[k]) {
      Object.assign(b, { [k]: before[k] })
      Object.assign(a, { [k]: after[k] })
    }
  }
  return { before: b, after: a }
}

/** FR-401: manager only; project + optional LEAD row + one audit row in one tx. No refresh (the client navigates). */
export const createProject = action(
  createProjectSchema,
  async (input, { user }): Promise<{ projectId: string }> => {
    authz.requireManager(user)
    const project = await db.transaction(async (tx) => {
      const p = await services.projects.createProject(tx, user, input)
      await audit.log(tx, user, {
        entity: 'project',
        entityId: p.id,
        action: 'create',
        projectId: p.id,
        summary: th.audit.projectCreated(p.name),
        after: {
          name: p.name,
          clientId: p.clientId,
          code: p.code,
          color: p.color,
          certainty: p.certainty,
          certaintyNote: p.certaintyNote,
          leadUserId: input.leadUserId ?? null,
        },
      })
      return p
    })
    return { projectId: project.id }
  },
)

/** Certainty is edited here too (M2-D03); the client invalidates load views when `certaintyChanged`. */
export const updateProject = action(
  updateProjectSchema,
  async (input, { user }): Promise<{ certaintyChanged: boolean }> => {
    const res = await db.transaction(async (tx) => {
      await authz.requireProject(tx, user, input.projectId, 'manage') // 404 / 403 / archived 403
      const r = await services.projects.updateProject(tx, user, input)
      const diff = pickChanged(r.before, r.after)
      if (Object.keys(diff.after).length > 0) {
        await audit.log(tx, user, {
          entity: 'project',
          entityId: input.projectId,
          action: 'update',
          projectId: input.projectId,
          summary: th.audit.projectUpdated(r.after.name),
          before: diff.before,
          after: diff.after,
        })
      }
      return r
    })
    refresh() // header + overview are RSC (X18)
    return { certaintyChanged: res.certaintyChanged }
  },
)

async function setArchived(
  user: SessionUser,
  projectId: string,
  archived: boolean,
): Promise<{ changed: boolean }> {
  const changed = await db.transaction(async (tx) => {
    // archive: archived projects are read-only → 403 (M2-D20); unarchive is the only allowArchived caller (M2-D02).
    await authz.requireProject(tx, user, projectId, 'manage', archived ? undefined : { allowArchived: true })
    const r = await services.projects.setProjectArchived(tx, projectId, archived)
    if (!r.changed) return false
    await audit.log(tx, user, {
      entity: 'project',
      entityId: projectId,
      action: 'update',
      projectId,
      summary: archived
        ? th.audit.projectArchived(r.project.name)
        : th.audit.projectUnarchived(r.project.name),
      before: { archived: !archived },
      after: { archived, archivedAt: r.project.archivedAt },
    })
    return true
  })
  refresh()
  return { changed }
}

/** FR-406 (part): immediate, undo via unarchiveProject (X17). */
export const archiveProject = action(projectIdSchema, ({ projectId }, { user }) =>
  setArchived(user, projectId, true),
)

/** No-op `{ changed: false }` (no audit row) on an active project (M2-D20). */
export const unarchiveProject = action(projectIdSchema, ({ projectId }, { user }) =>
  setArchived(user, projectId, false),
)

/** FR-407: manager only (archived too); `confirmName.trim()` must equal the project name. One tx (cascade + audit),
 *  then best-effort unlink of the collected file keys after commit (X26). No refresh (M2-D09). */
export const deleteProjectPermanently = action(
  deleteProjectSchema,
  async ({ projectId, confirmName }, { user }): Promise<Ok> => {
    const keys = await db.transaction(async (tx) => {
      await authz.requireProject(tx, user, projectId, 'owner')
      const p = await repo.projects.getProject(tx, projectId)
      if (!p) throw new NotFoundError()
      if (confirmName.trim() !== p.name.trim()) {
        const msg = th.projects.errors.deleteNameMismatch
        throw new ValidationError({ confirmName: [msg] }, msg)
      }
      const fileKeys = await services.projects.collectProjectFileKeys(tx, projectId)
      await services.projects.deleteProjectRow(tx, projectId)
      await audit.log(tx, user, {
        entity: 'project',
        entityId: projectId,
        action: 'delete',
        projectId,
        summary: th.audit.projectDeleted(p.name),
        before: { name: p.name, clientId: p.clientId, archived: p.archivedAt !== null },
      })
      return fileKeys
    })
    await services.projects.unlinkFilesBestEffort(keys)
    return {}
  },
)
