'use server'
// src/server/actions/members.ts — project members (§3.2 PERM-08, FR-403, FR-404 part, BR-62, M2-D05, M2-D06, M2-D19).
// Shape: zod (wrapper) → authz.requireProject(…, 'manage') → service + audit in one tx → refresh()
// (except a LEAD removing themselves: `selfRemoved: true`, no refresh — the page would 404).
import { refresh } from 'next/cache'
import type { ProjectRole } from '@/domain/types'
import { th } from '@/i18n/th'
import { addMemberSchema, changeMemberRoleSchema, removeMemberSchema } from '@/lib/schemas/members'
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

/** FR-404 part (X16): `blockedByAssignments` is 0 until M3. Undo = addMember with `removedRole` (M2-D05). */
export const removeMember = action(
  removeMemberSchema,
  async (
    input,
    { user },
  ): Promise<{
    removedRole: ProjectRole
    blockedByAssignments: 0
    selfRemoved: boolean
    warning?: 'NO_LEAD'
  }> => {
    const r = await db.transaction(async (tx) => {
      await authz.requireProject(tx, user, input.projectId, 'manage')
      const name = await projectName(tx, input.projectId)
      const res = await services.members.removeMember(tx, user, input)
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
    // A manager keeps seeing the project after leaving it, so only a worker's self-removal navigates away.
    const selfRemoved = input.userId === user.id && !authz.isManager(user)
    if (!selfRemoved) refresh() // M2-D19: the client navigates to /projects instead
    return {
      removedRole: r.removedRole,
      blockedByAssignments: 0,
      selfRemoved,
      ...(r.warning ? { warning: r.warning } : {}),
    }
  },
)
