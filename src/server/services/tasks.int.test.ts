// M3 S2.1 / S2.3–S2.5 / S2.8 / S2.10 — task authz helpers, create, update, tree moves, delete + restore, project list
// (FR-601–611, BR-30–33, AC-602/603, X62, M3-D2/D3/D11/D12/D23/D39).
import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { AssignmentTransfer } from '@/lib/contracts/tasks'
import {
  createTask as createTaskAction,
  deleteTaskTree as deleteAction,
  indentTask as indentAction,
  restoreTaskBatch as restoreAction,
  updateTask as updateAction,
} from '../actions/tasks'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import {
  allocationRows,
  makeAllocation,
  makeAssignment,
  makeBlocker,
  makeStatuses,
  makeTask,
  makeUser,
} from '../../../tests/helpers/factories'
import { goldenUser } from '../../../tests/authz/_support/golden'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { assertCompletionInvariant } from '../../../tests/helpers/invariants'
import { createWorld, type World } from '../../../tests/helpers/world'
import * as authz from '../authz'
import { db } from '../db/client'
import { taskAssignments, tasks } from '../db/schema'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'
import type { TaskRow } from '../repo/tasks'
import { buildChunk } from './grid'
import {
  createTask,
  deleteTaskTree,
  indentTask,
  listProjectTasks,
  moveTask,
  outdentTask,
  restoreTaskBatch,
  updateTask,
} from './tasks'

const S = toSessionUser
const TODAY: ISODate = '2026-09-30'
const reverse = (t: AssignmentTransfer): AssignmentTransfer => ({
  assignmentIds: t.assignmentIds,
  fromTaskId: t.toTaskId,
  toTaskId: t.fromTaskId,
})
const inTx = <T>(f: (tx: DbOrTx) => Promise<T>): Promise<T> => db.transaction((tx) => f(tx))

async function row(id: string): Promise<TaskRow> {
  const [r] = await db.select().from(tasks).where(eq(tasks.id, id))
  return r!
}

/** Live children names in display order. */
async function childNames(projectId: string, parentId: string | null): Promise<string[]> {
  const rows = await db
    .select({ name: tasks.name })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        parentId ? eq(tasks.parentId, parentId) : isNull(tasks.parentId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(tasks.position), asc(tasks.id))
  return rows.map((r) => r.name)
}

async function activeAssignmentsOf(taskId: string) {
  return db
    .select()
    .from(taskAssignments)
    .where(and(eq(taskAssignments.taskId, taskId), isNull(taskAssignments.deletedAt)))
}

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})
afterEach(async () => {
  await assertCompletionInvariant()
})

/** P with the 5 default statuses and nothing else; the world users. */
async function plainWorld(): Promise<World & { st: Awaited<ReturnType<typeof makeStatuses>> }> {
  const w = await createWorld()
  const st = await makeStatuses({ project: w.P })
  await makeStatuses({ project: w.Q })
  await makeStatuses({ project: w.A })
  return { ...w, st }
}

describe('authz helpers', () => {
  it('W on a P task → NOT_FOUND; M on tasks of P + Q → VALIDATION; W on P + Q → NOT_FOUND; deleted → NOT_FOUND', async () => {
    const w = await createWorld({ with: ['tasks'] })
    await expect(inTx((tx) => authz.requireTask(tx, S(w.outsider), w.tasks.pLeaf.id, 'edit'))).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    )
    await expect(
      inTx((tx) => authz.requireTasks(tx, S(w.manager), [w.tasks.pLeaf.id, w.tasks.qTask.id], 'edit')),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: th.tasks.errors.sameProjectOnly })
    await expect(
      inTx((tx) => authz.requireTasks(tx, S(w.outsider), [w.tasks.pLeaf.id, w.tasks.qTask.id], 'edit')),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      inTx((tx) => authz.requireTask(tx, S(w.manager), w.deletedTasks.pDeleted.id, 'view')),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(inTx((tx) => authz.requireTask(tx, S(w.manager), 'not-a-uuid', 'view'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(inTx((tx) => authz.requireTask(tx, S(w.member), w.tasks.aTask.id, 'edit'))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    const ok = await inTx((tx) => authz.requireTasks(tx, S(w.member), [w.tasks.pLeaf.id, w.tasks.pDone.id], 'edit'))
    expect(ok).toMatchObject({ projectId: w.P.id, role: 'MEMBER', archived: false })
    expect(ok.tasks).toHaveLength(2)
  })

  it('requireStatus: live → access; deleted only with includeDeleted; Me manage → FORBIDDEN', async () => {
    const w = await createWorld({ with: ['tasks'] })
    await expect(
      inTx((tx) => authz.requireStatus(tx, S(w.member), w.statuses.P.todo.id, 'manage')),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      inTx((tx) => authz.requireStatus(tx, S(w.outsider), w.statuses.P.todo.id, 'view')),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const del = w.batches.pDeletedStatus.statusId
    await expect(inTx((tx) => authz.requireStatus(tx, S(w.lead), del, 'manage'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    const r = await inTx((tx) => authz.requireStatus(tx, S(w.lead), del, 'manage', { includeDeleted: true }))
    expect(r.status.id).toBe(del)
  })
})

describe('createTask', () => {
  it('trimmed name, default status ยังไม่เริ่ม (AC-611), append order, afterId null → first; one audit row', async () => {
    const w = await plainWorld()
    asUser(w.member)
    const mark = await auditCount()
    const r1 = await createTaskAction({ projectId: w.P.id, name: '  R1  ' })
    expect(r1).toMatchObject({ ok: true, transfer: null })
    if (!r1.ok) throw new Error('create failed')
    expect(r1.task).toMatchObject({ name: 'R1', depth: 0, statusId: w.st.todo.id, completedOn: null, assignees: [] })
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'task',
        action: 'create',
        entityId: r1.task.id,
        projectId: w.P.id,
        summary: th.audit.taskCreated('R1'),
      }),
    ])
    await createTaskAction({ projectId: w.P.id, name: 'R2' })
    await createTaskAction({ projectId: w.P.id, name: 'R3' })
    await createTaskAction({ projectId: w.P.id, name: 'R0', afterId: null })
    expect(await childNames(w.P.id, null)).toEqual(['R0', 'R1', 'R2', 'R3'])
    expect(await createTaskAction({ projectId: w.P.id, name: ' ' })).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it('statusId: doing stored; done → completed_on today (BR-80); a status of Q → NOT_FOUND', async () => {
    const w = await plainWorld()
    const u = S(w.lead)
    const doing = await inTx((tx) => createTask(tx, u, { projectId: w.P.id, parentId: null, name: 'x', statusId: w.st.doing.id }, TODAY))
    expect(doing.task).toMatchObject({ statusId: w.st.doing.id, completedOn: null })
    const done = await inTx((tx) => createTask(tx, u, { projectId: w.P.id, parentId: null, name: 'y', statusId: w.st.done.id }, TODAY))
    expect(done.task.completedOn).toBe('2026-09-30')
    expect((await row(done.task.id)).completedBy).toBe(w.lead.id)
    const [qTodo] = await db.execute<{ id: string }>(
      sql`select id from task_statuses where project_id = ${w.Q.id} order by position limit 1`,
    )
    await expect(
      inTx((tx) => createTask(tx, u, { projectId: w.P.id, parentId: null, name: 'z', statusId: qTodo!.id }, TODAY)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('parent depth 2 → VALIDATION maxDepth; parent in Q: manager → VALIDATION crossProject, lead → NOT_FOUND; archived → FORBIDDEN', async () => {
    const w = await plainWorld()
    const a = await makeTask({ project: w.P, createdBy: w.manager })
    const b = await makeTask({ project: w.P, parent: a, createdBy: w.manager })
    const c = await makeTask({ project: w.P, parent: b, createdBy: w.manager })
    await expect(
      inTx((tx) => createTask(tx, S(w.lead), { projectId: w.P.id, parentId: c.id, name: 'd' }, TODAY)),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: th.tasks.errors.maxDepth })
    const q = await makeTask({ project: w.Q, createdBy: w.manager })
    await expect(
      inTx((tx) => createTask(tx, S(w.manager), { projectId: w.P.id, parentId: q.id, name: 'd' }, TODAY)),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: th.tasks.errors.crossProject })
    await expect(
      inTx((tx) => createTask(tx, S(w.lead), { projectId: w.P.id, parentId: q.id, name: 'd' }, TODAY)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    asUser(w.member)
    expect(await createTaskAction({ projectId: w.A.id, name: 'x' })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })

  it('FR-610: child of an assigned leaf takes over its assignment (version 2); undo via deleteTaskTree + reverse', async () => {
    const w = await plainWorld()
    const parent = await makeTask({ project: w.P, name: 'Parent', createdBy: w.manager })
    const asg = await makeAssignment({ task: parent, user: w.member })
    const r = await inTx((tx) => createTask(tx, S(w.lead), { projectId: w.P.id, parentId: parent.id, name: 'Child' }, TODAY))
    expect(r.transfer).toEqual({ assignmentIds: [asg.id], fromTaskId: parent.id, toTaskId: r.task.id })
    expect(r.task.assignees).toEqual([{ assignmentId: asg.id, userId: w.member.id }])
    const [moved] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, asg.id))
    expect(moved).toMatchObject({ taskId: r.task.id, version: 2 })
    asUser(w.lead)
    const del = await deleteAction({ taskIds: [r.task.id], transfer: reverse(r.transfer!) })
    expect(del).toMatchObject({ ok: true })
    const [back] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, asg.id))
    expect(back).toMatchObject({ taskId: parent.id, version: 3, deletedAt: null })
    expect((await row(r.task.id)).deletedAt).not.toBeNull()
    // redo = restore with the original transfer
    if (!del.ok) throw new Error('delete failed')
    expect(await restoreAction({ batch: del.batch, transfer: r.transfer! })).toMatchObject({ ok: true })
    const [again] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, asg.id))
    expect(again).toMatchObject({ taskId: r.task.id, version: 4 })
  })

  it('two concurrent appends under the same parent get distinct keys (advisory lock)', async () => {
    const w = await plainWorld()
    const u = S(w.lead)
    const [a, b] = await Promise.all([
      inTx((tx) => createTask(tx, u, { projectId: w.P.id, parentId: null, name: 'A' }, TODAY)),
      inTx((tx) => createTask(tx, u, { projectId: w.P.id, parentId: null, name: 'B' }, TODAY)),
    ])
    expect(a.task.position).not.toBe(b.task.position)
    expect((await childNames(w.P.id, null)).sort()).toEqual(['A', 'B'])
  })
})

describe('updateTask', () => {
  it('rename + dates + certainty, start only, due before start → VALIDATION, certainty override; W → NOT_FOUND', async () => {
    const w = await plainWorld()
    const t = await makeTask({ project: w.P, name: 'Old', createdBy: w.manager, startDate: '2026-10-05' })
    asUser(w.member)
    const mark = await auditCount()
    const r = await updateAction({
      taskId: t.id,
      patch: { name: 'New', dueDate: '2026-10-09', certaintyOverride: 'TENTATIVE' },
    })
    expect(r).toMatchObject({
      ok: true,
      task: { name: 'New', dueDate: '2026-10-09', certaintyOverride: 'TENTATIVE', hasBody: false },
    })
    expect(r.ok && 'notes' in r.task).toBe(false)
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'task',
        action: 'update',
        summary: th.audit.taskUpdated('New'),
        before: { name: 'Old', dueDate: null, certaintyOverride: null },
        after: { name: 'New', dueDate: '2026-10-09', certaintyOverride: 'TENTATIVE' },
      }),
    ])
    // M6.1-D12 (FR-692): notes are no longer accepted — a notes-only patch is a VALIDATION error, nothing written
    const mark2 = await auditCount()
    expect(await updateAction({ taskId: t.id, patch: { notes: 'x' } as never })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await auditRowsAfter(mark2)).toEqual([])
    await updateAction({ taskId: t.id, patch: { dueDate: null, certaintyOverride: null } })
    expect(await updateAction({ taskId: t.id, patch: { startDate: '2026-10-06' } })).toMatchObject({
      ok: true,
      task: { startDate: '2026-10-06' },
    })
    expect(await updateAction({ taskId: t.id, patch: { dueDate: '2026-10-01' } })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.tasks.errors.dueBeforeStart,
    })
    const u = S(w.lead)
    const tent = await inTx((tx) => updateTask(tx, u, { taskId: t.id, patch: { certaintyOverride: 'TENTATIVE' } }))
    expect(tent.task.certaintyOverride).toBe('TENTATIVE')
    const cleared = await inTx((tx) => updateTask(tx, u, { taskId: t.id, patch: { certaintyOverride: null } }))
    expect(cleared.task.certaintyOverride).toBeNull()
    asUser(w.outsider)
    expect(await updateAction({ taskId: t.id, patch: { name: 'x' } })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })
})

describe('tree', () => {
  it('AC-602: indent R2 under R1; first row / too deep → { changed: false } with updated_at unchanged', async () => {
    const w = await plainWorld()
    const r1 = await makeTask({ project: w.P, name: 'R1', createdBy: w.manager })
    const r2 = await makeTask({ project: w.P, name: 'R2', createdBy: w.manager })
    asUser(w.member)
    const mark = await auditCount()
    const res = await indentAction({ taskId: r2.id })
    expect(res).toMatchObject({ ok: true, changed: true, previous: { parentId: null, afterId: r1.id }, transfer: null })
    expect(await row(r2.id)).toMatchObject({ parentId: r1.id, depth: 1 })
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ entity: 'task', action: 'update', summary: th.audit.taskMoved('R2') }),
    ])
    const before = (await row(r1.id)).updatedAt
    expect(await inTx((tx) => indentTask(tx, S(w.lead), { taskId: r1.id }))).toEqual({ changed: false })
    expect((await row(r1.id)).updatedAt).toEqual(before)

    // chain A > B > C, D at depth 2 after C: indent D (previous sibling C at depth 2) → no-op
    const a = await makeTask({ project: w.P, name: 'A', createdBy: w.manager })
    const b = await makeTask({ project: w.P, parent: a, name: 'B', createdBy: w.manager })
    const c = await makeTask({ project: w.P, parent: b, name: 'C', createdBy: w.manager })
    const d = await makeTask({ project: w.P, parent: b, name: 'D', createdBy: w.manager })
    expect(await inTx((tx) => indentTask(tx, S(w.lead), { taskId: d.id }))).toEqual({ changed: false })
    void c
    // E (depth 1, with a child) whose previous sibling B is at depth 1 → height 1 → no-op
    const e = await makeTask({ project: w.P, parent: a, name: 'E', createdBy: w.manager })
    await makeTask({ project: w.P, parent: e, name: 'E1', createdBy: w.manager })
    expect(await inTx((tx) => indentTask(tx, S(w.lead), { taskId: e.id }))).toEqual({ changed: false })
  })

  it('indenting a task with a child shifts the descendants depth', async () => {
    const w = await plainWorld()
    const r1 = await makeTask({ project: w.P, name: 'R1', createdBy: w.manager })
    const r2 = await makeTask({ project: w.P, name: 'R2', createdBy: w.manager })
    const r2c = await makeTask({ project: w.P, parent: r2, name: 'R2c', createdBy: w.manager })
    await inTx((tx) => indentTask(tx, S(w.lead), { taskId: r2.id }))
    expect(await row(r2.id)).toMatchObject({ parentId: r1.id, depth: 1 })
    expect(await row(r2c.id)).toMatchObject({ parentId: r2.id, depth: 2 })
  })

  it('BR-31 (M3-D2): indent B under assigned A moves A’s assignment; undo via moveTask + reverse transfer', async () => {
    const w = await plainWorld()
    const cindy = await makeUser({ nickname: 'Cindy' })
    const ivy = await makeUser({ nickname: 'Ivy' })
    const a = await makeTask({ project: w.P, name: 'A', createdBy: w.manager })
    const b = await makeTask({ project: w.P, name: 'B', createdBy: w.manager })
    const aCindy = await makeAssignment({ task: a, user: cindy })
    const bIvy = await makeAssignment({ task: b, user: ivy })
    const r = await inTx((tx) => indentTask(tx, S(w.lead), { taskId: b.id }))
    if (!r.changed) throw new Error('expected a change')
    expect(r.transfer).toEqual({ assignmentIds: [aCindy.id], fromTaskId: a.id, toTaskId: b.id })
    expect((await activeAssignmentsOf(a.id)).length).toBe(0)
    const onB = await activeAssignmentsOf(b.id)
    expect(onB.map((x) => x.userId).sort()).toEqual([cindy.id, ivy.id].sort())
    expect(onB.find((x) => x.id === aCindy.id)?.version).toBe(2)
    expect(onB.find((x) => x.id === bIvy.id)?.version).toBe(1)
    // undo
    await inTx((tx) => moveTask(tx, S(w.lead), { taskId: b.id, ...r.previous, transfer: reverse(r.transfer!) }))
    expect((await activeAssignmentsOf(a.id)).map((x) => x.userId)).toEqual([cindy.id])
    expect((await activeAssignmentsOf(b.id)).map((x) => x.userId)).toEqual([ivy.id])
    expect(await row(b.id)).toMatchObject({ parentId: null, depth: 0 })
  })

  it('BR-31 conflicts: same user on both → CONFLICT sameAssignee (nothing changed); X with a child → nestUnderAssignedNeedsLeaf', async () => {
    const w = await plainWorld()
    const ivy = await makeUser({ nickname: 'Ivy' })
    const a = await makeTask({ project: w.P, name: 'A', createdBy: w.manager })
    const b = await makeTask({ project: w.P, name: 'B', createdBy: w.manager })
    await makeAssignment({ task: a, user: ivy })
    await makeAssignment({ task: b, user: ivy })
    await expect(inTx((tx) => indentTask(tx, S(w.lead), { taskId: b.id }))).rejects.toMatchObject({
      code: 'CONFLICT',
      message: th.tasks.errors.sameAssignee('Ivy'),
    })
    expect((await row(b.id)).parentId).toBeNull()
    const x = await makeTask({ project: w.P, name: 'X', createdBy: w.manager })
    await makeTask({ project: w.P, parent: x, name: 'X1', createdBy: w.manager })
    await expect(
      inTx((tx) => moveTask(tx, S(w.lead), { taskId: x.id, parentId: a.id, afterId: null })),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: th.tasks.errors.nestUnderAssignedNeedsLeaf })
  })

  it('outdent: C (under B under A) → under A right after B, depth 1; root → no-op', async () => {
    const w = await plainWorld()
    const a = await makeTask({ project: w.P, name: 'A', createdBy: w.manager })
    const b = await makeTask({ project: w.P, parent: a, name: 'B', createdBy: w.manager })
    const b2 = await makeTask({ project: w.P, parent: a, name: 'B2', createdBy: w.manager })
    const c = await makeTask({ project: w.P, parent: b, name: 'C', createdBy: w.manager })
    void b2
    const r = await inTx((tx) => outdentTask(tx, S(w.lead), { taskId: c.id }))
    expect(r).toMatchObject({ changed: true, previous: { parentId: b.id, afterId: null } })
    expect(await row(c.id)).toMatchObject({ parentId: a.id, depth: 1 })
    expect(await childNames(w.P.id, a.id)).toEqual(['B', 'C', 'B2'])
    expect(await activeAssignmentsOf(b.id)).toEqual([])
    expect(await inTx((tx) => outdentTask(tx, S(w.lead), { taskId: a.id }))).toEqual({ changed: false })
  })

  it('move: reorder, own descendant → cycle, stale afterId → CONFLICT, cross-project (manager) → VALIDATION', async () => {
    const w = await plainWorld()
    const r1 = await makeTask({ project: w.P, name: 'R1', createdBy: w.manager })
    const r2 = await makeTask({ project: w.P, name: 'R2', createdBy: w.manager })
    const r3 = await makeTask({ project: w.P, name: 'R3', createdBy: w.manager })
    const u = S(w.lead)
    await inTx((tx) => moveTask(tx, u, { taskId: r3.id, parentId: null, afterId: r1.id }))
    expect(await childNames(w.P.id, null)).toEqual(['R1', 'R3', 'R2'])
    expect(await inTx((tx) => moveTask(tx, u, { taskId: r3.id, parentId: null, afterId: r1.id }))).toEqual({
      changed: false,
    })
    const c = await makeTask({ project: w.P, parent: r1, name: 'C', createdBy: w.manager })
    await expect(
      inTx((tx) => moveTask(tx, u, { taskId: r1.id, parentId: c.id, afterId: null })),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: th.tasks.errors.cycle })
    await expect(
      inTx((tx) => moveTask(tx, u, { taskId: r2.id, parentId: null, afterId: c.id })),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: th.tasks.errors.treeChanged })
    const q = await makeTask({ project: w.Q, createdBy: w.manager })
    await expect(
      inTx((tx) => moveTask(tx, S(w.manager), { taskId: r2.id, parentId: q.id, afterId: null })),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: th.tasks.errors.crossProject })
    await expect(
      inTx((tx) => moveTask(tx, u, { taskId: r2.id, parentId: q.id, afterId: null })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('move under a depth-1 task with a 2-level subtree → VALIDATION maxDepth', async () => {
    const w = await plainWorld()
    const a = await makeTask({ project: w.P, name: 'A', createdBy: w.manager })
    const a1 = await makeTask({ project: w.P, parent: a, name: 'A1', createdBy: w.manager })
    const x = await makeTask({ project: w.P, name: 'X', createdBy: w.manager })
    await makeTask({ project: w.P, parent: x, name: 'X1', createdBy: w.manager })
    await expect(
      inTx((tx) => moveTask(tx, S(w.lead), { taskId: x.id, parentId: a1.id, afterId: null })),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: th.tasks.errors.maxDepth })
  })
})

describe('delete/restore', () => {
  async function family(w: World) {
    const parent = await makeTask({ project: w.P, name: 'Parent', createdBy: w.manager })
    const c1 = await makeTask({ project: w.P, parent, name: 'C1', createdBy: w.manager })
    const c2 = await makeTask({ project: w.P, parent, name: 'C2', createdBy: w.manager })
    const c3 = await makeTask({ project: w.P, parent, name: 'C3', createdBy: w.manager })
    return { parent, c1, c2, c3 }
  }

  it('AC-603 (M3 part): parent + 3 children → one batch, assignment untouched + hidden; restore → all back in order', async () => {
    const w = await plainWorld()
    const ivy = await makeUser({ nickname: 'Ivy' })
    const f = await family(w)
    const asg = await makeAssignment({ task: f.c2, user: ivy })
    asUser(w.member)
    const mark = await auditCount()
    const del = await deleteAction({ taskIds: [f.parent.id] })
    if (!del.ok) throw new Error('delete failed')
    expect(del.rootIds).toEqual([f.parent.id])
    expect(del.deletedIds.sort()).toEqual([f.parent.id, f.c1.id, f.c2.id, f.c3.id].sort())
    const batches = await db.execute<{ b: string }>(
      sql`select distinct deleted_batch::text as b from tasks where id in (${f.parent.id}, ${f.c1.id}, ${f.c2.id}, ${f.c3.id})`,
    )
    expect([...batches].map((b) => b.b)).toEqual([del.batch])
    const [a] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, asg.id))
    expect(a!.deletedAt).toBeNull()
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ entity: 'task', action: 'delete', summary: th.audit.taskDeleted('Parent', 3) }),
    ])
    const list = await inTx((tx) => listProjectTasks(tx, S(w.lead), w.P.id))
    expect(list.tasks).toEqual([])
    const mark2 = await auditCount()
    expect(await restoreAction({ batch: del.batch })).toMatchObject({ ok: true, transfer: null })
    expect(await auditRowsAfter(mark2)).toEqual([
      expect.objectContaining({ entity: 'task', action: 'restore', summary: th.audit.taskRestored('Parent', 3) }),
    ])
    expect(await childNames(w.P.id, f.parent.id)).toEqual(['C1', 'C2', 'C3'])
    const after = await inTx((tx) => listProjectTasks(tx, S(w.lead), w.P.id))
    expect(after.tasks.find((t) => t.id === f.c2.id)?.assignees).toEqual([{ assignmentId: asg.id, userId: ivy.id }])
  })

  it('BR-32: a child deleted earlier (b1) stays deleted when the parent batch (b2) is restored', async () => {
    const w = await plainWorld()
    const f = await family(w)
    const u = S(w.lead)
    const acc = (ids: string[]) => inTx((tx) => authz.requireTasks(tx, u, ids, 'edit'))
    const b1 = await inTx(async (tx) =>
      deleteTaskTree(tx, u, { projectId: w.P.id, tasks: (await acc([f.c1.id])).tasks, taskIds: [f.c1.id] }),
    )
    const b2 = await inTx(async (tx) =>
      deleteTaskTree(tx, u, { projectId: w.P.id, tasks: (await acc([f.parent.id])).tasks, taskIds: [f.parent.id] }),
    )
    await inTx((tx) => restoreTaskBatch(tx, u, { projectId: w.P.id, batch: b2.batch }))
    expect(await childNames(w.P.id, f.parent.id)).toEqual(['C2', 'C3'])
    // restoring b1 now works (its parent is live again)
    await inTx((tx) => restoreTaskBatch(tx, u, { projectId: w.P.id, batch: b1.batch }))
    expect(await childNames(w.P.id, f.parent.id)).toEqual(['C1', 'C2', 'C3'])
  })

  it('multi-select dedupes descendants: [parent, child2, otherRoot] → roots [parent, otherRoot], one batch', async () => {
    const w = await plainWorld()
    const f = await family(w)
    const other = await makeTask({ project: w.P, name: 'Other', createdBy: w.manager })
    asUser(w.lead)
    const mark = await auditCount()
    const del = await deleteAction({ taskIds: [f.parent.id, f.c2.id, other.id] })
    expect(del).toMatchObject({ ok: true, rootIds: [f.parent.id, other.id] })
    expect(await auditRowsAfter(mark)).toHaveLength(2)
  })

  it('refusals: expired, parentDeleted, parentAssigned, tooDeep, unknown → NOT_FOUND, archived → FORBIDDEN, W → NOT_FOUND', async () => {
    const w = await plainWorld()
    const u = S(w.lead)
    const del = async (ids: string[]) =>
      inTx(async (tx) =>
        deleteTaskTree(tx, u, {
          projectId: w.P.id,
          tasks: (await authz.requireTasks(tx, u, ids, 'edit')).tasks,
          taskIds: ids,
        }),
      )
    const f = await family(w)
    // expired
    const old = await del([f.c3.id])
    await db.execute(sql`update tasks set deleted_at = now() - interval '31 days' where deleted_batch = ${old.batch}`)
    asUser(w.lead)
    expect(await restoreAction({ batch: old.batch })).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      message: th.tasks.errors.restore.expired,
      reason: 'expired',
    })
    // parentDeleted
    const b1 = await del([f.c1.id])
    await del([f.parent.id])
    expect(await restoreAction({ batch: b1.batch })).toMatchObject({ code: 'CONFLICT', reason: 'parentDeleted' })
    // parentAssigned: delete the only child of L, assign L, restore
    const l = await makeTask({ project: w.P, name: 'L', createdBy: w.manager })
    const lc = await makeTask({ project: w.P, parent: l, name: 'Lc', createdBy: w.manager })
    const bl = await del([lc.id])
    await makeAssignment({ task: l, user: w.member })
    expect(await restoreAction({ batch: bl.batch })).toMatchObject({ code: 'CONFLICT', reason: 'parentAssigned' })
    // tooDeep: G > G1 > G2; delete G2, then move G under X > Y (G at depth 2) → G2 would be depth 4
    const x = await makeTask({ project: w.P, name: 'X', createdBy: w.manager })
    const y = await makeTask({ project: w.P, parent: x, name: 'Y', createdBy: w.manager })
    const g = await makeTask({ project: w.P, name: 'G', createdBy: w.manager })
    const g1 = await makeTask({ project: w.P, parent: g, name: 'G1', createdBy: w.manager })
    const bg = await del([g1.id])
    await inTx((tx) => moveTask(tx, u, { taskId: g.id, parentId: y.id, afterId: null }))
    expect(await restoreAction({ batch: bg.batch })).toMatchObject({ code: 'CONFLICT', reason: 'tooDeep' })
    expect(await restoreAction({ batch: randomUUID() })).toMatchObject({ code: 'NOT_FOUND' })
    asUser(w.outsider)
    expect(await restoreAction({ batch: bg.batch })).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('archived A: delete and restore → FORBIDDEN', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    expect(await deleteAction({ taskIds: [w.tasks.aTask.id] })).toMatchObject({ code: 'FORBIDDEN' })
    expect(await restoreAction({ batch: w.batches.aDeletedTask })).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('FR-645: deleting a parent soft-deletes edges touching the subtree in the batch; restore brings them back', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    const del = await deleteAction({ taskIds: [w.tasks.pParent.id] })
    if (!del.ok) throw new Error('delete failed')
    let list = await inTx((tx) => listProjectTasks(tx, S(w.lead), w.P.id))
    expect(list.tasks.find((t) => t.id === w.tasks.pLeaf.id)?.blockers).toEqual({ open: 0, total: 0 })
    expect(list.blockerEdges).toEqual([])
    expect(await restoreAction({ batch: del.batch })).toMatchObject({ ok: true })
    list = await inTx((tx) => listProjectTasks(tx, S(w.lead), w.P.id))
    expect(list.tasks.find((t) => t.id === w.tasks.pLeaf.id)?.blockers).toEqual({ open: 1, total: 1 })
    expect(list.blockerEdges).toEqual([
      { id: w.blockers.pLeafByChildA.id, taskId: w.tasks.pLeaf.id, blockerTaskId: w.tasks.pChildA.id },
    ])
  })

  it('an edge to a task deleted in an earlier batch stays deleted after restoring the later batch', async () => {
    const w = await plainWorld()
    const a = await makeTask({ project: w.P, name: 'A', createdBy: w.manager })
    const b = await makeTask({ project: w.P, name: 'B', createdBy: w.manager })
    await makeBlocker({ task: b, blocker: a, createdBy: w.manager })
    asUser(w.lead)
    const first = await deleteAction({ taskIds: [a.id] })
    const second = await deleteAction({ taskIds: [b.id] })
    if (!first.ok || !second.ok) throw new Error('delete failed')
    await restoreAction({ batch: second.batch })
    const list = await inTx((tx) => listProjectTasks(tx, S(w.lead), w.P.id))
    expect(list.tasks.find((t) => t.id === b.id)?.blockers).toEqual({ open: 0, total: 0 })
    expect(list.blockerEdges).toEqual([])
  })
})

describe('listProjectTasks', () => {
  it('shape: exact TaskDTO keys, counts, assignees, statuses in order, edges; archived readable with canEdit false', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const r = await inTx((tx) => listProjectTasks(tx, S(w.member), w.P.id))
    expect(r.project).toEqual({ id: w.P.id, name: 'World P', certainty: 'CONFIRMED', archived: false })
    expect(r.viewer).toEqual({ role: 'MEMBER', canEdit: true, canManage: false })
    expect(r.members.map((m) => m.userId).sort()).toEqual([w.lead.id, w.member.id].sort())
    // M3-only exact key check (M8 adds milestoneId / lateForMilestone, M3-D42)
    expect(Object.keys(r.tasks[0]!).sort()).toEqual(
      [
        'assignees',
        'blockers',
        'certaintyOverride',
        'completedOn',
        'depth',
        'dueDate',
        'id',
        'hasBody',
        'lateForMilestone',
        'milestoneId',
        'name',
        'parentId',
        'position',
        'projectId',
        'startDate',
        'statusId',
      ].sort(),
    )
    expect(r.milestones).toEqual([]) // M8-D13 (no 'milestones' part in this world)
    expect(r.tasks.map((t) => t.id)).not.toContain(w.deletedTasks.pDeleted.id)
    const byId = new Map(r.tasks.map((t) => [t.id, t]))
    expect(byId.get(w.tasks.pChildA.id)?.assignees).toEqual([
      { assignmentId: w.assignments.pChildAMember.id, userId: w.member.id },
    ])
    expect(byId.get(w.tasks.pChildB.id)?.assignees).toEqual([])
    expect(byId.get(w.tasks.pLeaf.id)?.blockers).toEqual({ open: 1, total: 1 })
    expect(r.blockerEdges).toHaveLength(1)
    const P = w.statuses.P
    expect(r.statuses.map((s) => s.id)).toEqual([
      P.todo.id,
      P.doing.id,
      P.waitData.id,
      P.blocked.id,
      P.pSecret.id,
      P.done.id,
    ])
    // completing pChildA → pLeaf { open: 0, total: 1 }
    await db
      .update(tasks)
      .set({ statusId: P.done.id, completedOn: '2026-09-29' })
      .where(eq(tasks.id, w.tasks.pChildA.id))
    const r2 = await inTx((tx) => listProjectTasks(tx, S(w.member), w.P.id))
    expect(r2.tasks.find((t) => t.id === w.tasks.pLeaf.id)?.blockers).toEqual({ open: 0, total: 1 })
    const archived = await inTx((tx) => listProjectTasks(tx, S(w.member), w.A.id))
    expect(archived.viewer).toEqual({ role: 'MEMBER', canEdit: false, canManage: false })
    expect(archived.tasks.map((t) => t.id)).toContain(w.tasks.aTask.id)
    await expect(inTx((tx) => listProjectTasks(tx, S(w.outsider), w.P.id))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('repo loader returns statusCategory / completedWeek (pDone → 2026-09-28)', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const { listLiveWithBlockerCounts } = await import('../repo/tasks')
    const rows = await listLiveWithBlockerCounts(db, w.P.id)
    expect(rows.find((r) => r.id === w.tasks.pDone.id)).toMatchObject({
      statusCategory: 'DONE',
      completedOn: '2026-09-28',
      completedWeek: '2026-09-28',
    })
    expect(rows[0]!.depth).toBe(0)
  })

  it('GET /api/projects/[id]/tasks: 200 for the member, 404 for W and for a malformed id', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const { GET } = await import('../../app/api/projects/[id]/tasks/route')
    const call = (id: string) => GET(new Request(`http://x/api/projects/${id}/tasks`), { params: Promise.resolve({ id }) })
    asUser(w.member)
    const ok = await call(w.P.id)
    expect(ok.status).toBe(200)
    asUser(w.outsider)
    expect((await call(w.P.id)).status).toBe(404)
    expect((await call('nope')).status).toBe(404)
  })
})

describe('FR-409 progress', () => {
  it('done / total over all non-deleted tasks at every depth', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const { projectProgress } = await import('./projects')
    expect(await projectProgress(db, w.P.id)).toEqual({ done: 1, total: 5 })
  })
})

// ── M6 S2.9 — plans follow tasks (X13, X20, AC-603 plans clause, FR-610 / BR-31) ─────────────────────────────────
describe('plans follow tasks (M6)', () => {
  const chunk = { from: '2026-11-16', to: '2026-11-23', expand: [], zoom: 'week' as const, includeOthers: false }
  const range = { from: '2026-11-16', to: '2026-11-23' }

  it('AC-603 plans: the child’s plan is hidden while the tree is deleted and back (same row) after restore', async () => {
    const w = await plainWorld()
    const ivy = await makeUser({ nickname: 'Ivy' })
    const parent = await makeTask({ project: w.P, name: 'Parent', createdBy: w.manager })
    await makeTask({ project: w.P, parent, name: 'C1', createdBy: w.manager })
    const c2 = await makeTask({ project: w.P, parent, name: 'C2', createdBy: w.manager })
    await makeTask({ project: w.P, parent, name: 'C3', createdBy: w.manager })
    const asg = await makeAssignment({ task: c2, user: ivy })
    await makeAllocation({ assignment: asg, period: '2026-11-16', cd: 200 })
    const viewer = S(w.manager)
    asUser(w.member)
    const del = await deleteAction({ taskIds: [parent.id] })
    if (!del.ok) throw new Error('delete failed')
    const hidden = await buildChunk(db, viewer, { kind: 'project', id: w.P.id }, chunk, TODAY)
    expect(hidden.rows.some((r) => r.kind === 'assignee' && r.taskAssignmentId === asg.id)).toBe(false)
    expect(hidden.rows.some((r) => r.kind === 'task' && r.id === c2.id)).toBe(false)
    expect((await repo.allocations.loadByUserWeek(db, { userIds: [ivy.id], range })).get(ivy.id)).toBeUndefined()
    expect(await allocationRows(asg.id, '2026-11-16')).toEqual([{ granularity: 'WEEK', periodStart: '2026-11-16', cd: 200 }])

    expect(await restoreAction({ batch: del.batch })).toMatchObject({ ok: true })
    const back = await buildChunk(db, viewer, { kind: 'project', id: w.P.id }, chunk, TODAY)
    const i = back.rows.findIndex((r) => r.kind === 'task' && r.id === c2.id)
    expect(back.rows[i + 1]).toMatchObject({
      kind: 'assignee',
      taskAssignmentId: asg.id,
      cells: { 'W:2026-11-16': { cd: 200, resolution: 'WEEK' } },
    })
    expect((await repo.allocations.loadByUserWeek(db, { userIds: [ivy.id], range })).get(ivy.id)).toEqual({
      '2026-11-16': { total: 200, committed: 200 },
    })
  })

  it('FR-610 plans: UAT’s first child takes over Ivy’s assignment (version + 1) with its 4 WEEK rows; undo moves them back', async () => {
    await seedGolden(db)
    const [uat] = await db.select().from(tasks).where(eq(tasks.name, 'ทำ UAT + คู่มือหน้าร้าน'))
    const [asg] = await db.select().from(taskAssignments).where(eq(taskAssignments.taskId, uat!.id))
    const weeks = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']
    const rowsOf = async () => Promise.all(weeks.map((wk) => allocationRows(asg!.id, wk)))
    const before = await rowsOf()
    const cindy = S(await goldenUser('Cindy'))
    const r = await inTx((tx) => createTask(tx, cindy, { projectId: uat!.projectId, parentId: uat!.id, name: 'ลูก UAT' }, TODAY))
    expect(r.transfer).toEqual({ assignmentIds: [asg!.id], fromTaskId: uat!.id, toTaskId: r.task.id })
    const [moved] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, asg!.id))
    expect(moved).toMatchObject({ taskId: r.task.id, version: asg!.version + 1 })
    expect(await rowsOf()).toEqual(before)
    const g = await buildChunk(
      db,
      cindy,
      { kind: 'project', id: uat!.projectId },
      { ...chunk, from: '2026-09-14', to: '2026-10-12' },
      TODAY,
    )
    const i = g.rows.findIndex((x) => x.kind === 'task' && x.id === r.task.id)
    expect(g.rows[i + 1]).toMatchObject({ kind: 'assignee', taskAssignmentId: asg!.id })
    expect(g.rows.find((x) => x.kind === 'task' && x.id === uat!.id)).toMatchObject({
      hasChildren: true,
      totals: { 'W:2026-10-05': { total: 125, committed: 125 } },
    })
    asUser(await goldenUser('Cindy'))
    expect(await deleteAction({ taskIds: [r.task.id], transfer: reverse(r.transfer!) })).toMatchObject({ ok: true })
    const [backRow] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, asg!.id))
    expect(backRow).toMatchObject({ taskId: uat!.id, version: asg!.version + 2 })
    expect(await rowsOf()).toEqual(before)
  })
})

describe('listProjectTasks — milestones (M8-D13, BR-71, X21)', () => {
  it('live milestoneId + lateForMilestone per task; deleted milestone reads unbound; refs in date order', async () => {
    const w = await createWorld({ with: ['milestones'] })
    const r = await inTx((tx) => listProjectTasks(tx, S(w.member), w.P.id))
    const byId = new Map(r.tasks.map((t) => [t.id, t]))
    expect(byId.get(w.tasks.pLeaf.id)).toMatchObject({ milestoneId: w.milestones.pLate.id, lateForMilestone: true })
    expect(byId.get(w.tasks.pChildB.id)).toMatchObject({ milestoneId: w.milestones.p.id, lateForMilestone: false })
    expect(byId.get(w.tasks.pParent.id)).toMatchObject({ milestoneId: null, lateForMilestone: false })
    expect(r.milestones).toEqual([
      { id: w.milestones.pDone.id, name: 'Kickoff P', date: '2026-09-15', completedOn: '2026-09-16' },
      { id: w.milestones.pLate.id, name: 'ส่งมอบรอบแรก P', date: '2026-10-02', completedOn: null },
      { id: w.milestones.p.id, name: 'Milestone P-ลับ06', date: '2026-10-23', completedOn: null },
    ])
    expect(JSON.stringify(r)).not.toContain('Q-ลับ05')
  })

  it('single-task results (loadTaskDTO via updateTask) carry the live milestone and lateness', async () => {
    const w = await createWorld({ with: ['milestones'] })
    asUser(w.lead)
    const res = await updateAction({ taskId: w.tasks.pLeaf.id, patch: { name: 'pLeaf ใหม่' } })
    if (!res.ok) throw new Error(res.message)
    expect(res.task).toMatchObject({ milestoneId: w.milestones.pLate.id, lateForMilestone: true })
    const parent = await updateAction({ taskId: w.tasks.pParent.id, patch: { name: 'แม่ใหม่' } })
    if (!parent.ok) throw new Error(parent.message)
    expect(parent.task).toMatchObject({ milestoneId: null, lateForMilestone: false })
  })
})
