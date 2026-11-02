// M8 S2.1 — repo/milestones: lateFacts (BR-71, M8-D6, X65/X66/X95 bound), progress (FR-703), live join.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { bindTask, makeAllocation, makeMilestone } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { taskAssignments } from '../db/schema'
import * as repoMilestones from './milestones'
import * as repoTasks from './tasks'

const world = () => createWorld({ with: ['milestones'] })
const rowOf = (rows: repoMilestones.LateFactsRow[], taskId: string) => rows.find((r) => r.taskId === taskId)

async function removedAssignmentId(w: World): Promise<string> {
  const [a] = await db
    .select({ id: taskAssignments.id })
    .from(taskAssignments)
    .where(eq(taskAssignments.deletedBatch, w.batches.pRemovedAssignment))
  return a!.id
}

describe('repo.milestones.lateFacts (BR-71, M8-D6)', () => {
  it('project scope: pLeaf WEEK 10-05 after 10-02; pChildB no plans; completed pDone and deleted-bound pParent absent', async () => {
    const w = await world()
    const rows = await repoMilestones.lateFacts(db, { projectId: w.P.id })
    expect(rowOf(rows, w.tasks.pLeaf.id)).toEqual({
      taskId: w.tasks.pLeaf.id,
      milestoneId: w.milestones.pLate.id,
      milestoneDate: '2026-10-02',
      dueDate: null,
      lastWeekStart: '2026-10-05',
      lastDayDate: null,
    })
    expect(rowOf(rows, w.tasks.pChildB.id)).toMatchObject({
      milestoneId: w.milestones.p.id,
      lastWeekStart: null,
      lastDayDate: null,
    })
    expect(rowOf(rows, w.tasks.pDone.id)).toBeUndefined()
    expect(rowOf(rows, w.tasks.pParent.id)).toBeUndefined()
    expect(rows.every((r) => r.milestoneId !== w.milestones.q.id)).toBe(true)
  })

  it('DAY row later than the date counts; a WEEK row beyond date + 1096 is ignored', async () => {
    const w = await world()
    const m = await makeMilestone({ project: w.P, name: 'M 10-12', date: '2026-10-12', createdBy: w.lead })
    await bindTask(w.tasks.pChildA, m)
    await makeAllocation({ assignment: w.assignments.pChildAMember, period: '2029-10-29', cd: 100 })
    const rows = await repoMilestones.lateFacts(db, { milestoneIds: [m.id] })
    expect(rows).toEqual([
      {
        taskId: w.tasks.pChildA.id,
        milestoneId: m.id,
        milestoneDate: '2026-10-12',
        dueDate: null,
        lastWeekStart: null,
        lastDayDate: '2026-10-13',
      },
    ])
  })

  it('a bound parent sees its live descendants plans (pChildA WEEK 09-28 / DAY 10-13)', async () => {
    const w = await world()
    const m = await makeMilestone({ project: w.P, name: 'M 09-01', date: '2026-09-01', createdBy: w.lead })
    await bindTask(w.tasks.pParent, m)
    const rows = await repoMilestones.lateFacts(db, { boundTaskIds: [w.tasks.pParent.id] })
    expect(rows).toEqual([
      {
        taskId: w.tasks.pParent.id,
        milestoneId: m.id,
        milestoneDate: '2026-09-01',
        dueDate: null,
        lastWeekStart: '2026-09-28',
        lastDayDate: '2026-10-13',
      },
    ])
  })

  it("a soft-deleted assignment's rows are ignored", async () => {
    const w = await world()
    await makeAllocation({ assignment: { id: await removedAssignmentId(w) }, period: '2026-11-02', cd: 100 })
    const rows = await repoMilestones.lateFacts(db, { boundTaskIds: [w.tasks.pChildB.id] })
    expect(rows).toEqual([expect.objectContaining({ taskId: w.tasks.pChildB.id, lastWeekStart: null }) as unknown])
  })

  it('empty id lists return [] without a query', async () => {
    expect(await repoMilestones.lateFacts(db, { milestoneIds: [] })).toEqual([])
    expect(await repoMilestones.lateFacts(db, { boundTaskIds: [] })).toEqual([])
  })
})

describe('repo.milestones.progress / live join (FR-703, M8-D5)', () => {
  it('pDone → { 1, 1 }; an unbound milestone → { 0, 0 }', async () => {
    const w = await world()
    const free = await makeMilestone({ project: w.P, name: 'ว่าง', date: '2026-12-01', createdBy: w.lead })
    const p = await repoMilestones.progress(db, [w.milestones.pDone.id, free.id])
    expect(p.get(w.milestones.pDone.id)).toEqual({ done: 1, total: 1 })
    expect(p.get(free.id)).toEqual({ done: 0, total: 0 })
  })

  it('TaskListRow.milestoneId is live: deleted milestone → null; the raw column is kept', async () => {
    const w = await world()
    const rows = await repoTasks.listLiveWithBlockerCounts(db, w.P.id)
    const by = new Map(rows.map((r) => [r.id, r.milestoneId]))
    expect(by.get(w.tasks.pLeaf.id)).toBe(w.milestones.pLate.id)
    expect(by.get(w.tasks.pChildB.id)).toBe(w.milestones.p.id)
    expect(by.get(w.tasks.pParent.id)).toBeNull()
    expect((await repoTasks.getLive(db, w.tasks.pParent.id))!.milestoneId).toBe(w.deletedMilestones.pDeleted.id)
    expect((await repoTasks.getLiveWithBlockerCounts(db, w.tasks.pParent.id))!.milestoneId).toBeNull()
  })

  it('listForProjects drops archived projects and deleted milestones; range is [from, to)', async () => {
    const w = await world()
    const all = await repoMilestones.listForProjects(db, 'ALL', { from: '2026-09-15', to: '2026-10-23' })
    expect(all.map((m) => m.name)).toEqual(['Kickoff P', 'ส่งมอบรอบแรก P', 'Milestone Q-ลับ05'])
    expect(all[0]).toMatchObject({ projectName: w.P.name, projectColor: w.P.color })
    expect(await repoMilestones.listForProjects(db, [])).toEqual([])
    expect((await repoMilestones.listForProjects(db, [w.A.id])).length).toBe(0)
  })
})
