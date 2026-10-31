// M2 S1.6 — project members (FR-403, FR-404 part, BR-62, M2-D05, M2-D06, M2-D19).
import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  addMember as addMemberAction,
  changeMemberRole as changeRoleAction,
  removeMember as removeAction,
  removeMemberWithAssignments as removeWithAssignmentsAction,
  restoreRemovedMember as restoreRemovedAction,
} from '../actions/members'
import { deleteTaskTree as deleteTaskAction, restoreTaskBatch as restoreTaskAction } from '../actions/tasks'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeAssignment, makeTask, makeUser } from '../../../tests/helpers/factories'
import { testCache } from '../../../tests/helpers/request'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projectMembers, taskAssignments } from '../db/schema'
import { ConflictError, NotFoundError } from '../errors'
import { addMember, changeMemberRole, removeMember } from './members'
import { countMyOpenTasks, listMyTasks } from './my-tasks'

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
      removed: true,
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
    expect(r).toMatchObject({ removed: true, removedRole: 'LEAD' })
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
    expect(res).toEqual({
      ok: true,
      removed: true,
      removedRole: 'MEMBER',
      blockedByAssignments: 0,
      selfRemoved: false,
    })
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
      removed: true,
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

describe('FR-404', () => {
  async function ivyWorld() {
    const w = await createWorld({ with: ['tasks'] })
    const ivy = await makeUser({ nickname: 'Ivy' })
    await db.insert(projectMembers).values({ projectId: w.P.id, userId: ivy.id, role: 'MEMBER', addedBy: w.lead.id })
    const live = await makeTask({ project: w.P, name: 'Ivy live', createdBy: w.manager })
    const done = await makeTask({
      project: w.P,
      name: 'Ivy done',
      createdBy: w.manager,
      status: w.statuses.P.done,
      completedOn: '2026-09-20',
    })
    const gone = await makeTask({
      project: w.P,
      name: 'Ivy gone',
      createdBy: w.manager,
      deleted: { batch: randomUUID(), daysAgo: 1 },
    })
    const assignments = [
      await makeAssignment({ task: live, user: ivy }),
      await makeAssignment({ task: done, user: ivy }),
      await makeAssignment({ task: gone, user: ivy }),
    ]
    return { w, ivy, assignments }
  }

  it('removeMember with assignments on 2 live tasks (one completed) + 1 deleted → blocked 2, nothing written', async () => {
    const { w, ivy } = await ivyWorld()
    asUser(w.lead)
    const mark = await auditCount()
    expect(await removeAction({ projectId: w.P.id, userId: ivy.id })).toEqual({
      ok: true,
      removed: false,
      blockedByAssignments: 2,
      selfRemoved: false,
    })
    expect(await roleOf(w.P.id, ivy.id)).toBe('MEMBER')
    expect(await auditRowsAfter(mark)).toEqual([])
    expect(testCache.refresh).not.toHaveBeenCalled()
  })

  it('N = 0 removal also unassigns deleted tasks: restoring the task later leaks nothing to the former member', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const ivy = await makeUser({ nickname: 'Ivy' })
    await db.insert(projectMembers).values({ projectId: w.P.id, userId: ivy.id, role: 'MEMBER', addedBy: w.lead.id })
    const t = await makeTask({ project: w.P, name: 'Ivy secret task', createdBy: w.manager })
    const asg = await makeAssignment({ task: t, user: ivy })
    asUser(w.lead)
    const del = await deleteTaskAction({ taskIds: [t.id] })
    if (!del.ok) throw new Error('delete failed')
    expect(await removeAction({ projectId: w.P.id, userId: ivy.id })).toMatchObject({ ok: true, removed: true })
    const [row] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, asg.id))
    expect(row!.deletedAt).not.toBeNull()
    expect(await restoreTaskAction({ batch: del.batch })).toMatchObject({ ok: true })
    const mine = await listMyTasks(db, S(ivy))
    expect(mine.count).toBe(0)
    expect(JSON.stringify(mine)).not.toContain('Ivy secret task')
    expect(await countMyOpenTasks(db, ivy.id)).toBe(0)
  })

  it('/my never lists an assignment of a non-member, even a stray one (defence in depth, §3.3)', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const stray = await makeUser({ nickname: 'Stray' })
    const t = await makeTask({ project: w.P, name: 'Hidden task', createdBy: w.manager })
    await db.insert(taskAssignments).values({ taskId: t.id, userId: stray.id })
    expect((await listMyTasks(db, S(stray))).groups).toEqual([])
    expect(await countMyOpenTasks(db, stray.id)).toBe(0)
  })

  it('removeMemberWithAssignments → row gone, 3 assignments share one batch; restoreRemovedMember → all back', async () => {
    const { w, ivy, assignments } = await ivyWorld()
    const before = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, w.P.id), eq(projectMembers.userId, ivy.id)))
    asUser(w.lead)
    const mark = await auditCount()
    const r = await removeWithAssignmentsAction({ projectId: w.P.id, userId: ivy.id })
    if (!r.ok) throw new Error('failed')
    expect(r).toMatchObject({ unassignedTaskCount: 2, member: { role: 'MEMBER', addedBy: w.lead.id } })
    expect(await roleOf(w.P.id, ivy.id)).toBeNull()
    const rows = await db
      .select()
      .from(taskAssignments)
      .where(inArray(taskAssignments.id, assignments.map((a) => a.id)))
    expect(new Set(rows.map((x) => x.deletedBatch))).toEqual(new Set([r.batch]))
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'project_member',
        action: 'delete',
        summary: th.audit.memberRemovedWithAssignments('Ivy', 2),
        after: { batch: r.batch, unassignedTaskCount: 2 },
      }),
    ])
    const mark2 = await auditCount()
    expect(
      await restoreRemovedAction({ projectId: w.P.id, userId: ivy.id, batch: r.batch, member: r.member }),
    ).toEqual({ ok: true, restoredAssignments: 3, skipped: 0 })
    expect(await auditRowsAfter(mark2)).toHaveLength(1)
    const after = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, w.P.id), eq(projectMembers.userId, ivy.id)))
    expect(after).toEqual(before)
    const back = await db
      .select()
      .from(taskAssignments)
      .where(inArray(taskAssignments.id, assignments.map((a) => a.id)))
    expect(back.every((x) => x.deletedAt === null)).toBe(true)
  })

  it('member → FORBIDDEN for both; no assignments → batch null', async () => {
    const { w, ivy } = await ivyWorld()
    asUser(w.member)
    expect(await removeWithAssignmentsAction({ projectId: w.P.id, userId: ivy.id })).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      await restoreRemovedAction({
        projectId: w.P.id,
        userId: ivy.id,
        batch: null,
        member: { role: 'MEMBER', addedBy: null, addedAt: '2026-09-01T09:00:00+07:00' },
      }),
    ).toMatchObject({ code: 'FORBIDDEN' })
    const extra = await makeUser({ nickname: 'Extra' })
    await db.insert(projectMembers).values({ projectId: w.P.id, userId: extra.id, role: 'MEMBER', addedBy: null })
    asUser(w.lead)
    expect(await removeWithAssignmentsAction({ projectId: w.P.id, userId: extra.id })).toMatchObject({
      ok: true,
      batch: null,
      unassignedTaskCount: 0,
    })
  })
})
