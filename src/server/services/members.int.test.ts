// M2 S1.6 — project members (FR-403, FR-404 part, BR-62, M2-D05, M2-D06, M2-D19).
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  addMember as addMemberAction,
  changeMemberRole as changeRoleAction,
  removeMember as removeAction,
} from '../actions/members'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeUser } from '../../../tests/helpers/factories'
import { testCache } from '../../../tests/helpers/request'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projectMembers } from '../db/schema'
import { ConflictError, NotFoundError } from '../errors'
import { addMember, changeMemberRole, removeMember } from './members'

const S = toSessionUser

async function roleOf(projectId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  return row?.role ?? null
}

describe('addMember', () => {
  it('lead adds outsider as MEMBER (added_by = lead) with one audit row; again → CONFLICT', async () => {
    const w = await createWorld()
    asUser(w.lead)
    const mark = await auditCount()
    expect(await addMemberAction({ projectId: w.P.id, userId: w.outsider.id })).toEqual({
      ok: true,
      role: 'MEMBER',
    })
    const [row] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, w.P.id), eq(projectMembers.userId, w.outsider.id)))
    expect(row).toMatchObject({ role: 'MEMBER', addedBy: w.lead.id })
    const audits = await auditRowsAfter(mark)
    expect(audits).toEqual([
      expect.objectContaining({
        entity: 'project_member',
        entityId: `${w.P.id}:${w.outsider.id}`,
        action: 'create',
        projectId: w.P.id,
        summary: th.audit.memberAdded('World P', 'Outsider', th.members.roles.MEMBER),
      }),
    ])
    expect(testCache.refresh).toHaveBeenCalledTimes(1)
    expect(await addMemberAction({ projectId: w.P.id, userId: w.member.id })).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      message: th.members.errors.alreadyMember,
    })
  })

  it('deactivated user → VALIDATION userInactive; unknown user → NOT_FOUND', async () => {
    const w = await createWorld()
    const gone = await makeUser({ nickname: 'Gone', deactivated: { on: '2026-09-01' } })
    await expect(
      db.transaction((tx) =>
        addMember(tx, S(w.lead), { projectId: w.P.id, userId: gone.id, role: 'MEMBER' }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: th.members.errors.userInactive })
    await expect(
      db.transaction((tx) =>
        addMember(tx, S(w.lead), { projectId: w.P.id, userId: randomUUID(), role: 'MEMBER' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('authz: member → 403, outsider → 404, archived A → 403', async () => {
    const w = await createWorld()
    const extra = await makeUser({ nickname: 'Extra' })
    asUser(w.member)
    expect(await addMemberAction({ projectId: w.P.id, userId: extra.id })).toMatchObject({
      code: 'FORBIDDEN',
    })
    asUser(w.outsider)
    expect(await addMemberAction({ projectId: w.P.id, userId: extra.id })).toMatchObject({
      code: 'NOT_FOUND',
    })
    asUser(w.lead)
    expect(await addMemberAction({ projectId: w.A.id, userId: extra.id })).toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('changeMemberRole', () => {
  it('lead promotes member, then demotes self (another LEAD exists)', async () => {
    const w = await createWorld()
    asUser(w.lead)
    expect(await changeRoleAction({ projectId: w.P.id, userId: w.member.id, role: 'LEAD' })).toEqual({
      ok: true,
      previousRole: 'MEMBER',
    })
    expect(await changeRoleAction({ projectId: w.P.id, userId: w.lead.id, role: 'MEMBER' })).toEqual({
      ok: true,
      previousRole: 'LEAD',
    })
    expect(await roleOf(w.P.id, w.lead.id)).toBe('MEMBER')
    expect(await roleOf(w.P.id, w.member.id)).toBe('LEAD')
  })

  it('same role → ok without an audit row; non-member → NOT_FOUND notMember', async () => {
    const w = await createWorld()
    asUser(w.lead)
    const mark = await auditCount()
    expect(await changeRoleAction({ projectId: w.P.id, userId: w.member.id, role: 'MEMBER' })).toEqual({
      ok: true,
      previousRole: 'MEMBER',
    })
    expect(await auditRowsAfter(mark)).toEqual([])
    expect(await changeRoleAction({ projectId: w.P.id, userId: w.outsider.id, role: 'LEAD' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      message: th.members.errors.notMember,
    })
  })
})

describe('BR-62', () => {
  it('worker LEAD cannot demote or remove the last LEAD; nothing changes', async () => {
    const w = await createWorld()
    asUser(w.lead)
    for (const res of [
      await changeRoleAction({ projectId: w.P.id, userId: w.lead.id, role: 'MEMBER' }),
      await removeAction({ projectId: w.P.id, userId: w.lead.id }),
    ]) {
      expect(res).toMatchObject({ ok: false, code: 'CONFLICT', message: th.members.errors.lastLead })
    }
    expect(await roleOf(w.P.id, w.lead.id)).toBe('LEAD')
  })

  it('manager may demote / remove the last LEAD with warning NO_LEAD', async () => {
    const w = await createWorld()
    asUser(w.manager)
    expect(await changeRoleAction({ projectId: w.P.id, userId: w.lead.id, role: 'MEMBER' })).toEqual({
      ok: true,
      previousRole: 'LEAD',
      warning: 'NO_LEAD',
    })
    await changeRoleAction({ projectId: w.P.id, userId: w.lead.id, role: 'LEAD' })
    expect(await removeAction({ projectId: w.P.id, userId: w.lead.id })).toEqual({
      ok: true,
      removedRole: 'LEAD',
      blockedByAssignments: 0,
      selfRemoved: false,
      warning: 'NO_LEAD',
    })
  })

  it('a deactivated LEAD does not count as the other LEAD', async () => {
    const w = await createWorld()
    const gone = await makeUser({ nickname: 'Gone', deactivated: { on: '2026-09-01' } })
    await db
      .insert(projectMembers)
      .values({ projectId: w.P.id, userId: gone.id, role: 'LEAD', addedBy: null })
    await expect(
      db.transaction((tx) =>
        changeMemberRole(tx, S(w.lead), { projectId: w.P.id, userId: w.lead.id, role: 'MEMBER' }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: th.members.errors.lastLead })
    // Removing the deactivated LEAD itself is not blocked (it is not an active LEAD).
    const r = await db.transaction((tx) =>
      removeMember(tx, S(w.lead), { projectId: w.P.id, userId: gone.id }),
    )
    expect(r.removedRole).toBe('LEAD')
  })

  it('race: two LEADs demoting themselves concurrently → exactly one succeeds', async () => {
    const w: World = await createWorld()
    await db
      .update(projectMembers)
      .set({ role: 'LEAD' })
      .where(and(eq(projectMembers.projectId, w.P.id), eq(projectMembers.userId, w.member.id)))
    const results = await Promise.allSettled([
      db.transaction((tx) =>
        changeMemberRole(tx, S(w.lead), { projectId: w.P.id, userId: w.lead.id, role: 'MEMBER' }),
      ),
      db.transaction((tx) =>
        changeMemberRole(tx, S(w.member), { projectId: w.P.id, userId: w.member.id, role: 'MEMBER' }),
      ),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.reason).toBeInstanceOf(ConflictError)
    expect((rejected[0]!.reason as ConflictError).message).toBe(th.members.errors.lastLead)
    const leads = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, w.P.id), eq(projectMembers.role, 'LEAD')))
    expect(leads).toHaveLength(1)
  })
})

describe('removeMember', () => {
  it('lead removes member: row gone, blockedByAssignments 0, audit delete; undo = addMember with the same role', async () => {
    const w = await createWorld()
    asUser(w.lead)
    const mark = await auditCount()
    const res = await removeAction({ projectId: w.P.id, userId: w.member.id })
    expect(res).toEqual({ ok: true, removedRole: 'MEMBER', blockedByAssignments: 0, selfRemoved: false })
    expect(await roleOf(w.P.id, w.member.id)).toBeNull()
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'project_member',
        action: 'delete',
        projectId: w.P.id,
        summary: th.audit.memberRemoved('World P', 'Member'),
      }),
    ])
    expect(testCache.refresh).toHaveBeenCalledTimes(1)
    expect(await addMemberAction({ projectId: w.P.id, userId: w.member.id, role: 'MEMBER' })).toMatchObject({
      ok: true,
    })
    expect(await roleOf(w.P.id, w.member.id)).toBe('MEMBER')
  })

  it('non-member → NOT_FOUND notMember', async () => {
    const w = await createWorld()
    const err = await db
      .transaction((tx) => removeMember(tx, S(w.lead), { projectId: w.P.id, userId: w.outsider.id }))
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NotFoundError)
    expect((err as NotFoundError).message).toBe(th.members.errors.notMember)
  })

  it('a LEAD leaving while another LEAD remains → selfRemoved, no refresh (M2-D19); member cannot leave (403)', async () => {
    const w = await createWorld()
    const second = await makeUser({ nickname: 'Second' })
    await db
      .insert(projectMembers)
      .values({ projectId: w.P.id, userId: second.id, role: 'LEAD', addedBy: null })
    asUser(w.lead)
    expect(await removeAction({ projectId: w.P.id, userId: w.lead.id })).toEqual({
      ok: true,
      removedRole: 'LEAD',
      blockedByAssignments: 0,
      selfRemoved: true,
    })
    expect(testCache.refresh).not.toHaveBeenCalled()
    asUser(w.member)
    expect(await removeAction({ projectId: w.P.id, userId: w.member.id })).toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})
