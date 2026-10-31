// PERM-13 "มอบหมายงานให้สมาชิกเดิม" (M/L/Me allow · W 404) and PERM-14 "มอบหมายงานให้คนที่ยังไม่เป็นสมาชิก
// (auto-invite)" (M/L allow · Me 403 · W 404, BR-60) — SPEC §3.2; archived A read-only (X42); undo by batch (§7.5,
// M3-D12). The BR-60 membership is recorded inside the assignment's audit row, not as a second row (M3-D4).
// plan/m03-tasks.md §7.2.
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { expect } from 'vitest'
import { assign, restoreAssignmentBatch, unassign } from '@/server/actions/assignments'
import { db } from '@/server/db/client'
import { projectMembers } from '@/server/db/schema'
import { auditCount, auditRowsAfter } from '../../helpers/audit'
import { makeAssignment } from '../../helpers/factories'
import type { World } from '../../helpers/world'
import { defineRow, type AuthzRow } from '../types'

const TASKS = ['tasks'] as const
const TEAM = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const
const ARCHIVED_WRITE = { M: '403', L: '403', Me: '403', W: '404' } as const

const auditAssignmentP = { entity: 'task_assignment', projectId: (w: World) => w.P.id } as const
const auditAssignmentA = { entity: 'task_assignment', projectId: (w: World) => w.A.id } as const

export const rows: AuthzRow[] = [
  defineRow({
    id: 'A-ASSIGN-MEMBER',
    spec: 'PERM-13 §3.2 มอบหมายงานให้สมาชิกเดิม (FR-605) — member on pChildB',
    action: 'assign',
    mutates: true,
    audit: auditAssignmentP,
    with: TASKS,
    expect: TEAM,
    run: (w) => assign({ taskIds: [w.tasks.pChildB.id], userId: w.member.id }),
  }),
  defineRow({
    id: 'A-ASSIGN-NONMEMBER',
    spec: 'PERM-14 §3.2 มอบหมายให้คนที่ยังไม่เป็นสมาชิก — BR-60 adds MEMBER in the same tx (after.addedMember)',
    action: 'assign',
    mutates: true,
    audit: auditAssignmentP,
    with: TASKS,
    expect: { M: 'allow', L: 'allow', Me: '403', W: '404' },
    run: async (w) => {
      const before = await auditCount()
      const res = await assign({ taskIds: [w.tasks.pChildB.id], userId: w.outsider.id })
      const [membership] = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, w.P.id), eq(projectMembers.userId, w.outsider.id)))
      if (res.ok) {
        expect(res.addedMember, 'BR-60 result flag').toBe(true)
        expect(membership?.role, 'BR-60: outsider is now a MEMBER of P').toBe('MEMBER')
        const added = await auditRowsAfter(before)
        const after = (added[0]?.after ?? {}) as Record<string, unknown>
        // M3-D4 names the field `after.addedMember` (S2.7 writes the boolean, M3-D4 the user id): either is truthy.
        expect([true, w.outsider.id], 'M3-D4 audit after.addedMember').toContain(after.addedMember)
      } else {
        expect(membership, 'a rejected assign adds no membership (one tx)').toBeUndefined()
      }
      return res
    },
  }),
  defineRow({
    id: 'A-ASSIGN-ARCH',
    spec: 'PERM-13 + X42 — assign on archived A',
    action: 'assign',
    mutates: true,
    audit: auditAssignmentA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => assign({ taskIds: [w.tasks.aTask.id], userId: w.lead.id }),
  }),
  defineRow({
    id: 'A-UNASSIGN',
    spec: 'PERM-13 §3.2 ยกเลิกการมอบหมาย (FR-605 ×) — member’s assignment on pChildA',
    action: 'unassign',
    mutates: true,
    audit: auditAssignmentP,
    with: TASKS,
    expect: TEAM,
    run: (w) => unassign({ assignmentIds: [w.assignments.pChildAMember.id] }),
  }),
  defineRow({
    id: 'A-UNASSIGN-ARCH',
    spec: 'PERM-13 + X42 — unassign on archived A',
    action: 'unassign',
    mutates: true,
    audit: auditAssignmentA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => unassign({ assignmentIds: [w.assignments.aTaskMember.id] }),
  }),
  defineRow({
    id: 'A-RESTORE',
    spec: 'PERM-13 + UNDO-5 — restore the soft-deleted assignment of lead on pChildB (M3-D12)',
    action: 'restoreAssignmentBatch',
    mutates: true,
    audit: auditAssignmentP,
    with: TASKS,
    expect: TEAM,
    run: (w) => restoreAssignmentBatch({ batch: w.batches.pRemovedAssignment }),
  }),
  // Beyond plan §7.2 (DoD "archived rows for every new action"): a removed assignment in A made by setup.
  defineRow({
    id: 'A-RESTORE-ARCH',
    spec: 'PERM-13 + X42 — restoreAssignmentBatch in archived A',
    action: 'restoreAssignmentBatch',
    mutates: true,
    audit: auditAssignmentA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    setup: async (w) => {
      const batch = randomUUID()
      await makeAssignment({ task: w.tasks.aTask2, user: w.lead, deleted: { batch, daysAgo: 1 } })
      return batch
    },
    run: (_w, batch) => restoreAssignmentBatch({ batch }),
  }),
]
