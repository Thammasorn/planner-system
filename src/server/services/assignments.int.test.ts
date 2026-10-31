// M3 S2.7 — assign / unassign / restoreAssignmentBatch (FR-605, BR-31, BR-60, AC-203, PERM-13/14, M3-D12/D13).
import { and, eq, isNull, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { assign, restoreAssignmentBatch, unassign } from '../actions/assignments'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeAssignment, makeTask, makeUser } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { projectMembers, taskAssignments } from '../db/schema'
import { listProjectTasks } from './tasks'

const S = toSessionUser

async function memberRow(projectId: string, userId: string) {
  const [r] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  return r ?? null
}
const active = (taskId: string) =>
  db
    .select()
    .from(taskAssignments)
    .where(and(eq(taskAssignments.taskId, taskId), isNull(taskAssignments.deletedAt)))

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

describe('assign', () => {
  it('lead assigns member → 1 row version 1, 1 audit row', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    const mark = await auditCount()
    const r = await assign({ taskIds: [w.tasks.pChildB.id], userId: w.member.id })
    expect(r).toMatchObject({ ok: true, addedMember: false, skippedParentIds: [], alreadyAssignedIds: [] })
    const rows = await active(w.tasks.pChildB.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: w.member.id, version: 1 })
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({
        entity: 'task_assignment',
        action: 'create',
        projectId: w.P.id,
        summary: th.audit.assignmentCreated('งานย่อย P-ลับ06', 'Member'),
      }),
    ])
  })

  it('BR-60: lead assigns outsider → MEMBER row added_by lead, audit after.addedMember, still 1 audit row', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    const mark = await auditCount()
    expect(await assign({ taskIds: [w.tasks.pChildB.id], userId: w.outsider.id })).toMatchObject({
      ok: true,
      addedMember: true,
    })
    expect(await memberRow(w.P.id, w.outsider.id)).toMatchObject({ role: 'MEMBER', addedBy: w.lead.id })
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.after).toMatchObject({ addedMember: w.outsider.id })
  })

  it('member assigns outsider → FORBIDDEN, no member row, no assignment (rollback)', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    expect(await assign({ taskIds: [w.tasks.pChildB.id], userId: w.outsider.id })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(await memberRow(w.P.id, w.outsider.id)).toBeNull()
    expect(await active(w.tasks.pChildB.id)).toEqual([])
  })

  it('AC-203: deactivated user → VALIDATION userInactive; parent task → CONFLICT parentNotAssignable', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const gone = await makeUser({ nickname: 'Gone', deactivated: { on: '2026-09-01' } })
    asUser(w.lead)
    expect(await assign({ taskIds: [w.tasks.pChildB.id], userId: gone.id })).toMatchObject({
      code: 'VALIDATION',
      message: th.tasks.errors.userInactive,
    })
    expect(await assign({ taskIds: [w.tasks.pParent.id], userId: w.member.id })).toMatchObject({
      code: 'CONFLICT',
      message: th.tasks.errors.parentNotAssignable,
    })
  })

  it('bulk [parent, leaf, already] → created 1, skippedParentIds [parent], alreadyAssignedIds [already]', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    const r = await assign({
      taskIds: [w.tasks.pParent.id, w.tasks.pChildB.id, w.tasks.pChildA.id],
      userId: w.member.id,
    })
    if (!r.ok) throw new Error('failed')
    expect(r.created.map((c) => c.taskId)).toEqual([w.tasks.pChildB.id])
    expect(r.skippedParentIds).toEqual([w.tasks.pParent.id])
    expect(r.alreadyAssignedIds).toEqual([w.tasks.pChildA.id])
  })

  it('the conflict target keeps the partial index predicate (no 23505 on a soft-deleted pair)', async () => {
    const w = await createWorld({ with: ['tasks'] })
    // lead has a soft-deleted assignment on pChildB (w.batches.pRemovedAssignment) → re-assigning creates a new row
    asUser(w.lead)
    expect(await assign({ taskIds: [w.tasks.pChildB.id], userId: w.lead.id })).toMatchObject({ ok: true })
    expect((await active(w.tasks.pChildB.id)).map((a) => a.userId)).toEqual([w.lead.id])
  })

  it('archived A → FORBIDDEN', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    expect(await assign({ taskIds: [w.tasks.aTask.id], userId: w.lead.id })).toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('unassign / restoreAssignmentBatch', () => {
  it('unassign → batch set, listing hides it; restore → back; one audit row each', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    const mark = await auditCount()
    const r = await unassign({ assignmentIds: [w.assignments.pChildAMember.id] })
    if (!r.ok) throw new Error('failed')
    expect(r.taskIds).toEqual([w.tasks.pChildA.id])
    const [row] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, w.assignments.pChildAMember.id))
    expect(row).toMatchObject({ deletedBatch: r.batch })
    let list = await db.transaction((tx) => listProjectTasks(tx, S(w.member), w.P.id))
    expect(list.tasks.find((t) => t.id === w.tasks.pChildA.id)?.assignees).toEqual([])
    expect(await auditRowsAfter(mark)).toEqual([
      expect.objectContaining({ entity: 'task_assignment', action: 'delete', summary: th.audit.assignmentRemoved('งานย่อย P-ลับ05', 'Member') }),
    ])
    expect(await unassign({ assignmentIds: [w.assignments.pChildAMember.id] })).toMatchObject({ code: 'NOT_FOUND' })
    const mark2 = await auditCount()
    expect(await restoreAssignmentBatch({ batch: r.batch })).toMatchObject({
      ok: true,
      restored: [{ assignmentId: w.assignments.pChildAMember.id, taskId: w.tasks.pChildA.id }],
      skipped: 0,
    })
    expect(await auditRowsAfter(mark2)).toHaveLength(1)
    list = await db.transaction((tx) => listProjectTasks(tx, S(w.member), w.P.id))
    expect(list.tasks.find((t) => t.id === w.tasks.pChildA.id)?.assignees).toHaveLength(1)
  })

  it('re-add then restore the old batch → skipped 1, no error (r5 #10)', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.lead)
    const r = await unassign({ assignmentIds: [w.assignments.pLeafLead.id] })
    if (!r.ok) throw new Error('failed')
    await assign({ taskIds: [w.tasks.pLeaf.id], userId: w.lead.id })
    expect(await restoreAssignmentBatch({ batch: r.batch })).toMatchObject({ ok: true, restored: [], skipped: 1 })
  })

  it('31-day-old batch → CONFLICT expired; unknown batch → NOT_FOUND; outsider → NOT_FOUND', async () => {
    const w = await createWorld({ with: ['tasks'] })
    await db.execute(
      sql`update task_assignments set deleted_at = now() - interval '31 days' where deleted_batch = ${w.batches.pRemovedAssignment}`,
    )
    asUser(w.lead)
    expect(await restoreAssignmentBatch({ batch: w.batches.pRemovedAssignment })).toMatchObject({
      code: 'CONFLICT',
      message: th.tasks.errors.restore.expired,
    })
    expect(await restoreAssignmentBatch({ batch: '00000000-0000-4000-8000-000000000000' })).toMatchObject({
      code: 'NOT_FOUND',
    })
    asUser(w.outsider)
    expect(await restoreAssignmentBatch({ batch: w.batches.pRemovedAssignment })).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('restore for a user who is no longer a member: member → FORBIDDEN, lead → re-adds MEMBER', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const batch = w.removedMembers.pFormer.batch
    asUser(w.member)
    expect(await restoreAssignmentBatch({ batch })).toMatchObject({ code: 'FORBIDDEN' })
    asUser(w.lead)
    expect(await restoreAssignmentBatch({ batch })).toMatchObject({ ok: true, skipped: 0 })
    expect(await memberRow(w.P.id, w.users.former!.id)).toMatchObject({ role: 'MEMBER', addedBy: w.lead.id })
  })

  it('a row whose task got children meanwhile is skipped', async () => {
    const w = await createWorld({ with: ['tasks'] })
    const leaf = await makeTask({ project: w.P, name: 'Leaf', createdBy: w.manager })
    const a = await makeAssignment({ task: leaf, user: w.member })
    asUser(w.lead)
    const r = await unassign({ assignmentIds: [a.id] })
    if (!r.ok) throw new Error('failed')
    await makeTask({ project: w.P, parent: leaf, name: 'Kid', createdBy: w.manager })
    expect(await restoreAssignmentBatch({ batch: r.batch })).toMatchObject({ ok: true, restored: [], skipped: 1 })
  })

  it('archived A unassign → FORBIDDEN', async () => {
    const w = await createWorld({ with: ['tasks'] })
    asUser(w.member)
    expect(await unassign({ assignmentIds: [w.assignments.aTaskMember.id] })).toMatchObject({ code: 'FORBIDDEN' })
  })
})
