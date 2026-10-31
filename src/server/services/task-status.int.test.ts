// M3 S2.6 — the one status writer (X71, BR-80–83, BR-87, FR-607/608, M3-D5, M3-D28, M3-D38).
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import {
  completeTask as completeAction,
  revertTaskStatus as revertAction,
  setTaskStatus as setAction,
  uncompleteTask as uncompleteAction,
} from '../actions/tasks'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeStatus, makeTask } from '../../../tests/helpers/factories'
import { assertCompletionInvariant } from '../../../tests/helpers/invariants'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { taskAssignments, tasks } from '../db/schema'
import { setStatus } from './taskStatus'

const S = toSessionUser

async function row(id: string) {
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

describe('setStatus (BR-80)', () => {
  it('TODO → กำลังทำ keeps completed_on null; → เสร็จ sets today + week + by; DONE → DONE keeps the date; → รอข้อมูล clears', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const P = w.statuses.P
    const id = w.tasks.pLeaf.id
    const u = S(w.lead)
    const set = (statusId: string, today = '2026-09-30') =>
      db.transaction((tx) => setStatus(tx, u, { projectId: w.P.id, taskIds: [id], statusId, withChildren: false }, today))
    await set(P.doing.id)
    expect(await row(id)).toMatchObject({ statusId: P.doing.id, completedOn: null, completedBy: null })
    const r = await set(P.done.id)
    expect(r.changed).toEqual([{ taskId: id, previous: { statusId: P.doing.id, completedOn: null } }])
    expect(await row(id)).toMatchObject({ completedOn: '2026-09-30', completedWeek: '2026-09-28', completedBy: w.lead.id })
    const delivered = await makeStatus({ project: w.P, name: 'ส่งมอบแล้ว', category: 'DONE' })
    await set(delivered.id, '2026-10-02')
    expect(await row(id)).toMatchObject({ statusId: delivered.id, completedOn: '2026-09-30' })
    await set(P.waitData.id)
    expect(await row(id)).toMatchObject({ completedOn: null, completedBy: null })
  })

  it('a status of Q or a soft-deleted P status → NOT_FOUND', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    expect(await setAction({ taskIds: [w.tasks.pLeaf.id], statusId: w.statuses.Q.todo.id })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    expect(
      await setAction({ taskIds: [w.tasks.pLeaf.id], statusId: w.batches.pDeletedStatus.statusId }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('FR-608: parent → DONE lists its open children, children unchanged; withChildren completes them; non-DONE + withChildren leaves them', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const P = w.statuses.P
    asUser(w.member)
    const r = await setAction({ taskIds: [w.tasks.pParent.id], statusId: P.done.id })
    expect(r).toMatchObject({ ok: true, statusId: P.done.id })
    if (!r.ok) throw new Error('failed')
    expect(r.openDescendantIds.sort()).toEqual([w.tasks.pChildA.id, w.tasks.pChildB.id].sort())
    expect((await row(w.tasks.pChildA.id)).completedOn).toBeNull()
    // back to TODO, then non-DONE target with withChildren
    await setAction({ taskIds: [w.tasks.pParent.id], statusId: P.todo.id })
    await setAction({ taskIds: [w.tasks.pParent.id], statusId: P.waitData.id, withChildren: true })
    expect((await row(w.tasks.pChildA.id)).statusId).toBe(P.todo.id)
    expect((await row(w.tasks.pChildB.id)).statusId).toBe(P.doing.id)
    const all = await setAction({ taskIds: [w.tasks.pParent.id], statusId: P.done.id, withChildren: true })
    if (!all.ok) throw new Error('failed')
    expect(all.changed.map((c) => c.taskId).sort()).toEqual(
      [w.tasks.pParent.id, w.tasks.pChildA.id, w.tasks.pChildB.id].sort(),
    )
    expect(all.openDescendantIds).toEqual([])
    expect((await row(w.tasks.pChildB.id)).completedOn).toBe('2026-09-30')
  })

  it('completeTask skips completed ids; uncompleteTask → default status; one audit row per changed task; BR-87', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    const mark = await auditCount()
    const r = await completeAction({ taskIds: [w.tasks.pLeaf.id, w.tasks.pDone.id] })
    if (!r.ok) throw new Error('failed')
    expect(r.changed.map((c) => c.taskId)).toEqual([w.tasks.pLeaf.id])
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'task',
        action: 'update',
        entityId: w.tasks.pLeaf.id,
        projectId: w.P.id,
        summary: th.audit.taskStatusChanged('งานเดี่ยว P-ลับ07', 'เสร็จ'),
      }),
    ])
    const [asg] = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.id, w.assignments.pLeafLead.id))
    expect(asg).toMatchObject({ taskId: w.tasks.pLeaf.id, version: 1, deletedAt: null })
    const u = await uncompleteAction({ taskIds: [w.tasks.pLeaf.id, w.tasks.pChildA.id] })
    if (!u.ok) throw new Error('failed')
    expect(u.changed.map((c) => c.taskId)).toEqual([w.tasks.pLeaf.id])
    expect(await row(w.tasks.pLeaf.id)).toMatchObject({ statusId: w.statuses.P.todo.id, completedOn: null })
  })

  it('revertTaskStatus restores status and the exact date; future date or date on non-DONE → VALIDATION', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    const r = await setAction({ taskIds: [w.tasks.pDone.id], statusId: w.statuses.P.doing.id })
    if (!r.ok) throw new Error('failed')
    expect(await row(w.tasks.pDone.id)).toMatchObject({ completedOn: null })
    const back = await revertAction({
      items: r.changed.map((c) => ({ taskId: c.taskId, statusId: c.previous.statusId, completedOn: c.previous.completedOn })),
    })
    expect(back).toMatchObject({ ok: true, statusId: null })
    expect(await row(w.tasks.pDone.id)).toMatchObject({ statusId: w.statuses.P.done.id, completedOn: '2026-09-28' })
    expect(
      await revertAction({ items: [{ taskId: w.tasks.pLeaf.id, statusId: w.statuses.P.done.id, completedOn: '2026-10-01' }] }),
    ).toMatchObject({ ok: false, code: 'VALIDATION', message: th.tasks.errors.completedInFuture })
    expect(
      await revertAction({ items: [{ taskId: w.tasks.pLeaf.id, statusId: w.statuses.P.todo.id, completedOn: '2026-09-01' }] }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it('archived A → FORBIDDEN; W → NOT_FOUND', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    expect(await completeAction({ taskIds: [w.tasks.aTask.id] })).toMatchObject({ code: 'FORBIDDEN' })
    asUser(w.outsider)
    expect(await setAction({ taskIds: [w.tasks.pLeaf.id], statusId: w.statuses.P.doing.id })).toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('a task outside the factory default chain: TODO in a fresh status set', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const t = await makeTask({ project: w.P, name: 'Fresh', createdBy: w.manager })
    expect((await row(t.id)).statusId).toBe(w.statuses.P.todo.id)
  })
})
