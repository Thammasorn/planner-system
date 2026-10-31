// M3 S2.14 — per-project status set (SPEC v3.1 FR-620–624, BR-81/84, PERM-23, X70, X72, M3-D26/D27/D29, AC-611/612/614).
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { createProject as createProjectAction } from '../actions/projects'
import {
  createTaskStatus as createAction,
  deleteTaskStatus as deleteAction,
  reorderTaskStatus as reorderAction,
  restoreTaskStatusBatch as restoreAction,
  updateTaskStatus as updateAction,
} from '../actions/task-statuses'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeStatus, makeTask } from '../../../tests/helpers/factories'
import { assertCompletionInvariant } from '../../../tests/helpers/invariants'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { taskStatuses, tasks } from '../db/schema'
import { listLiveStatuses } from '../repo/task-statuses'
import { ensureAllProjectStatuses, listProjectStatuses } from './taskStatuses'

const S = toSessionUser
const D = th.tasks.status.defaults
const E = th.tasks.status.errors

const names = async (projectId: string) => (await listLiveStatuses(db, projectId)).map((s) => s.name)
async function task(id: string) {
  const [r] = await db.select().from(tasks).where(eq(tasks.id, id))
  return r!
}

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})
afterEach(async () => {
  await assertCompletionInvariant()
})

describe('defaults (FR-621, X70, AC-611)', () => {
  it('createProject → 5 statuses in order with their categories; ensureAllProjectStatuses is idempotent', async () => {
    const w = await createWorld()
    asUser(w.manager)
    const r = await createProjectAction({ name: 'New P' })
    if (!r.ok) throw new Error('create failed')
    const rows = await listLiveStatuses(db, r.projectId)
    expect(rows.map((s) => [s.name, s.category])).toEqual([
      [D.todo, 'TODO'],
      [D.doing, 'IN_PROGRESS'],
      [D.waitData, 'WAITING'],
      [D.blocked, 'WAITING'],
      [D.done, 'DONE'],
    ])
    // world projects P/Q/A have no statuses yet → backfilled once
    expect(await db.transaction((tx) => ensureAllProjectStatuses(tx))).toBe(3)
    expect(await db.transaction((tx) => ensureAllProjectStatuses(tx))).toBe(0)
  })
})

describe('create / update / reorder (FR-622, PERM-23)', () => {
  it('AC-612: lead adds รอลูกค้ายืนยัน after ติดปัญหา; member → FORBIDDEN, nothing inserted; one audit row', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    const name = 'รอลูกค้ายืนยัน'
    expect(
      await createAction({ projectId: w.P.id, name, category: 'WAITING', color: '#B45309', afterId: w.statuses.P.blocked.id }),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    asUser(w.lead)
    const mark = await auditCount()
    const r = await createAction({
      projectId: w.P.id,
      name,
      category: 'WAITING',
      color: '#B45309',
      afterId: w.statuses.P.blocked.id,
    })
    expect(r).toMatchObject({ ok: true, status: { name, category: 'WAITING' } })
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ entity: 'task_status', action: 'create', summary: th.audit.statusCreated(name) }),
    ])
    expect(await names(w.P.id)).toEqual([D.todo, D.doing, D.waitData, D.blocked, name, 'สถานะลับ P-03', D.done])
  })

  it('13th status → tooMany; duplicate (trim / case) → duplicateName', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    expect(await createAction({ projectId: w.P.id, name: ' เสร็จ ', category: 'DONE', color: '#15803D' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: E.duplicateName,
    })
    for (let i = 0; i < 6; i++) await makeStatus({ project: w.P, name: `extra ${i}`, category: 'WAITING' })
    expect(await createAction({ projectId: w.P.id, name: 'one more', category: 'WAITING', color: '#B45309' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: E.tooMany,
    })
  })

  it('BR-84 + M3-D27: only TODO / only DONE cannot change category; DONE in use cannot leave DONE', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    const P = w.statuses.P
    expect(await updateAction({ statusId: P.todo.id, patch: { category: 'WAITING' } })).toMatchObject({
      code: 'VALIDATION',
      message: E.needTodo,
    })
    expect(await updateAction({ statusId: P.done.id, patch: { category: 'WAITING' } })).toMatchObject({
      code: 'VALIDATION',
      message: E.needDone,
    })
    await makeStatus({ project: w.P, name: 'ส่งมอบแล้ว', category: 'DONE' })
    expect(await updateAction({ statusId: P.done.id, patch: { category: 'WAITING' } })).toMatchObject({
      code: 'VALIDATION',
      message: E.doneCategoryInUse,
    })
    // free between non-DONE categories; rename + colour audited with the changed fields only
    const mark = await auditCount()
    expect(await updateAction({ statusId: P.waitData.id, patch: { category: 'IN_PROGRESS', name: 'รอข้อมูลลูกค้า' } })).toMatchObject({
      ok: true,
      status: { name: 'รอข้อมูลลูกค้า', category: 'IN_PROGRESS' },
    })
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'task_status',
        action: 'update',
        before: { name: D.waitData, category: 'WAITING' },
        after: { name: 'รอข้อมูลลูกค้า', category: 'IN_PROGRESS' },
      }),
    ])
    expect(await updateAction({ statusId: P.doing.id, patch: { name: 'เสร็จ' } })).toMatchObject({
      code: 'VALIDATION',
      message: E.duplicateName,
    })
  })

  it('reorder returns previousAfterId; reordering back restores the order', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    const P = w.statuses.P
    const before = await names(w.P.id)
    const r = await reorderAction({ statusId: P.done.id, afterId: null })
    expect(r).toMatchObject({ ok: true, previousAfterId: P.pSecret.id })
    expect((await names(w.P.id))[0]).toBe(D.done)
    await reorderAction({ statusId: P.done.id, afterId: P.pSecret.id })
    expect(await names(w.P.id)).toEqual(before)
  })

  it('archived A → FORBIDDEN; outsider → NOT_FOUND', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    expect(await updateAction({ statusId: w.statuses.A.todo.id, patch: { name: 'x' } })).toMatchObject({
      code: 'FORBIDDEN',
    })
    asUser(w.outsider)
    expect(await reorderAction({ statusId: w.statuses.P.todo.id, afterId: null })).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('delete / restore (FR-624, X72, M3-D29)', () => {
  it('AC-614: 3 tasks on รอข้อมูล → move to กำลังทำ; restore → back at its position with the 3 tasks; a later edit is kept', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const P = w.statuses.P
    const t = await Promise.all(
      ['T1', 'T2', 'T3'].map((name) => makeTask({ project: w.P, name, status: P.waitData, createdBy: w.manager })),
    )
    asUser(w.lead)
    expect(await deleteAction({ statusId: P.waitData.id })).toMatchObject({ code: 'VALIDATION', message: E.needDestination })
    const mark = await auditCount()
    const del = await deleteAction({ statusId: P.waitData.id, moveToStatusId: P.doing.id })
    if (!del.ok) throw new Error('delete failed')
    expect(del.moved.map((m) => m.taskId).sort()).toEqual(t.map((x) => x.id).sort())
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ entity: 'task_status', action: 'delete', summary: th.audit.statusDeleted(D.waitData, 3) }),
    ])
    const [st] = await db.select().from(taskStatuses).where(eq(taskStatuses.id, P.waitData.id))
    expect(st).toMatchObject({ deletedBatch: del.batch })
    expect(st!.deletedAt).not.toBeNull()
    // a task changed meanwhile stays where it is
    await db.update(tasks).set({ statusId: P.blocked.id }).where(eq(tasks.id, t[0]!.id))
    const r = await restoreAction({ batch: del.batch, moveToStatusId: del.moveToStatusId, moved: del.moved })
    expect(r).toMatchObject({ ok: true, restored: 2, skipped: 1, status: { id: P.waitData.id } })
    expect(await names(w.P.id)).toEqual([D.todo, D.doing, D.waitData, D.blocked, 'สถานะลับ P-03', D.done])
    expect((await task(t[0]!.id)).statusId).toBe(P.blocked.id)
    expect((await task(t[1]!.id)).statusId).toBe(P.waitData.id)
  })

  it('a used DONE status (another DONE exists) moved to ยังไม่เริ่ม clears dates; restore gives the exact dates back', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const P = w.statuses.P
    await makeStatus({ project: w.P, name: 'ส่งมอบแล้ว', category: 'DONE' })
    asUser(w.lead)
    const del = await deleteAction({ statusId: P.done.id, moveToStatusId: P.todo.id })
    if (!del.ok) throw new Error('delete failed')
    expect(del.moved).toEqual([{ taskId: w.tasks.pDone.id, fromStatusId: P.done.id, completedOn: '2026-09-28' }])
    expect(await task(w.tasks.pDone.id)).toMatchObject({ statusId: P.todo.id, completedOn: null })
    expect(await restoreAction({ batch: del.batch, moveToStatusId: del.moveToStatusId, moved: del.moved })).toMatchObject({
      ok: true,
      restored: 1,
    })
    expect(await task(w.tasks.pDone.id)).toMatchObject({ statusId: P.done.id, completedOn: '2026-09-28' })
  })

  it('deleting the only TODO → needTodo; unused status deletes without destination; soft-deleted tasks move along silently', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const P = w.statuses.P
    asUser(w.lead)
    expect(await deleteAction({ statusId: P.todo.id, moveToStatusId: P.doing.id })).toMatchObject({
      code: 'VALIDATION',
      message: E.needTodo,
    })
    // pSecret is unused; put the soft-deleted task on it
    await db.update(tasks).set({ statusId: P.pSecret.id }).where(eq(tasks.id, w.deletedTasks.pDeleted.id))
    const del = await deleteAction({ statusId: P.pSecret.id })
    expect(del).toMatchObject({ ok: true, moved: [], moveToStatusId: null })
    expect((await task(w.deletedTasks.pDeleted.id)).statusId).toBe(P.todo.id)
  })

  it('restore refusals: 31 days → CONFLICT expired; a same-named status meanwhile → CONFLICT duplicateName; unknown → NOT_FOUND', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    const b = w.batches.pDeletedStatus
    await makeStatus({ project: w.P, name: 'สถานะที่ลบแล้ว P', category: 'TODO' })
    expect(await restoreAction({ batch: b.batch, moveToStatusId: b.moveToStatusId, moved: b.moved })).toMatchObject({
      code: 'CONFLICT',
      message: E.duplicateName,
    })
    await db.execute(sql`update task_statuses set deleted_at = now() - interval '31 days' where deleted_batch = ${b.batch}`)
    expect(await restoreAction({ batch: b.batch, moveToStatusId: b.moveToStatusId, moved: b.moved })).toMatchObject({
      code: 'CONFLICT',
      message: th.tasks.errors.restore.expired,
    })
    expect(
      await restoreAction({ batch: '00000000-0000-4000-8000-000000000000', moveToStatusId: null, moved: [] }),
    ).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('archived A restore → FORBIDDEN; member → FORBIDDEN', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const b = w.batches.aDeletedStatus
    asUser(w.lead)
    expect(await restoreAction({ batch: b.batch, moveToStatusId: b.moveToStatusId, moved: b.moved })).toMatchObject({
      code: 'FORBIDDEN',
    })
    asUser(w.member)
    const p = w.batches.pDeletedStatus
    expect(await restoreAction({ batch: p.batch, moveToStatusId: p.moveToStatusId, moved: p.moved })).toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('GET /api/projects/[id]/statuses', () => {
  it('usage counts match listProjectTasks; canManage per role', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const P = w.statuses.P
    const lead = await db.transaction((tx) => listProjectStatuses(tx, S(w.lead), w.P.id))
    expect(lead.canManage).toBe(true)
    expect(lead.usage).toMatchObject({ [P.todo.id]: 3, [P.doing.id]: 1, [P.done.id]: 1, [P.pSecret.id]: 0 })
    const member = await db.transaction((tx) => listProjectStatuses(tx, S(w.member), w.P.id))
    expect(member.canManage).toBe(false)
    const archived = await db.transaction((tx) => listProjectStatuses(tx, S(w.lead), w.A.id))
    expect(archived.canManage).toBe(false)
    const { GET } = await import('../../app/api/projects/[id]/statuses/route')
    asUser(w.outsider)
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: w.P.id }) })
    expect(res.status).toBe(404)
  })
})
