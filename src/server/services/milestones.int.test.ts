// M8 S2.2/S2.3 — milestone services + actions (SPEC §4.7 FR-701…708, BR-70/71, §3.2 PERM-15/PERM-11, §7.5, X44/X66,
// M8-D3…D6/D14/D19/D21/D25). Authz/audit cases go through the actions (asUser); data cases call services in a tx.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getTargets } from '@/app/api/milestones/targets/route'
import { GET as getMilestones } from '@/app/api/projects/[id]/milestones/route'
import { th } from '@/i18n/th'
import type { MilestoneTargetsResponse, ProjectMilestonesResponse } from '@/lib/contracts/milestones'
import { formatThaiDate } from '@/lib/format'
import {
  createMilestone,
  deleteMilestone,
  linkTasksToMilestone,
  restoreMilestoneBatch,
  revertTaskMilestones,
  updateMilestone,
} from '@/server/actions/milestones'
import { archiveProject } from '@/server/actions/projects'
import { completeTask, deleteTaskTree, restoreTaskBatch } from '@/server/actions/tasks'
import { addMilestones, seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenProjectId, goldenUser, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeMilestone } from '../../../tests/helpers/factories'
import { outcomeOf } from '../../../tests/helpers/outcome'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { tasks as tasksTable } from '../db/schema'
import * as milestones from './milestones'
import { listProjectTasks } from './tasks'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`)
  return r as Extract<T, { ok: true }>
}

const world = () => createWorld({ with: ['milestones'] })
const rawMilestoneOf = async (taskId: string) =>
  (await db.select({ m: tasksTable.milestoneId }).from(tasksTable).where(eq(tasksTable.id, taskId)))[0]!.m
const listP = async (projectId: string) =>
  okJson<ProjectMilestonesResponse>(
    await callRoute(getMilestones, `/api/projects/${projectId}/milestones`, { id: projectId }),
  )

describe('createMilestone (FR-701/702, PERM-15)', () => {
  it('lead on P: trimmed name, UPCOMING, progress 0/0, one audit row; member 403, outsider 404, archived A 403', async () => {
    const w = await world()
    asUser(w.lead)
    const before = await auditCount()
    const r = ok(await createMilestone({ projectId: w.P.id, name: '  Beta  ', date: '2026-11-13' }))
    expect(r.milestone).toMatchObject({
      projectId: w.P.id,
      name: 'Beta',
      date: '2026-11-13',
      description: null,
      completedOn: null,
      status: 'UPCOMING',
      late: false,
      lateTaskCount: 0,
      progress: { done: 0, total: 0 },
    })
    const audits = await auditRowsAfter(before)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      entity: 'milestone',
      action: 'create',
      entityId: r.milestone.id,
      projectId: w.P.id,
      summary: th.audit.milestoneCreated('Beta'),
      actorId: w.lead.id,
    })

    asUser(w.member)
    expect(outcomeOf(await createMilestone({ projectId: w.P.id, name: 'x', date: '2026-11-13' }))).toBe('403')
    asUser(w.outsider)
    expect(outcomeOf(await createMilestone({ projectId: w.P.id, name: 'x', date: '2026-11-13' }))).toBe('404')
    asUser(w.lead)
    expect(outcomeOf(await createMilestone({ projectId: w.A.id, name: 'x', date: '2026-11-13' }))).toBe('403')
  })
})

describe('updateMilestone (FR-701/704/707, M8-D19)', () => {
  it('rename / move / complete / no-op / reopen with the matching audit summaries', async () => {
    const w = await world()
    asUser(w.lead)
    const id = w.milestones.p.id

    let before = await auditCount()
    const renamed = ok(await updateMilestone({ milestoneId: id, patch: { name: 'ชื่อใหม่' } }))
    expect(renamed.changed).toEqual(['name'])
    expect(renamed.previous.name).toBe('Milestone P-ลับ06')
    let audits = await auditRowsAfter(before)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      entity: 'milestone',
      action: 'update',
      projectId: w.P.id,
      summary: th.audit.milestoneUpdated('ชื่อใหม่'),
      before: { name: 'Milestone P-ลับ06' },
      after: { name: 'ชื่อใหม่' },
    })

    before = await auditCount()
    const moved = ok(await updateMilestone({ milestoneId: id, patch: { date: '2026-10-30' } }))
    expect(moved.previous.date).toBe('2026-10-23')
    expect(moved.milestone.date).toBe('2026-10-30')
    audits = await auditRowsAfter(before)
    expect(audits.map((a) => a.summary)).toEqual([
      th.audit.milestoneMoved('ชื่อใหม่', formatThaiDate('2026-10-23'), formatThaiDate('2026-10-30')),
    ])

    const done = ok(await updateMilestone({ milestoneId: id, patch: { completed: true } }))
    expect(done.milestone).toMatchObject({ completedOn: '2026-09-30', status: 'DONE' })
    expect(done.changed).toEqual(['completed'])

    before = await auditCount()
    const again = ok(await updateMilestone({ milestoneId: id, patch: { completed: true } }))
    expect(again.changed).toEqual([])
    expect(again.milestone.completedOn).toBe('2026-09-30')
    expect(await auditRowsAfter(before)).toHaveLength(0)

    const reopened = ok(await updateMilestone({ milestoneId: w.milestones.pLate.id, patch: { completed: false } }))
    expect(reopened.changed).toEqual([])
    expect(reopened.milestone.status).toBe('DUE_SOON')
  })

  it('exact undo of reopen restores the original completedOn; a future completedOn → 400', async () => {
    const w = await world()
    asUser(w.lead)
    const id = w.milestones.pDone.id
    const before = await auditCount()
    const reopened = ok(await updateMilestone({ milestoneId: id, patch: { completed: false } }))
    expect(reopened.previous).toMatchObject({ completed: true, completedOn: '2026-09-16' })
    expect(reopened.milestone).toMatchObject({ completedOn: null, status: 'OVERDUE' })
    expect((await auditRowsAfter(before)).map((a) => a.summary)).toEqual([th.audit.milestoneReopened('Kickoff P')])
    const undone = ok(
      await updateMilestone({ milestoneId: id, patch: { completedOn: reopened.previous.completedOn } }),
    )
    expect(undone.milestone).toMatchObject({ completedOn: '2026-09-16', status: 'DONE' })

    const future = await updateMilestone({ milestoneId: id, patch: { completedOn: '2026-10-01' } })
    expect(outcomeOf(future)).toBe('400')
    expect(future.ok ? null : future.message).toBe(th.milestones.errors.completedInFuture)
  })

  it('PERM-15: member 403, outsider 404, archived A 403, deleted milestone 404', async () => {
    const w = await world()
    asUser(w.member)
    expect(outcomeOf(await updateMilestone({ milestoneId: w.milestones.p.id, patch: { name: 'x' } }))).toBe('403')
    asUser(w.outsider)
    expect(outcomeOf(await updateMilestone({ milestoneId: w.milestones.p.id, patch: { name: 'x' } }))).toBe('404')
    asUser(w.lead)
    expect(outcomeOf(await updateMilestone({ milestoneId: w.milestones.a.id, patch: { name: 'x' } }))).toBe('403')
    expect(
      outcomeOf(await updateMilestone({ milestoneId: w.deletedMilestones.pDeleted.id, patch: { name: 'x' } })),
    ).toBe('404')
  })
})

describe('progress (FR-703, X66, X71)', () => {
  it('bound tasks at any depth; completion via completeTask; deleted tasks drop out until restored', async () => {
    const w = await world()
    asUser(w.lead)
    const m = ok(await createMilestone({ projectId: w.P.id, name: 'ความคืบหน้า', date: '2026-12-04' })).milestone
    const t = w.tasks
    ok(await linkTasksToMilestone({ taskIds: [t.pChildA.id, t.pChildB.id, t.pParent.id], milestoneId: m.id }))
    const progress = async () => (await listP(w.P.id)).milestones.find((x) => x.id === m.id)!.progress
    expect(await progress()).toEqual({ done: 0, total: 3 })
    ok(await completeTask({ taskIds: [t.pChildA.id] }))
    expect(await progress()).toEqual({ done: 1, total: 3 })
    const del = ok(await deleteTaskTree({ taskIds: [t.pChildB.id] }))
    expect(await progress()).toEqual({ done: 1, total: 2 })
    ok(await restoreTaskBatch({ batch: del.batch }))
    expect(await progress()).toEqual({ done: 1, total: 3 })
  })
})

describe('deleteMilestone / restoreMilestoneBatch (FR-708, X04, X66)', () => {
  it('soft delete unbinds on read only; restore re-binds exactly; audit delete + restore', async () => {
    const w = await world()
    const lead = asUser(w.lead)
    const before = await auditCount()
    const del = ok(await deleteMilestone({ milestoneId: w.milestones.p.id }))
    expect(del).toMatchObject({
      projectId: w.P.id,
      milestoneId: w.milestones.p.id,
      name: 'Milestone P-ลับ06',
      unlinkedTaskCount: 1,
    })
    const tasksAfter = await listProjectTasks(db, lead, w.P.id)
    expect(tasksAfter.tasks.find((x) => x.id === w.tasks.pChildB.id)!.milestoneId).toBeNull()
    expect(tasksAfter.milestones.map((x) => x.id)).not.toContain(w.milestones.p.id)
    expect((await listP(w.P.id)).milestones.map((x) => x.id)).not.toContain(w.milestones.p.id)
    expect(await rawMilestoneOf(w.tasks.pChildB.id)).toBe(w.milestones.p.id)

    const restored = ok(await restoreMilestoneBatch({ batch: del.batch }))
    expect(restored.milestone).toMatchObject({ id: w.milestones.p.id, progress: { done: 0, total: 1 } })
    const tasksBack = await listProjectTasks(db, lead, w.P.id)
    expect(tasksBack.tasks.find((x) => x.id === w.tasks.pChildB.id)!.milestoneId).toBe(w.milestones.p.id)
    const audits = await auditRowsAfter(before)
    expect(audits.map((a) => [a.entity, a.action, a.summary])).toEqual([
      ['milestone', 'delete', th.audit.milestoneDeleted('Milestone P-ลับ06', 1)],
      ['milestone', 'restore', th.audit.milestoneRestored('Milestone P-ลับ06')],
    ])
  })

  it('expired batch 400 · archived A 403 · random batch 404 · member 403 · outsider 404', async () => {
    const w = await world()
    asUser(w.lead)
    const expired = await restoreMilestoneBatch({ batch: w.batches.pExpiredMilestone })
    expect(outcomeOf(expired)).toBe('400')
    expect(expired.ok ? null : expired.message).toBe(th.milestones.errors.restoreExpired)
    expect(outcomeOf(await restoreMilestoneBatch({ batch: w.batches.aDeletedMilestone }))).toBe('403')
    expect(outcomeOf(await restoreMilestoneBatch({ batch: randomUUID() }))).toBe('404')
    asUser(w.member)
    expect(outcomeOf(await restoreMilestoneBatch({ batch: w.batches.pDeletedMilestone }))).toBe('403')
    expect(outcomeOf(await deleteMilestone({ milestoneId: w.milestones.p.id }))).toBe('403')
    asUser(w.outsider)
    expect(outcomeOf(await restoreMilestoneBatch({ batch: w.batches.pDeletedMilestone }))).toBe('404')
  })
})

describe('linkTasksToMilestone / revertTaskMilestones (FR-601/614, PERM-11, M8-D4/D14, X66)', () => {
  it('member binds pChildB → pLate: raw previous id + name, one task audit row; same target again is a no-op', async () => {
    const w = await world()
    asUser(w.member)
    const before = await auditCount()
    const r = ok(await linkTasksToMilestone({ taskIds: [w.tasks.pChildB.id], milestoneId: w.milestones.pLate.id }))
    expect(r).toEqual({
      ok: true,
      projectId: w.P.id,
      milestoneId: w.milestones.pLate.id,
      milestoneName: 'ส่งมอบรอบแรก P',
      changed: [{ taskId: w.tasks.pChildB.id, taskName: w.tasks.pChildB.name, previousMilestoneId: w.milestones.p.id }],
    })
    const audits = await auditRowsAfter(before)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      entity: 'task',
      action: 'update',
      entityId: w.tasks.pChildB.id,
      projectId: w.P.id,
      summary: th.audit.taskMilestoneLinked(w.tasks.pChildB.name, 'ส่งมอบรอบแรก P'),
      before: { milestoneId: w.milestones.p.id },
      after: { milestoneId: w.milestones.pLate.id },
    })

    const before2 = await auditCount()
    const again = ok(
      await linkTasksToMilestone({ taskIds: [w.tasks.pChildB.id], milestoneId: w.milestones.pLate.id }),
    )
    expect(again.changed).toEqual([])
    expect(await auditRowsAfter(before2)).toHaveLength(0)
  })

  it('cross-project: Q task + P milestone (manager) → 400 sameProjectOnly; P task + Q milestone (lead) → 404 w/o Q name', async () => {
    const w = await world()
    asUser(w.manager)
    const cross = await linkTasksToMilestone({ taskIds: [w.tasks.qTask.id], milestoneId: w.milestones.p.id })
    expect(outcomeOf(cross)).toBe('400')
    expect(cross.ok ? null : cross.message).toBe(th.milestones.errors.sameProjectOnly)
    asUser(w.lead)
    const hidden = await linkTasksToMilestone({ taskIds: [w.tasks.pLeaf.id], milestoneId: w.milestones.q.id })
    expect(outcomeOf(hidden)).toBe('404')
    expect(JSON.stringify(hidden)).not.toContain('Q-ลับ05')
    asUser(w.outsider)
    expect(outcomeOf(await linkTasksToMilestone({ taskIds: [w.tasks.pLeaf.id], milestoneId: null }))).toBe('404')
    asUser(w.member)
    expect(outcomeOf(await linkTasksToMilestone({ taskIds: [w.tasks.aTask.id], milestoneId: null }))).toBe('403')
  })

  it('unbinding pParent (raw = deleted milestone) is skipped; revert restores raw ids exactly', async () => {
    const w = await world()
    asUser(w.lead)
    const skip = ok(await linkTasksToMilestone({ taskIds: [w.tasks.pParent.id], milestoneId: null }))
    expect(skip.changed).toEqual([])
    expect(await rawMilestoneOf(w.tasks.pParent.id)).toBe(w.deletedMilestones.pDeleted.id)

    const linked = ok(
      await linkTasksToMilestone({
        taskIds: [w.tasks.pParent.id, w.tasks.pChildB.id],
        milestoneId: w.milestones.pLate.id,
      }),
    )
    expect(new Map(linked.changed.map((c) => [c.taskId, c.previousMilestoneId]))).toEqual(
      new Map([
        [w.tasks.pParent.id, w.deletedMilestones.pDeleted.id],
        [w.tasks.pChildB.id, w.milestones.p.id],
      ]),
    )
    const before = await auditCount()
    const reverted = ok(
      await revertTaskMilestones({
        items: linked.changed.map((c) => ({ taskId: c.taskId, milestoneId: c.previousMilestoneId })),
      }),
    )
    expect(reverted.changed.every((c) => c.previousMilestoneId === w.milestones.pLate.id)).toBe(true)
    expect(await rawMilestoneOf(w.tasks.pParent.id)).toBe(w.deletedMilestones.pDeleted.id)
    expect(await rawMilestoneOf(w.tasks.pChildB.id)).toBe(w.milestones.p.id)
    expect(await auditRowsAfter(before)).toHaveLength(2)

    asUser(w.lead)
    expect(
      outcomeOf(await revertTaskMilestones({ items: [{ taskId: w.tasks.pLeaf.id, milestoneId: w.milestones.q.id }] })),
    ).toBe('404')
  })
})

describe('AC-702 (golden): plans after the milestone → "เลย milestone" on the task and on ◆', () => {
  it('CRM "Data cutover" 10-23 + ย้ายข้อมูลลูกค้า (WEEK 10-26) → late; relinked to 11-06 → not late', async () => {
    await seedGolden(db)
    await addMilestones(db)
    const cindy = toSessionUser(await goldenUser('Cindy'))
    asUser(await goldenUser('Cindy'))
    const crm = await goldenProjectId('CRM Migration')
    const m = ok(await createMilestone({ projectId: crm, name: 'Data cutover', date: '2026-10-23' })).milestone
    const [task] = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(eq(tasksTable.name, 'ย้ายข้อมูลลูกค้า'))
    ok(await linkTasksToMilestone({ taskIds: [task!.id], milestoneId: m.id }))
    const list = await listProjectTasks(db, cindy, crm)
    expect(list.tasks.find((t) => t.id === task!.id)).toMatchObject({ milestoneId: m.id, lateForMilestone: true })
    expect((await listP(crm)).milestones.find((x) => x.id === m.id)).toMatchObject({ late: true, lateTaskCount: 1 })

    const dmc = (await listP(crm)).milestones.find((x) => x.name === 'Data migration complete')!
    ok(await linkTasksToMilestone({ taskIds: [task!.id], milestoneId: dmc.id }))
    const after = (await listP(crm)).milestones
    expect(after.find((x) => x.id === dmc.id)).toMatchObject({ late: false, lateTaskCount: 0 })
    expect(after.find((x) => x.id === m.id)).toMatchObject({ late: false, progress: { done: 0, total: 0 } })
  })
})

describe('listTargets (M8-D18, golden)', () => {
  const targets = async (nick: GoldenViewer) => {
    asUser(await goldenUser(nick))
    return (await okJson<MilestoneTargetsResponse>(await callRoute(getTargets, '/api/milestones/targets'))).projects
  }

  it('Manager → 5 projects; Cindy → CRM + POS (collator order); Ivy → []; archived CRM drops out', async () => {
    await seedGolden(db)
    expect(await targets('Manager')).toHaveLength(5)
    expect((await targets('Cindy')).map((p) => p.name)).toEqual(['CRM Migration', 'POS Upgrade'])
    expect(await targets('Ivy')).toEqual([])
    asUser(await goldenUser('Manager'))
    ok(await archiveProject({ projectId: await goldenProjectId('CRM Migration') }))
    expect((await targets('Cindy')).map((p) => p.name)).toEqual(['POS Upgrade'])
    expect(await targets('Manager')).toHaveLength(4)
  })
})

describe('services.milestones pure helpers + lateness', () => {
  it('latenessForTouchedTasks: bound task / bound ancestor / none (M8-D12)', async () => {
    const w = await world()
    const forLeaf = await milestones.latenessForTouchedTasks(db, [w.tasks.pLeaf.id])
    expect(forLeaf).toEqual({
      tasks: [{ taskId: w.tasks.pLeaf.id, lateForMilestone: true }],
      milestones: [{ id: w.milestones.pLate.id, late: true, lateTaskCount: 1 }],
    })
    expect(await milestones.latenessForTouchedTasks(db, [w.tasks.pChildA.id])).toBeNull() // parent's is deleted
    const m = await makeMilestone({ project: w.P, name: 'แม่', date: '2026-09-01', createdBy: w.lead })
    await db.update(tasksTable).set({ milestoneId: m.id }).where(eq(tasksTable.id, w.tasks.pParent.id))
    expect(await milestones.latenessForTouchedTasks(db, [w.tasks.pChildA.id])).toEqual({
      tasks: [{ taskId: w.tasks.pParent.id, lateForMilestone: true }],
      milestones: [{ id: m.id, late: true, lateTaskCount: 1 }],
    })
  })
})
