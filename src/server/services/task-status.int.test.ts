// M3 S2.6 — the one status writer (X71, BR-80–83, BR-87, FR-607/608, M3-D5, M3-D28, M3-D38).
import { and, eq, gte, lt } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { numericToCd } from '@/domain/units'
import { th } from '@/i18n/th'
import {
  completeTask as completeAction,
  revertTaskStatus as revertAction,
  setTaskStatus as setAction,
  uncompleteTask as uncompleteAction,
} from '../actions/tasks'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeAllocation, makeAssignment, makeStatus, makeTask } from '../../../tests/helpers/factories'
import { goldenProjectId, goldenUser } from '../../../tests/authz/_support/golden'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { assertCompletionInvariant } from '../../../tests/helpers/invariants'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { allocations, taskAssignments, tasks } from '../db/schema'
import { buildChunk } from './grid'
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

// ── M6 S2.7 — BR-52 released load on every DONE path through setStatus (X19, X71, M6-D16) ─────────────────────────
describe('setStatus › BR-52 released (M6)', () => {
  async function idOf(name: string): Promise<string> {
    const [t] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.name, name))
    return t!.id
  }
  /** Allocation checksum, bounded by week_start (SPEC §6.5): BR-51 — completing never touches plans. */
  async function planChecksum(): Promise<{ n: number; cd: number }> {
    const rows = await db
      .select({ d: allocations.personDays })
      .from(allocations)
      .where(and(gte(allocations.weekStart, '2020-01-06'), lt(allocations.weekStart, '2030-01-07')))
    return { n: rows.length, cd: rows.reduce((acc, r) => acc + numericToCd(r.d), 0) }
  }

  it('complete Rollout สาขา → { 1875, 5 }; UAT → { 125, 1 }; Cindy’s POS task (ends 09-28) → null; plans untouched', async () => {
    await seedGolden(db)
    const before = await planChecksum()
    asUser(await goldenUser('Cindy'))
    const rollout = await completeAction({ taskIds: [await idOf('Rollout สาขา')] })
    expect(rollout).toMatchObject({ ok: true, released: { cd: 1875, weeks: 5 } })
    const posId = await goldenProjectId('POS Upgrade')
    const done = (await db.query.taskStatuses.findMany()).find((s) => s.projectId === posId && s.category === 'DONE')!
    const uat = await setAction({ taskIds: [await idOf('ทำ UAT + คู่มือหน้าร้าน')], statusId: done.id })
    expect(uat).toMatchObject({ ok: true, released: { cd: 125, weeks: 1 } })
    const cindy = await completeAction({ taskIds: [await idOf('ปรับปรุงระบบ POS หน้าร้าน')] })
    expect(cindy).toMatchObject({ ok: true, released: null })
    // DONE → DONE (another DONE status) → null; uncomplete → null
    const delivered = await makeStatus({ project: { id: posId }, name: 'ส่งมอบแล้ว', category: 'DONE' })
    expect(await setAction({ taskIds: [await idOf('Rollout สาขา')], statusId: delivered.id })).toMatchObject({
      ok: true,
      released: null,
    })
    expect(await uncompleteAction({ taskIds: [await idOf('Rollout สาขา')] })).toMatchObject({ ok: true, released: null })
    expect(await planChecksum()).toEqual(before)
  })

  it('withChildren: a parent whose two children have 100 and 200 after this week → { 300, 2 }', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const parent = await makeTask({ project: w.P, name: 'แม่ BR-52', createdBy: w.manager })
    const c1 = await makeTask({ project: w.P, parent, name: 'ลูก 1', createdBy: w.manager })
    const c2 = await makeTask({ project: w.P, parent, name: 'ลูก 2', createdBy: w.manager })
    await makeAllocation({ assignment: await makeAssignment({ task: c1, user: w.member }), period: '2026-10-12', cd: 100 })
    const a2 = await makeAssignment({ task: c2, user: w.lead })
    await makeAllocation({ assignment: a2, period: '2026-10-19', cd: 200 })
    await makeAllocation({ assignment: a2, period: '2026-09-28', cd: 300 }) // this week: still counted, not released
    asUser(w.lead)
    const r = await completeAction({ taskIds: [parent.id], withChildren: true })
    expect(r).toMatchObject({ ok: true, released: { cd: 300, weeks: 2 } })
  })

  it('BR-51: uncompleting restores the later weeks in the grid', async () => {
    await seedGolden(db)
    const cindy = asUser(await goldenUser('Cindy'))
    const id = await idOf('Rollout สาขา')
    await completeAction({ taskIds: [id] })
    const posId = await goldenProjectId('POS Upgrade')
    const p = { from: '2026-11-30', to: '2026-12-07', expand: [], zoom: 'week' as const, includeOthers: false }
    const totalsOf = async () =>
      (await buildChunk(db, cindy, { kind: 'project', id: posId }, p, '2026-09-30')).rows.find(
        (r) => r.kind === 'task' && r.id === id,
      )
    expect(await totalsOf()).toMatchObject({ completed: true, totals: {} })
    await uncompleteAction({ taskIds: [id] })
    expect(await totalsOf()).toMatchObject({ completed: false, totals: { 'W:2026-11-30': { total: 250, committed: 0 } } })
  })
})
