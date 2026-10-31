// M3 S2.15 — blockers (SPEC v3.1 FR-640–645, BR-85/86, D12, X73, M3-D31/32, AC-615, R23).
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { addTaskBlocker as addAction, removeTaskBlocker as removeAction } from '../actions/task-blockers'
import { completeTask as completeAction, deleteTaskTree, restoreTaskBatch } from '../actions/tasks'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeAssignment, makeStatuses, makeTask } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { taskAssignments, taskBlockers, tasks } from '../db/schema'
import { addTaskBlocker } from './taskBlockers'
import { listProjectTasks } from './tasks'

const S = toSessionUser

/** BR-87: blockers never touch assignments — the row keeps its task, version and live state. */
async function expectAssignmentUntouched(id: string, taskId: string) {
  const [asg] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, id))
  expect(asg).toMatchObject({ taskId, version: 1, deletedAt: null })
}
const E = th.tasks.blockers.errors

async function badge(w: World, taskId: string) {
  const r = await db.transaction((tx) => listProjectTasks(tx, S(w.lead), w.P.id))
  return r.tasks.find((t) => t.id === taskId)?.blockers
}

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

async function abc() {
  const w = await createWorld()
  await makeStatuses({ project: w.P })
  await makeStatuses({ project: w.Q })
  await makeStatuses({ project: w.A })
  const a = await makeTask({ project: w.P, name: 'A', createdBy: w.manager })
  const b = await makeTask({ project: w.P, name: 'B', createdBy: w.manager })
  const c = await makeTask({ project: w.P, name: 'C', createdBy: w.manager })
  return { w, a, b, c }
}

describe('addTaskBlocker (BR-85)', () => {
  it('AC-615: B blocked by A → ⛔ 1; A blocked by B → cycle B → A → B; A done → ✓, B status unchanged', async () => {
    const { w, a, b } = await abc()
    const asgB = await makeAssignment({ task: b, user: w.member })
    const asgA = await makeAssignment({ task: a, user: w.lead })
    asUser(w.member)
    const mark = await auditCount()
    const r = await addAction({ taskId: b.id, blockerTaskId: a.id })
    expect(r).toMatchObject({ ok: true, created: true, edge: { taskId: b.id, blockerTaskId: a.id } })
    await expectAssignmentUntouched(asgB.id, b.id)
    await expectAssignmentUntouched(asgA.id, a.id)
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ entity: 'task_blocker', action: 'create', summary: th.audit.blockerAdded('B', 'A') }),
    ])
    expect(await badge(w, b.id)).toEqual({ open: 1, total: 1 })
    expect(await addAction({ taskId: a.id, blockerTaskId: b.id })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: E.cycle('B → A → B'),
    })
    const statusBefore = (await db.select().from(tasks).where(eq(tasks.id, b.id)))[0]!.statusId
    await completeAction({ taskIds: [a.id] })
    expect(await badge(w, b.id)).toEqual({ open: 0, total: 1 })
    expect((await db.select().from(tasks).where(eq(tasks.id, b.id)))[0]!.statusId).toBe(statusBefore)
    await expectAssignmentUntouched(asgB.id, b.id)
  })

  it('indirect cycle (A→B, B→C, add C→A) rejected with the 4-element path', async () => {
    const { w, a, b, c } = await abc()
    asUser(w.lead)
    await addAction({ taskId: b.id, blockerTaskId: a.id })
    await addAction({ taskId: c.id, blockerTaskId: b.id })
    expect(await addAction({ taskId: a.id, blockerTaskId: c.id })).toMatchObject({
      code: 'VALIDATION',
      message: E.cycle('C → A → B → C'),
    })
  })

  it('child blocks parent → ancestry; duplicate → same edge, created false, no extra audit row', async () => {
    const { w, a, b } = await abc()
    const child = await makeTask({ project: w.P, parent: a, name: 'A1', createdBy: w.manager })
    asUser(w.lead)
    expect(await addAction({ taskId: a.id, blockerTaskId: child.id })).toMatchObject({
      code: 'VALIDATION',
      message: E.ancestry,
    })
    const first = await addAction({ taskId: b.id, blockerTaskId: a.id })
    const mark = await auditCount()
    const again = await addAction({ taskId: b.id, blockerTaskId: a.id })
    if (!first.ok || !again.ok) throw new Error('failed')
    expect(again).toMatchObject({ created: false, edge: { id: first.edge.id } })
    expect(await auditRowsAfter(mark)).toEqual([])
  })

  it('Q task as blocker: manager → VALIDATION crossProject, lead → NOT_FOUND; archived A → FORBIDDEN', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.manager)
    expect(await addAction({ taskId: w.tasks.pLeaf.id, blockerTaskId: w.tasks.qTask.id })).toMatchObject({
      code: 'VALIDATION',
      message: E.crossProject,
    })
    asUser(w.lead)
    expect(await addAction({ taskId: w.tasks.pLeaf.id, blockerTaskId: w.tasks.qTask.id })).toMatchObject({
      code: 'NOT_FOUND',
    })
    asUser(w.member)
    expect(await addAction({ taskId: w.tasks.aTask.id, blockerTaskId: w.tasks.aTask2.id })).toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('concurrent A→B and B→A: exactly one succeeds (advisory lock, R23)', async () => {
    const { w, a, b } = await abc()
    const u = S(w.lead)
    const results = await Promise.allSettled([
      db.transaction((tx) => addTaskBlocker(tx, u, { taskId: b.id, blockerTaskId: a.id })),
      db.transaction((tx) => addTaskBlocker(tx, u, { taskId: a.id, blockerTaskId: b.id })),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
  })
})

describe('removeTaskBlocker (M3-D31)', () => {
  it('remove → { 0, 0 }, deleted_batch null; a later tree restore of another batch leaves it deleted; re-add → new edge', async () => {
    const { w, a, b, c } = await abc()
    const asgB = await makeAssignment({ task: b, user: w.member })
    asUser(w.lead)
    const add = await addAction({ taskId: b.id, blockerTaskId: a.id })
    if (!add.ok) throw new Error('failed')
    const mark = await auditCount()
    expect(await removeAction({ blockerId: add.edge.id })).toMatchObject({ ok: true, edgeId: add.edge.id })
    await expectAssignmentUntouched(asgB.id, b.id)
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ entity: 'task_blocker', action: 'delete', summary: th.audit.blockerRemoved('B', 'A') }),
    ])
    expect(await badge(w, b.id)).toEqual({ open: 0, total: 0 })
    const [edge] = await db.select().from(taskBlockers).where(eq(taskBlockers.id, add.edge.id))
    expect(edge!.deletedBatch).toBeNull()
    const del = await deleteTaskTree({ taskIds: [c.id] })
    if (!del.ok) throw new Error('failed')
    await restoreTaskBatch({ batch: del.batch })
    expect(await badge(w, b.id)).toEqual({ open: 0, total: 0 })
    expect(await removeAction({ blockerId: add.edge.id })).toMatchObject({ code: 'NOT_FOUND' })
    const again = await addAction({ taskId: b.id, blockerTaskId: a.id })
    expect(again).toMatchObject({ ok: true, created: true })
    if (again.ok) expect(again.edge.id).not.toBe(add.edge.id)
  })

  it('outsider → NOT_FOUND', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.outsider)
    expect(await removeAction({ blockerId: w.blockers.pLeafByChildA.id })).toMatchObject({ code: 'NOT_FOUND' })
  })
})
