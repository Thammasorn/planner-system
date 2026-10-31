import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { and, asc, count, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import {
  files,
  holidays,
  leaveTypes,
  pages,
  projectMembers,
  taskAssignments,
  taskBlockers,
  taskStatuses,
  tasks,
  timeOff,
} from '@/server/db/schema'
import { visibleUserIds } from '@/server/authz'
import { assertCompletionInvariant } from './invariants'
import { toSessionUser } from './as-user'
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
    await expect(createWorld({ with: ['allocations'] })).rejects.toThrow(
      'world part allocations has no builder yet',
    )
    const w = await createWorld()
    expect(() => w.tasks.pLeaf).toThrow("needs createWorld({ with: ['tasks'] })")
    expect(() => w.batches.pDeletedTask).toThrow("needs createWorld({ with: ['tasks'] })")
    expect(() => w.batches.pDeletedPage).toThrow("needs createWorld({ with: ['pages'] })")
    expect(() => w.pages.wiki).toThrow("needs createWorld({ with: ['pages'] })")
    expect(() => w.files.pImage).toThrow("needs createWorld({ with: ['files'] })")
    expect(() => w.leaveTypes.vacation).toThrow("needs createWorld({ with: ['timeOff'] })")
    expect(() => w.timeOff.coworker).toThrow("needs createWorld({ with: ['timeOff'] })")
    expect(() => w.batches.coworkerDeletedTimeOff).toThrow("needs createWorld({ with: ['timeOff'] })")
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

  it('M4 with pages/files: tree shape, protection, batches, files on disk (plan/m04 S0.15)', async () => {
    const w = await createWorld({ with: ['files'] }) // files implies pages
    const p = w.pages
    expect(expandParts(['files'])).toEqual(new Set(['files', 'pages']))
    expect([p.pCharter.depth, p.pPage.depth, p.pChild.depth, p.wikiChild.depth]).toEqual([0, 0, 1, 1])
    expect(p.pChild.parentId).toBe(p.pPage.id)
    expect(p.pChild).toMatchObject({ space: 'PROJECT', projectId: w.P.id })
    expect(p.pCharter).toMatchObject({ isCharter: true, projectId: w.P.id, parentId: null })
    expect(p.pCharter.position < p.pPage.position).toBe(true)
    expect([p.qPage.projectId, p.aPage.projectId]).toEqual([w.Q.id, w.A.id])
    expect(p.wiki).toMatchObject({ space: 'WORKSPACE', projectId: null, parentId: null })
    expect(p.wikiChild.parentId).toBe(p.wiki.id)
    expect([
      p.wikiProtected.locked,
      p.wikiProtectedChild.locked,
      p.wikiFolder.locked,
      p.wikiFolderLocked.locked,
    ]).toEqual([true, false, false, true])
    expect(p.wikiFolderLocked.parentId).toBe(p.wikiFolder.id)
    expect(p.pPage.contentText).toBe('เนื้อหา P-ลับ06')

    const d = w.deletedPages
    expect(d.pDeleted).toMatchObject({ projectId: w.P.id, deletedBatch: w.batches.pDeletedPage })
    expect(d.aDeleted).toMatchObject({ projectId: w.A.id, deletedBatch: w.batches.aDeletedPage })
    expect(d.wikiDeleted).toMatchObject({ space: 'WORKSPACE', deletedBatch: w.batches.wikiDeletedPage })
    expect(d.pOldDeleted.deletedBatch).toBe(w.batches.pOldDeletedPage)
    const days = (t: Date | null) => (Date.now() - (t?.getTime() ?? 0)) / 86_400_000
    expect(days(d.pDeleted.deletedAt)).toBeCloseTo(1, 1)
    expect(days(d.pOldDeleted.deletedAt)).toBeCloseTo(31, 1)
    const [live] = await db.select({ n: count() }).from(pages).where(isNull(pages.deletedAt))
    expect(live?.n).toBe(11)

    const f = w.files
    expect([f.pImage.kind, f.pPdf.kind]).toEqual(['IMAGE', 'ATTACHMENT'])
    expect(f.pPdf).toMatchObject({ originalName: 'สัญญา.pdf', mime: 'application/pdf', pageId: p.pPage.id })
    expect([f.pImage.projectId, f.qFile.projectId, f.aFile.projectId, f.wikiFile.projectId]).toEqual([
      w.P.id,
      w.Q.id,
      w.A.id,
      null,
    ])
    const root = process.env.UPLOAD_DIR!
    for (const file of Object.values(f)) {
      const full = path.join(root, file.storageKey)
      expect(existsSync(full), file.storageKey).toBe(true)
      expect(readFileSync(full).length).toBe(file.sizeBytes)
    }
    const [n] = await db.select({ n: count() }).from(files)
    expect(n?.n).toBe(5)
  })

  it('M5 with timeOff: leave types, coworker / pOnly visibility, entries, holiday (plan/m05 S0.15)', async () => {
    const w = await createWorld({ with: ['timeOff'] })
    const lt = w.leaveTypes
    expect([lt.vacation.name, lt.sick.name, lt.training.name, lt.archived.name]).toEqual([
      'ลาพักร้อน-โลก',
      'ลาป่วย-โลก',
      'อบรม-โลก',
      'ลาเก่า-โลก',
    ])
    expect([lt.vacation.color, lt.sick.color, lt.training.color]).toEqual(['#0369A1', '#B91C1C', '#7E22CE'])
    const ordered = await db.select().from(leaveTypes).orderBy(asc(leaveTypes.position), asc(leaveTypes.id))
    expect(ordered.map((t) => t.id)).toEqual([lt.vacation.id, lt.sick.id, lt.training.id, lt.archived.id])
    expect(w.leaveTypes.archived.archivedAt).not.toBeNull()
    expect(lt.vacation.archivedAt).toBeNull()

    const { coworker, pOnly } = w.users
    expect(coworker!.role).toBe('worker')
    expect(pOnly!.role).toBe('worker')
    const outsiderSees = await visibleUserIds(db, toSessionUser(w.outsider))
    expect(outsiderSees).not.toBe('ALL')
    const seen = outsiderSees as Set<string>
    expect(seen.has(coworker!.id)).toBe(true)
    expect(seen.has(pOnly!.id)).toBe(false)
    const memberSees = (await visibleUserIds(db, toSessionUser(w.member))) as Set<string>
    expect(memberSees.has(coworker!.id) && memberSees.has(pOnly!.id)).toBe(true)
    expect(await visibleUserIds(db, toSessionUser(w.lead))).toBe('ALL')

    const t = w.timeOff
    expect(t.coworker).toMatchObject({
      userId: coworker!.id,
      leaveTypeId: lt.vacation.id,
      startDate: '2026-11-09',
      endDate: '2026-11-10',
      half: null,
      note: 'โน้ตลับ-โลก-01',
      deletedAt: null,
    })
    expect(t.pOnly).toMatchObject({
      userId: pOnly!.id,
      leaveTypeId: lt.sick.id,
      startDate: '2026-11-16',
      endDate: '2026-11-16',
      half: 'PM',
      note: 'โน้ตลับ-โลก-02',
    })
    expect(t.member).toMatchObject({
      userId: w.member.id,
      leaveTypeId: lt.training.id,
      startDate: '2026-11-02',
    })

    const [deleted] = await db
      .select()
      .from(timeOff)
      .where(eq(timeOff.deletedBatch, w.batches.coworkerDeletedTimeOff))
    expect(deleted).toMatchObject({ userId: coworker!.id, leaveTypeId: lt.sick.id, startDate: '2026-11-23' })
    const age = (Date.now() - deleted!.deletedAt!.getTime()) / 86_400_000
    expect(age).toBeCloseTo(1, 1)
    const [live] = await db.select({ n: count() }).from(timeOff).where(isNull(timeOff.deletedAt))
    expect(live?.n).toBe(3)

    expect(w.holidays.h1).toMatchObject({ date: '2026-11-20', name: 'วันหยุดโลก' })
    const [h] = await db.select({ n: count() }).from(holidays)
    expect(h?.n).toBe(1)
  })
})
