'use server'
// src/server/actions/members.ts — project members (§3.2 PERM-08, FR-403, FR-404 part, BR-62, M2-D05, M2-D06, M2-D19).
// Shape: zod (wrapper) → authz.requireProject(…, 'manage') → service + audit in one tx → refresh()
// (except a LEAD removing themselves: `selfRemoved: true`, no refresh — the page would 404).
import { refresh } from 'next/cache'
import type { ProjectRole } from '@/domain/types'
import { th } from '@/i18n/th'
import type { RemoveMemberWithAssignmentsResult, RestoreRemovedMemberResult } from '@/lib/contracts/tasks'
import { addMemberSchema, changeMemberRoleSchema, removeMemberSchema } from '@/lib/schemas/members'
import { removeMemberWithAssignmentsSchema, restoreRemovedMemberSchema } from '@/lib/schemas/tasks'
import { action } from '../action'
import * as audit from '../audit'
import * as authz from '../authz'
import { db } from '../db/client'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'

const memberEntityId = (projectId: string, userId: string): string => `${projectId}:${userId}`

async function projectName(tx: DbOrTx, projectId: string): Promise<string> {
  const p = await repo.projects.getProject(tx, projectId)
  if (!p) throw new NotFoundError()
  return p.name
}

/** FR-403 (also the undo of a removal, M2-D05). */
export const addMember = action(addMemberSchema, async (input, { user }): Promise<{ role: ProjectRole }> => {
  const role = await db.transaction(async (tx) => {
    await authz.requireProject(tx, user, input.projectId, 'manage') // Me 403 · W 404 · archived 403
    const name = await projectName(tx, input.projectId)
    const r = await services.members.addMember(tx, user, input)
    await audit.log(tx, user, {
      entity: 'project_member',
      entityId: memberEntityId(input.projectId, input.userId),
      action: 'create',
      projectId: input.projectId,
      summary: th.audit.memberAdded(name, r.personName, th.members.roles[r.member.role]),
      after: { userId: input.userId, role: r.member.role },
    })
    return r.member.role
  })
  refresh()
  return { role }
})

/** BR-62: a worker LEAD cannot demote the last active LEAD (CONFLICT); a manager can (warning NO_LEAD). */
export const changeMemberRole = action(
  changeMemberRoleSchema,
  async (input, { user }): Promise<{ previousRole: ProjectRole; warning?: 'NO_LEAD' }> => {
    const r = await db.transaction(async (tx) => {
      await authz.requireProject(tx, user, input.projectId, 'manage')
      const name = await projectName(tx, input.projectId)
      const res = await services.members.changeMemberRole(tx, user, input)
      if (res.changed) {
        await audit.log(tx, user, {
          entity: 'project_member',
          entityId: memberEntityId(input.projectId, input.userId),
          action: 'update',
          projectId: input.projectId,
          summary: th.audit.memberRoleChanged(name, res.personName, th.members.roles[input.role]),
          before: { role: res.previousRole },
          after: { role: input.role },
        })
      }
      return res
    })
    refresh()
    return { previousRole: r.previousRole, ...(r.warning ? { warning: r.warning } : {}) }
  },
)

/** FR-404 / BR-61 (M3-D14): a member with assignments is not removed — `{ removed: false, blockedByAssignments: N }`
 *  without audit or refresh; the client then offers removeMemberWithAssignments. Undo = addMember with `removedRole`. */
export const removeMember = action(
  removeMemberSchema,
  async (
    input,
    { user },
  ): Promise<
    | { removed: false; blockedByAssignments: number; selfRemoved: false }
    | {
        removed: true
        removedRole: ProjectRole
        blockedByAssignments: 0
        selfRemoved: boolean
        warning?: 'NO_LEAD'
      }
  > => {
    const r = await db.transaction(async (tx) => {
      await authz.requireProject(tx, user, input.projectId, 'manage')
      const name = await projectName(tx, input.projectId)
      const res = await services.members.removeMember(tx, user, input)
      if (!res.removed) return res
      await audit.log(tx, user, {
        entity: 'project_member',
        entityId: memberEntityId(input.projectId, input.userId),
        action: 'delete',
        projectId: input.projectId,
        summary: th.audit.memberRemoved(name, res.personName),
        before: { userId: input.userId, role: res.removedRole },
      })
      return res
    })
    if (!r.removed) return { removed: false, blockedByAssignments: r.blockedByAssignments, selfRemoved: false }
    // A manager keeps seeing the project after leaving it, so only a worker's self-removal navigates away.
    const selfRemoved = input.userId === user.id && !authz.isManager(user)
    if (!selfRemoved) refresh() // M2-D19: the client navigates to /projects instead
    return {
      removed: true,
      removedRole: r.removedRole,
      blockedByAssignments: 0,
      selfRemoved,
      ...(r.warning ? { warning: r.warning } : {}),
    }
  },
)

// ---------------------------------------------------------------------------------------------------------------
// M3 — FR-404 combined op (X16, M3-D14; plan/m03 S2.9). Need: manage. One audit row per call (M3-D4).
// ---------------------------------------------------------------------------------------------------------------

/** Soft-deletes all the user's active assignments in the project under one batch and removes the member row. */
export const removeMemberWithAssignments = action(
  removeMemberWithAssignmentsSchema,
  async (input, { user }): Promise<RemoveMemberWithAssignmentsResult & { warning?: 'NO_LEAD' }> => {
    const r = await db.transaction(async (tx) => {
      await authz.requireProject(tx, user, input.projectId, 'manage')
      const { personName, ...res } = await services.members.removeMemberWithAssignments(tx, user, input)
      await audit.log(tx, user, {
        entity: 'project_member',
        entityId: memberEntityId(input.projectId, input.userId),
        action: 'delete',
        projectId: input.projectId,
        summary: th.audit.memberRemovedWithAssignments(personName, res.unassignedTaskCount),
        before: { userId: input.userId, role: res.member.role },
        after: { batch: res.batch, unassignedTaskCount: res.unassignedTaskCount },
      })
      return res
    })
    if (!(input.userId === user.id && !authz.isManager(user))) refresh()
    return r
  },
)

/** Undo of removeMemberWithAssignments: re-inserts the member row (same role/added_by/added_at) + restores the batch. */
export const restoreRemovedMember = action(
  restoreRemovedMemberSchema,
  async (input, { user }): Promise<RestoreRemovedMemberResult> => {
    const r = await db.transaction(async (tx) => {
      await authz.requireProject(tx, user, input.projectId, 'manage')
      const { personName, ...res } = await services.members.restoreRemovedMember(tx, user, input)
      await audit.log(tx, user, {
        entity: 'project_member',
        entityId: memberEntityId(input.projectId, input.userId),
        action: 'restore',
        projectId: input.projectId,
        summary: th.audit.memberRestored(personName),
        after: { role: input.member.role, batch: input.batch, restoredAssignments: res.restoredAssignments },
      })
      return res
    })
    refresh()
    return r
  },
)
