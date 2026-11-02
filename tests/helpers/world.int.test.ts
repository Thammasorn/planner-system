import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import {
  databaseRows,
  databases,
  files,
  holidays,
  leaveTypes,
  milestones,
  pages,
  planMarkers,
  projectMembers,
  taskAssignments,
  taskBlockers,
  taskStatuses,
  tasks,
  timeOff,
} from '@/server/db/schema'
import { visibleUserIds } from '@/server/authz'
import { allocationRows, assignmentVersion } from './factories'
import { assertCompletionInvariant } from './invariants'
import { toSessionUser } from './as-user'
import { createWorld, expandParts, WORLD_PART_ORDER } from './world'

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
    // M8 built the last pinned part: every part of WORLD_PART_ORDER has a builder now
    expect(WORLD_PART_ORDER).toContain('milestones')
    const w = await createWorld()
    expect(() => w.tasks.pLeaf).toThrow("needs createWorld({ with: ['tasks'] })")
    expect(() => w.batches.pDeletedTask).toThrow("needs createWorld({ with: ['tasks'] })")
    expect(() => w.batches.pDeletedPage).toThrow("needs createWorld({ with: ['pages'] })")
    expect(() => w.pages.wiki).toThrow("needs createWorld({ with: ['pages'] })")
    expect(() => w.files.pImage).toThrow("needs createWorld({ with: ['files'] })")
    expect(() => w.leaveTypes.vacation).toThrow("needs createWorld({ with: ['timeOff'] })")
    expect(() => w.timeOff.coworker).toThrow("needs createWorld({ with: ['timeOff'] })")
    expect(() => w.batches.coworkerDeletedTimeOff).toThrow("needs createWorld({ with: ['timeOff'] })")
    expect(() => w.dayWeeks.pDay).toThrow("needs createWorld({ with: ['dayAllocations'] })")
    expect(() => w.allocations.pLeafLead).toThrow("needs createWorld({ with: ['allocations'] })")
    expect(() => w.taskBodies.pLeafBody).toThrow("needs createWorld({ with: ['taskBodies'] })")
    expect(() => w.planMarkers.pRed).toThrow("needs createWorld({ with: ['planMarkers'] })")
    expect(() => w.milestones.p).toThrow("needs createWorld({ with: ['milestones'] })")
    expect(() => w.deletedMilestones.pDeleted).toThrow("needs createWorld({ with: ['milestones'] })")
    expect(() => w.batches.pDeletedMilestone).toThrow("needs createWorld({ with: ['milestones'] })")
  })

  it("M6: keys the allocations part adds to the tasks part's objects trap until it ran", async () => {
    const t = await createWorld({ with: ['tasks'] })
    expect(t.assignments.pLeafLead.id).toBeTruthy()
    expect(() => t.assignments.pDoneMember).toThrow("needs createWorld({ with: ['allocations'] })")
    expect(() => t.tasks.pCoworker).toThrow("needs createWorld({ with: ['allocations'] })")
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

  it('M6.1 with taskBodies: implies tasks + pages; TASK pages of pLeaf, aTask, qTask (plan/m06.1 S0.15)', async () => {
    expect(expandParts(['taskBodies'])).toEqual(new Set(['taskBodies', 'tasks', 'pages']))
    const w = await createWorld({ with: ['taskBodies'] })
    const b = w.taskBodies
    const shape = {
      kind: 'TASK',
      space: 'PROJECT',
      title: '',
      position: 'a0',
      parentId: null,
      depth: 0,
      version: 1,
    }
    expect(b.pLeafBody).toMatchObject({
      ...shape,
      taskId: w.tasks.pLeaf.id,
      projectId: w.P.id,
      fullWidth: false,
    })
    expect(b.aTaskBody).toMatchObject({ ...shape, taskId: w.tasks.aTask.id, projectId: w.A.id })
    expect(b.qTaskBody).toMatchObject({ ...shape, taskId: w.tasks.qTask.id, projectId: w.Q.id })
    expect([b.aTaskBody.contentText, b.qTaskBody.contentText]).toEqual([
      'รายละเอียด A-ลับ12',
      'รายละเอียด Q-ลับ13',
    ])
    expect(b.pLeafBodyImage).toMatchObject({ kind: 'IMAGE', pageId: b.pLeafBody.id, projectId: w.P.id })
    const [stored] = await db.select().from(pages).where(eq(pages.id, b.pLeafBody.id))
    expect(stored?.content).toEqual([
      { type: 'paragraph', content: 'รายละเอียด P-ลับ11' },
      { type: 'image', props: { url: `/api/files/${b.pLeafBodyImage.id}`, name: 'image.png' } },
    ])
    expect(stored?.contentText).toBe('รายละเอียด P-ลับ11 image.png')
    expect(stored).toEqual(b.pLeafBody)
    // tasks without a body (rows use them for ensure / "page: null")
    const bodies = await db.select({ taskId: pages.taskId }).from(pages).where(eq(pages.kind, 'TASK'))
    expect(bodies.map((r) => r.taskId).sort()).toEqual(
      [w.tasks.pLeaf.id, w.tasks.aTask.id, w.tasks.qTask.id].sort(),
    )
    expect(bodies.map((r) => r.taskId)).not.toContain(w.tasks.pChildB.id)
    expect(bodies.map((r) => r.taskId)).not.toContain(w.tasks.aTask2.id)
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

  it('M6 with allocations: implies tasks + timeOff; plan rows per assignment; versions stay 1 (plan/m06 S0.11)', async () => {
    expect([...expandParts(['allocations'])].sort()).toEqual(['allocations', 'tasks', 'timeOff'])
    const w = await createWorld({ with: ['allocations'] })
    const a = w.assignments
    const coworker = w.users.coworker!
    const W = (cd: number, week: string) => ({ granularity: 'WEEK', periodStart: week, cd })
    const D = (cd: number, day: string) => ({ granularity: 'DAY', periodStart: day, cd })

    expect(await allocationRows(a.pLeafLead.id, '2026-09-28')).toEqual([W(250, '2026-09-28')])
    expect(await allocationRows(a.pLeafLead.id, '2026-10-05')).toEqual([W(500, '2026-10-05')])
    expect(await allocationRows(a.pChildAMember.id, '2026-09-28')).toEqual([W(100, '2026-09-28')])
    expect(await allocationRows(a.pChildAMember.id, '2026-10-12')).toEqual([
      D(50, '2026-10-12'),
      D(50, '2026-10-13'),
    ])
    expect(a.pDoneMember).toMatchObject({ taskId: w.tasks.pDone.id, userId: w.member.id })
    expect(await allocationRows(a.pDoneMember.id, '2026-09-28')).toEqual([W(100, '2026-09-28')])
    expect(await allocationRows(a.pDoneMember.id, '2026-10-05')).toEqual([W(200, '2026-10-05')])
    expect(await allocationRows(a.qTaskOutsider.id, '2026-09-28')).toEqual([W(300, '2026-09-28')])
    expect(await allocationRows(a.aTaskMember.id, '2026-10-05')).toEqual([W(200, '2026-10-05')])
    expect(w.tasks.pCoworker).toMatchObject({
      projectId: w.P.id,
      parentId: null,
      depth: 0,
      name: 'งานร่วม P-ลับ03',
    })
    expect(w.tasks.pCoworker.position > w.tasks.pDone.position).toBe(true)
    expect(a.pCoworker).toMatchObject({ taskId: w.tasks.pCoworker.id, userId: coworker.id })
    expect(await allocationRows(a.pCoworker.id, '2026-10-05')).toEqual([W(100, '2026-10-05')])
    expect(a.qTaskCoworker).toMatchObject({ taskId: w.tasks.qTask.id, userId: coworker.id })
    expect(await allocationRows(a.qTaskCoworker.id, '2026-10-05')).toEqual([W(300, '2026-10-05')])
    // no November 2026 week on pLeafLead / aTaskMember (M7's dayAllocations uses 11-02 / 11-09)
    for (const rows of [w.allocations.pLeafLead, w.allocations.aTaskMember])
      expect(rows.every((r) => r.weekStart < '2026-11-01')).toBe(true)
    expect(w.allocations.pChildAMember.map((r) => [r.granularity, r.weekStart, r.cd])).toEqual([
      ['WEEK', '2026-09-28', 100],
      ['DAY', '2026-10-12', 50],
      ['DAY', '2026-10-12', 50],
    ])
    for (const id of Object.values(a).map((x) => x.id)) expect(await assignmentVersion(id)).toBe(1)
    await assertCompletionInvariant()
  })

  it('M7 with dayAllocations: implies allocations; DAY/WEEK rows on M6 assignments; versions stay 1 (plan/m07 S0.9)', async () => {
    expect([...expandParts(['dayAllocations'])].sort()).toEqual([
      'allocations',
      'dayAllocations',
      'tasks',
      'timeOff',
    ])
    const w = await createWorld({ with: ['dayAllocations'] })
    const a = w.assignments
    const W = (cd: number, week: string) => ({ granularity: 'WEEK', periodStart: week, cd })
    const D = (cd: number, day: string) => ({ granularity: 'DAY', periodStart: day, cd })
    expect(w.dayWeeks).toEqual({
      pWeek: '2026-11-02',
      pDay: '2026-11-09',
      aDay: '2026-11-09',
      qDay: '2026-11-09',
    })
    expect(await allocationRows(a.pLeafLead.id, '2026-11-02')).toEqual([W(250, '2026-11-02')])
    expect(await allocationRows(a.pLeafLead.id, '2026-11-09')).toEqual([
      D(100, '2026-11-09'),
      D(100, '2026-11-10'),
      D(50, '2026-11-11'),
    ])
    expect(await allocationRows(a.aTaskMember.id, '2026-11-09')).toEqual([D(50, '2026-11-09')])
    expect(await allocationRows(a.qTaskCoworker.id, '2026-11-09')).toEqual([D(75, '2026-11-10')])
    // M6's rows are untouched
    expect(await allocationRows(a.qTaskCoworker.id, '2026-10-05')).toEqual([W(300, '2026-10-05')])
    expect(await allocationRows(a.pLeafLead.id, '2026-09-28')).toEqual([W(250, '2026-09-28')])
    for (const id of Object.values(a).map((x) => x.id)) expect(await assignmentVersion(id)).toBe(1)
  })

  it('M7.1 with planMarkers: P RED + GREEN, A YELLOW, Q RED; implies nothing; all live (plan/m07.1 S0.11)', async () => {
    expect([...expandParts(['planMarkers'])]).toEqual(['planMarkers'])
    const w = await createWorld({ with: ['planMarkers'] })
    const m = w.planMarkers
    expect(m.pRed).toMatchObject({
      projectId: w.P.id,
      date: '2026-10-23',
      color: 'RED',
      label: 'UAT sign-off',
    })
    expect(m.pGreen).toMatchObject({ projectId: w.P.id, date: '2026-11-06', color: 'GREEN', label: null })
    expect(m.aYellow).toMatchObject({ projectId: w.A.id, color: 'YELLOW' })
    expect(m.qRed).toMatchObject({ projectId: w.Q.id, color: 'RED' })
    const rows = await db.select().from(planMarkers).orderBy(asc(planMarkers.date))
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.deletedAt === null && r.deletedBatch === null)).toBe(true)
  })

  it('M8 with milestones: implies tasks + allocations; live/deleted milestones, bindings, batches (plan/m08 S0.10)', async () => {
    expect([...expandParts(['milestones'])].sort()).toEqual(['allocations', 'milestones', 'tasks', 'timeOff'])
    const w = await createWorld({ with: ['milestones'] })
    const m = w.milestones
    const d = w.deletedMilestones
    expect(m.p).toMatchObject({
      projectId: w.P.id,
      name: 'Milestone P-ลับ06',
      date: '2026-10-23',
      completedOn: null,
    })
    expect(m.pLate).toMatchObject({ projectId: w.P.id, name: 'ส่งมอบรอบแรก P', date: '2026-10-02' })
    expect(m.pDone).toMatchObject({
      projectId: w.P.id,
      name: 'Kickoff P',
      date: '2026-09-15',
      completedOn: '2026-09-16',
    })
    expect(m.q).toMatchObject({
      projectId: w.Q.id,
      name: 'Milestone Q-ลับ05',
      date: '2026-10-20',
      createdBy: w.manager.id,
    })
    expect(m.a).toMatchObject({ projectId: w.A.id, name: 'Milestone A', date: '2026-10-30' })
    for (const x of Object.values(m)) expect(x.deletedAt).toBeNull()

    // soft-deleted ones: batches, ages
    expect(d.pDeleted).toMatchObject({ projectId: w.P.id, deletedBatch: w.batches.pDeletedMilestone })
    expect(d.pExpired).toMatchObject({ projectId: w.P.id, deletedBatch: w.batches.pExpiredMilestone })
    expect(d.aDeleted).toMatchObject({ projectId: w.A.id, deletedBatch: w.batches.aDeletedMilestone })
    const age = (row: { deletedAt: Date | null }) =>
      Math.round((Date.now() - row.deletedAt!.getTime()) / 86_400_000)
    expect([age(d.pDeleted), age(d.pExpired), age(d.aDeleted)]).toEqual([1, 31, 1])

    // bindings (raw column; pParent points at the deleted milestone and reads as unbound, M8-D5)
    const bound = await db
      .select({ id: tasks.id, milestoneId: tasks.milestoneId })
      .from(tasks)
      .where(isNull(tasks.deletedAt))
    const byTask = new Map(bound.map((r) => [r.id, r.milestoneId]))
    expect(byTask.get(w.tasks.pChildB.id)).toBe(m.p.id)
    expect(byTask.get(w.tasks.pLeaf.id)).toBe(m.pLate.id)
    expect(byTask.get(w.tasks.pDone.id)).toBe(m.pDone.id)
    expect(byTask.get(w.tasks.qTask.id)).toBe(m.q.id)
    expect(byTask.get(w.tasks.aTask.id)).toBe(m.a.id)
    expect(byTask.get(w.tasks.pParent.id)).toBe(d.pDeleted.id)
    expect(w.tasks.pParent.milestoneId).toBe(d.pDeleted.id)
    expect(bound.filter((r) => r.milestoneId !== null)).toHaveLength(6)

    // pLate is late through M6's plan (WEEK 2026-10-05 = 500 > 2026-10-02)
    expect(await allocationRows(w.assignments.pLeafLead.id, '2026-10-05')).toEqual([
      { granularity: 'WEEK', periodStart: '2026-10-05', cd: 500 },
    ])
    const [n] = await db.select({ n: count() }).from(milestones)
    expect(n?.n).toBe(8)

    // X70: every world task keeps a status of its own project; completion invariant holds
    const statusProjects = await db
      .select({ taskProject: tasks.projectId, statusProject: taskStatuses.projectId })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    expect(statusProjects.every((r) => r.taskProject === r.statusProject)).toBe(true)
    await assertCompletionInvariant()
  })

  it('M10 without home: the keys home adds throw clearly', async () => {
    const plain = await createWorld({ with: ['milestones', 'pages'] })
    expect(() => plain.milestones.pOverdue).toThrow("needs createWorld({ with: ['home'] })")
    expect(() => plain.pages.pEmbed).toThrow("needs createWorld({ with: ['home'] })")
    expect(() => plain.tasks.pDueThisWeek).toThrow("needs createWorld({ with: ['home'] })")
    expect(() => plain.timeOff.coworkerToday).toThrow("needs createWorld({ with: ['home'] })")
    expect(plain.milestones.p.name).toBe('Milestone P-ลับ06')
    expect(plain.pages.pPage.title).toBe('หน้า P-ลับ05')
  })

  it('M10 with home: implies every card part; milestones, leave, due task, recent and embed pages (plan/m10 S0.12)', async () => {
    expect([...expandParts(['home'])].sort()).toEqual([
      'allocations',
      'home',
      'milestones',
      'pages',
      'tasks',
      'timeOff',
    ])
    expect(WORLD_PART_ORDER.at(-2)).toBe('home') // M11's 'databases' is last
    const w = await createWorld({ with: ['home'] })
    const m = w.milestones
    expect(m.pOverdue).toMatchObject({
      projectId: w.P.id,
      name: 'Milestone P-ลับ13',
      date: '2026-09-25',
      completedOn: null,
    })
    expect(m.qSoon).toMatchObject({
      projectId: w.Q.id,
      name: 'Milestone Q-ลับ15',
      date: '2026-10-05',
      completedOn: null,
    })
    expect(m.pAncient).toMatchObject({
      projectId: w.P.id,
      name: 'Milestone P-ลับ16',
      date: '2026-08-31',
      completedOn: null,
    })
    expect(m.pLate.name).toBe('ส่งมอบรอบแรก P')

    expect(w.timeOff.coworkerToday).toMatchObject({
      userId: w.users.coworker!.id,
      leaveTypeId: w.leaveTypes.vacation.id,
      startDate: '2026-09-30',
      endDate: '2026-09-30',
      note: 'โน้ตลับ-โลก-03',
    })
    expect(w.timeOff.pOnlyNextWeek).toMatchObject({
      userId: w.users.pOnly!.id,
      leaveTypeId: w.leaveTypes.sick.id,
      startDate: '2026-10-06',
      endDate: '2026-10-07',
      note: 'โน้ตลับ-โลก-04',
    })

    expect(w.tasks.pDueThisWeek).toMatchObject({
      projectId: w.P.id,
      name: 'งานกำหนดส่ง P-ลับ17',
      dueDate: '2026-10-02',
    })
    const assigned = await db
      .select({ id: taskAssignments.id, userId: taskAssignments.userId })
      .from(taskAssignments)
      .where(and(eq(taskAssignments.taskId, w.tasks.pDueThisWeek.id), isNull(taskAssignments.deletedAt)))
    expect(assigned.map((a) => a.userId)).toEqual([w.member.id])
    expect(await allocationRows(assigned[0]!.id, '2026-09-28')).toEqual([]) // no plan → UNPLANNED (not on home)

    const pg = w.pages
    for (const [page, project] of [
      [pg.pEmbed, w.P.id],
      [pg.qEmbed, w.Q.id],
      [pg.aEmbed, w.A.id],
      [pg.wikiEmbed, null],
    ] as const) {
      expect(page.projectId).toBe(project)
      expect(page.content).toEqual([
        { type: 'taskView', props: { view: 'BOARD' } },
        { type: 'projectWorkload', props: {} },
      ])
      expect(page.contentText).toBe('')
    }
    expect(pg.qRecent).toMatchObject({ projectId: w.Q.id, title: 'หน้าล่าสุด Q-ลับ18' })
    const newest = await db
      .select({ id: pages.id, updatedAt: pages.updatedAt })
      .from(pages)
      .orderBy(desc(pages.updatedAt), asc(pages.id))
      .limit(2)
    expect(newest[0]).toEqual({ id: pg.qRecent.id, updatedAt: new Date('2026-09-30T09:00:00+07:00') })
    expect(newest[1]!.updatedAt.getTime()).toBeLessThan(newest[0]!.updatedAt.getTime())
    expect(pg.qRecent.updatedAt).toEqual(new Date('2026-09-30T09:00:00+07:00'))
    expect(pg.pPage.updatedAt.getTime()).toBeLessThanOrEqual(new Date('2026-09-29T09:00:00+07:00').getTime())

    // X70: every task keeps a status of its own project
    const statusProjects = await db
      .select({ taskProject: tasks.projectId, statusProject: taskStatuses.projectId })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    expect(statusProjects.every((r) => r.taskProject === r.statusProject)).toBe(true)
    await assertCompletionInvariant()
  })

  it('M11 without databases: its fields and batches throw clearly', async () => {
    const plain = await createWorld({ with: ['pages'] })
    expect(() => plain.databases.dbP).toThrow("needs createWorld({ with: ['databases'] })")
    expect(() => plain.batches.dbRows).toThrow("needs createWorld({ with: ['databases'] })")
  })

  it('M11 with databases: implies pages + taskBodies + files; owner pages, rows, bodies, batches (plan/m11 S0.17)', async () => {
    expect([...expandParts(['databases'])].sort()).toEqual([
      'databases',
      'files',
      'pages',
      'taskBodies',
      'tasks',
    ])
    expect(WORLD_PART_ORDER.at(-1)).toBe('databases')
    const w = await createWorld({ with: ['databases'] })
    const d = w.databases
    expect(d.dbP).toMatchObject({ pageId: w.pages.pPage.id, title: 'ฐานข้อมูล P-ลับ20', detachedAt: null })
    expect(Object.values(d.dbPColumns).map((c) => c.type)).toEqual([
      'TITLE',
      'SELECT',
      'DATE',
      'TEXT',
      'NUMBER',
      'MULTI_SELECT',
      'CHECKBOX',
      'PERSON',
      'URL',
      'TEXT',
    ])
    expect(d.dbPColumns.deleted).toMatchObject({ name: 'ลบแล้ว', deletedBatch: w.batches.dbColumn })
    expect(d.dbPViews.kanban.config).toEqual({ groupByColumnId: d.dbPColumns.status.id })
    expect(d.dbPViews.calendar.config).toEqual({ dateColumnId: d.dbPColumns.date.id })
    expect(d.dbPViews.deleted.deletedBatch).toBe(w.batches.dbView)
    expect(d.pRow1.cells).toMatchObject({
      [d.dbPColumns.status.id]: d.dbPOptions.doing,
      [d.dbPColumns.person.id]: [w.member.id],
      [d.dbPColumns.check.id]: true,
      [d.dbPColumns.number.id]: '1234.5',
    })
    expect(d.pRowNoBody.id).toBe(d.pRow2.id)
    expect(d.pRowBody).toMatchObject({
      kind: 'DB_ROW',
      databaseRowId: d.pRow1.id,
      space: 'PROJECT',
      projectId: w.P.id,
      position: 'a0',
      title: '',
    })
    expect(d.pRowBody.contentText).toBe('เนื้อหาแถว P-ลับ22 image.png')
    expect(d.pRowImage).toMatchObject({ pageId: d.pRowBody.id, projectId: w.P.id })
    expect(d.pRowDeleted.deletedBatch).toBe(w.batches.dbRows)
    expect(d.pRowDeletedBody.deletedBatch).toBe(w.batches.dbRows)
    expect(d.dbPDetached.detachedAt).not.toBeNull()
    expect(d.dbTask.pageId).toBe(w.taskBodies.pLeafBody.id)
    expect(d.aRowBody).toMatchObject({ projectId: w.A.id, databaseRowId: d.aRow.id })
    expect(d.wikiRowBody).toMatchObject({ space: 'WORKSPACE', projectId: null, databaseRowId: d.wikiRow.id })
    expect(d.dbQ.pageId).toBe(w.pages.qPage.id)
    expect(d.qRow.title).toBe('แถว Q-ลับ24')
    expect(d.dbWikiProt.pageId).toBe(w.pages.wikiProtected.id)
    expect(d.dbDeletedPage.pageId).toBe(w.deletedPages.pDeleted.id)

    const [n] = await db.select({ n: count() }).from(databases)
    expect(n?.n).toBe(8)
    const live = await db
      .select({ id: databaseRows.id })
      .from(databaseRows)
      .where(and(eq(databaseRows.databaseId, d.dbP.id), isNull(databaseRows.deletedAt)))
    expect(live).toHaveLength(3)
  })
})
