import { and, asc, count, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { projectMembers, taskAssignments, taskBlockers, taskStatuses, tasks } from '@/server/db/schema'
import { assertCompletionInvariant } from './invariants'
import { createWorld, expandParts } from './world'

describe('world fixture (X91)', () => {
  it('expandParts([]) is empty; createWorld() gives 4 users with the roles of PLAN §4.3', async () => {
    expect(expandParts([]).size).toBe(0)
    expect([...expandParts(['tasks', 'tasks'])]).toEqual(['tasks'])
    const w = await createWorld()
    expect(w.manager.role).toBe('manager')
    expect([w.lead.role, w.member.role, w.outsider.role]).toEqual(['worker', 'worker', 'worker'])
    expect(new Set([w.manager.id, w.lead.id, w.member.id, w.outsider.id]).size).toBe(4)
    expect(w.manager.sessionToken).not.toBe('')
    expect(w.users).toEqual({})
  })

  it('M2: clients C1..C3 and projects P, Q, A with 5 memberships', async () => {
    const w = await createWorld()
    const [total] = await db.select({ n: count() }).from(projectMembers)
    expect(total?.n).toBe(5)
    const roles = async (projectId: string) =>
      (await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)))
        .map((m) => `${m.userId}:${m.role}`)
        .sort()
    expect(await roles(w.P.id)).toEqual([`${w.lead.id}:LEAD`, `${w.member.id}:MEMBER`].sort())
    expect(await roles(w.Q.id)).toEqual([`${w.outsider.id}:MEMBER`])
    expect(await roles(w.A.id)).toEqual([`${w.lead.id}:LEAD`, `${w.member.id}:MEMBER`].sort())
    expect(w.A.archivedAt).not.toBeNull()
    expect(w.P.archivedAt).toBeNull()
    expect(w.C3.archivedAt).not.toBeNull()
    expect(w.P.clientId).toBe(w.C1.id)
    expect(w.Q.clientId).toBe(w.C2.id)
    expect(w.A.clientId).toBe(w.C1.id)
    expect(w.P.createdBy).toBe(w.manager.id)
    expect([w.P.name, w.Q.name, w.A.name]).toEqual(['World P', 'World Q', 'World A'])
  })

  it('parts without a builder throw; part fields of an unbuilt part throw on access', async () => {
    await expect(createWorld({ with: ['pages'] })).rejects.toThrow('world part pages has no builder yet')
    const w = await createWorld()
    expect(() => w.tasks.pLeaf).toThrow("needs createWorld({ with: ['tasks'] })")
  })

  it('M3 with tasks: tree shape, statuses, assignments, batches, blockers (plan/m03 S0.15)', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const t = w.tasks
    // depths, parents, sibling order (COLLATE "C" keys compared with <, X48)
    expect([t.pParent.depth, t.pChildA.depth, t.pChildB.depth, t.pLeaf.depth, t.pDone.depth]).toEqual([
      0, 1, 1, 0, 0,
    ])
    expect([t.pChildA.parentId, t.pChildB.parentId]).toEqual([t.pParent.id, t.pParent.id])
    expect(t.pChildA.position < t.pChildB.position).toBe(true)
    expect(t.pParent.position < t.pLeaf.position && t.pLeaf.position < t.pDone.position).toBe(true)
    expect([t.qTask.projectId, t.aTask.projectId, t.aTask2.projectId]).toEqual([w.Q.id, w.A.id, w.A.id])
    expect(t.pDone).toMatchObject({
      completedOn: '2026-09-28',
      completedWeek: '2026-09-28',
      statusId: w.statuses.P.done.id,
    })
    expect(t.qTask.name).toBe('งาน Q-ลับ02')
    expect(t.pParent.name).toBe('งานแม่ P-ลับ01')

    // statuses: P has 6 live in order (pSecret before done); Q's waitData renamed; one deleted status per P / A
    const live = async (projectId: string) =>
      (
        await db
          .select({ name: taskStatuses.name, category: taskStatuses.category })
          .from(taskStatuses)
          .where(and(eq(taskStatuses.projectId, projectId), isNull(taskStatuses.deletedAt)))
          .orderBy(asc(taskStatuses.position), asc(taskStatuses.id))
      ).map((s) => `${s.name}:${s.category}`)
    const d = th.tasks.status.defaults
    expect(await live(w.P.id)).toEqual([
      `${d.todo}:TODO`,
      `${d.doing}:IN_PROGRESS`,
      `${d.waitData}:WAITING`,
      `${d.blocked}:WAITING`,
      'สถานะลับ P-03:WAITING',
      `${d.done}:DONE`,
    ])
    expect(await live(w.Q.id)).toEqual([
      `${d.todo}:TODO`,
      `${d.doing}:IN_PROGRESS`,
      'สถานะลับ Q-04:WAITING',
      `${d.blocked}:WAITING`,
      `${d.done}:DONE`,
    ])
    expect((await live(w.A.id)).length).toBe(5)
    for (const t2 of [t.pParent, t.pChildA, t.pLeaf]) expect(t2.statusId).toBe(w.statuses.P.todo.id)
    expect(t.pChildB.statusId).toBe(w.statuses.P.doing.id)
    expect(t.aTask2.statusId).toBe(w.statuses.A.doing.id)
    const [deletedStatus] = await db
      .select()
      .from(taskStatuses)
      .where(eq(taskStatuses.id, w.batches.pDeletedStatus.statusId))
    expect(deletedStatus).toMatchObject({ projectId: w.P.id, deletedBatch: w.batches.pDeletedStatus.batch })
    expect(deletedStatus?.deletedAt).not.toBeNull()
    expect(w.batches.pDeletedStatus.moved).toEqual([
      { taskId: t.pChildB.id, fromStatusId: deletedStatus!.id, completedOn: null },
    ])

    // assignments: active ones on leaves of projects the assignee is a member of
    const active = await db
      .select({ taskId: taskAssignments.taskId, userId: taskAssignments.userId })
      .from(taskAssignments)
      .where(isNull(taskAssignments.deletedAt))
    expect(active.map((a) => `${a.taskId}:${a.userId}`).sort()).toEqual(
      [
        `${t.pChildA.id}:${w.member.id}`,
        `${t.pLeaf.id}:${w.lead.id}`,
        `${t.qTask.id}:${w.outsider.id}`,
        `${t.aTask.id}:${w.member.id}`,
      ].sort(),
    )
    const deleted = await db
      .select({ userId: taskAssignments.userId, batch: taskAssignments.deletedBatch })
      .from(taskAssignments)
      .where(eq(taskAssignments.taskId, t.pChildB.id))
    expect(deleted.map((a) => `${a.userId}:${a.batch}`).sort()).toEqual(
      [
        `${w.lead.id}:${w.batches.pRemovedAssignment}`,
        `${w.users.former!.id}:${w.removedMembers.pFormer.batch}`,
      ].sort(),
    )
    const formerMember = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, w.P.id), eq(projectMembers.userId, w.users.former!.id)))
    expect(formerMember).toEqual([])
    expect(w.removedMembers.pFormer.member).toEqual({
      role: 'MEMBER',
      addedBy: w.lead.id,
      addedAt: '2026-09-01T09:00:00+07:00',
    })

    // soft-deleted roots under their batches
    expect(w.deletedTasks.pDeleted).toMatchObject({
      projectId: w.P.id,
      deletedBatch: w.batches.pDeletedTask,
      depth: 0,
    })
    expect(w.deletedTasks.aDeleted).toMatchObject({ projectId: w.A.id, deletedBatch: w.batches.aDeletedTask })
    const [liveP] = await db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.projectId, w.P.id), isNull(tasks.deletedAt)))
    expect(liveP?.n).toBe(5)

    // blockers
    const edges = await db.select().from(taskBlockers)
    expect(edges.map((e) => [e.taskId, e.blockerTaskId, e.projectId])).toEqual([
      [t.pLeaf.id, t.pChildA.id, w.P.id],
    ])
    expect(w.blockers.pLeafByChildA.id).toBe(edges[0]!.id)

    await assertCompletionInvariant()
  })
})
