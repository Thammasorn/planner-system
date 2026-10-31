// PERM-08 — SPEC §3.2 "เพิ่ม/ลบสมาชิก, เปลี่ยน LEAD/MEMBER" (M, L allow · Me 403 · W 404), archived read-only (X42),
// BR-62 last LEAD: a worker LEAD gets CONFLICT (409), a manager may with a warning (M2-D06; the matrix asserts the
// manager's audit row). PERM-XA: the people directory for any logged-in user (X09). plan/m02 §7.2.
// M3 (plan/m03 §7.2, FR-404 / BR-61, M3-D14): removing a member who still has assignments does not remove (no write,
// no audit); the combined op and its undo write one project_member row each (M3-D4).
import { and, eq } from 'drizzle-orm'
import { expect } from 'vitest'
import { GET as getPeopleOptions } from '@/app/api/people/options/route'
import {
  addMember,
  changeMemberRole,
  removeMember,
  removeMemberWithAssignments,
  restoreRemovedMember,
} from '@/server/actions/members'
import { db } from '@/server/db/client'
import { projectMembers } from '@/server/db/schema'
import { auditCount, auditRowsAfter } from '../../helpers/audit'
import { callRoute } from '../_support/http'
import { defineRow, type AuthzRow } from '../types'

const TASKS = ['tasks'] as const

async function roleIn(projectId: string, userId: string): Promise<string | undefined> {
  const [m] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  return m?.role
}

const MANAGE = { M: 'allow', L: 'allow', Me: '403', W: '404' } as const
const ARCHIVED_WRITE = { M: '403', L: '403', Me: '403', W: '404' } as const
/** BR-62: removing / demoting the only LEAD of P. */
const LAST_LEAD = { M: 'allow', L: '409', Me: '403', W: '404' } as const

export const rows: AuthzRow[] = [
  defineRow({
    id: 'PERM-08a',
    spec: '§3.2 เพิ่มสมาชิก (FR-403)',
    action: 'addMember',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.P.id },
    expect: MANAGE,
    run: (w) => addMember({ projectId: w.P.id, userId: w.outsider.id }),
  }),
  defineRow({
    id: 'PERM-08b',
    spec: '§3.2 เปลี่ยน MEMBER → LEAD (FR-403)',
    action: 'changeMemberRole',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.P.id },
    expect: MANAGE,
    run: (w) => changeMemberRole({ projectId: w.P.id, userId: w.member.id, role: 'LEAD' }),
  }),
  defineRow({
    id: 'PERM-08c',
    spec: '§3.2 ลบสมาชิก (FR-403, FR-404 part; a MEMBER cannot leave by themselves, M2-D19)',
    action: 'removeMember',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.P.id },
    expect: MANAGE,
    run: (w) => removeMember({ projectId: w.P.id, userId: w.member.id }),
  }),
  defineRow({
    id: 'PERM-08d',
    spec: '§3.2 เพิ่มสมาชิก — archived A is read-only (X42)',
    action: 'addMember',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.A.id },
    expect: ARCHIVED_WRITE,
    run: (w) => addMember({ projectId: w.A.id, userId: w.outsider.id }),
  }),
  defineRow({
    id: 'PERM-08e',
    spec: 'BR-62 ลบ LEAD คนสุดท้าย — worker LEAD 409, manager allowed with warning (M2-D06)',
    action: 'removeMember',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.P.id },
    expect: LAST_LEAD,
    run: (w) => removeMember({ projectId: w.P.id, userId: w.lead.id }),
  }),
  defineRow({
    id: 'PERM-08f',
    spec: 'BR-62 ลด LEAD คนสุดท้ายเป็น MEMBER — worker LEAD 409, manager allowed with warning (M2-D06)',
    action: 'changeMemberRole',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.P.id },
    expect: LAST_LEAD,
    run: (w) => changeMemberRole({ projectId: w.P.id, userId: w.lead.id, role: 'MEMBER' }),
  }),
  defineRow({
    id: 'PERM-08g',
    spec: '§3.2 เปลี่ยน LEAD/MEMBER — archived A is read-only (X42)',
    action: 'changeMemberRole',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.A.id },
    expect: ARCHIVED_WRITE,
    run: (w) => changeMemberRole({ projectId: w.A.id, userId: w.member.id, role: 'LEAD' }),
  }),
  defineRow({
    id: 'PERM-08h',
    spec: '§3.2 ลบสมาชิก — archived A is read-only (X42)',
    action: 'removeMember',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.A.id },
    expect: ARCHIVED_WRITE,
    run: (w) => removeMember({ projectId: w.A.id, userId: w.member.id }),
  }),
  // ── M3: FR-404 / BR-61 (world 'tasks': member has one active assignment in P, on pChildA) ────────────────────
  defineRow({
    id: 'M-REMOVE-BLOCKED',
    spec: 'PERM-08 + FR-404 / BR-61 — member with 1 assigned task: { removed: false, blockedByAssignments: 1 }, no write',
    action: 'removeMember',
    mutates: false,
    with: TASKS,
    expect: MANAGE,
    run: async (w) => {
      const before = await auditCount()
      const res = await removeMember({ projectId: w.P.id, userId: w.member.id })
      if (res.ok) {
        expect(res).toMatchObject({ removed: false, blockedByAssignments: 1 })
        expect(await roleIn(w.P.id, w.member.id), 'M3-D14: the member row stays').toBe('MEMBER')
        expect(await auditRowsAfter(before), 'nothing mutated → no audit row').toEqual([])
      }
      return res
    },
  }),
  defineRow({
    id: 'M-REMOVE-WITH-ASSIGN',
    spec: 'PERM-08 + FR-404 — removeMemberWithAssignments (one tx, one project_member audit row, M3-D4)',
    action: 'removeMemberWithAssignments',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.P.id },
    with: TASKS,
    expect: MANAGE,
    run: async (w) => {
      const res = await removeMemberWithAssignments({ projectId: w.P.id, userId: w.member.id })
      if (res.ok) {
        expect(res.unassignedTaskCount).toBe(1)
        expect(await roleIn(w.P.id, w.member.id), 'member row deleted').toBeUndefined()
      } else {
        expect(await roleIn(w.P.id, w.member.id), 'rejected → nothing changed').toBe('MEMBER')
      }
      return res
    },
  }),
  defineRow({
    id: 'M-RESTORE-REMOVED',
    spec: 'PERM-08 + FR-404 undo — restoreRemovedMember re-adds `former` and restores the batch',
    action: 'restoreRemovedMember',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.P.id },
    with: TASKS,
    expect: MANAGE,
    run: async (w) => {
      const f = w.removedMembers.pFormer
      const res = await restoreRemovedMember(f)
      if (res.ok) {
        expect(res).toMatchObject({ restoredAssignments: 1, skipped: 0 })
        expect(await roleIn(w.P.id, f.userId), 'same role as the snapshot').toBe(f.member.role)
      } else {
        expect(await roleIn(w.P.id, f.userId), 'rejected → still not a member').toBeUndefined()
      }
      return res
    },
  }),
  // Archived rows beyond plan §7.2 (DoD "archived rows for every new action"; X42 via requireProject(manage)).
  defineRow({
    id: 'M-REMOVE-WITH-ASSIGN-ARCH',
    spec: 'PERM-08 + X42 — removeMemberWithAssignments in archived A',
    action: 'removeMemberWithAssignments',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.A.id },
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => removeMemberWithAssignments({ projectId: w.A.id, userId: w.member.id }),
  }),
  defineRow({
    id: 'M-RESTORE-REMOVED-ARCH',
    spec: 'PERM-08 + X42 — restoreRemovedMember in archived A',
    action: 'restoreRemovedMember',
    mutates: true,
    audit: { entity: 'project_member', projectId: (w) => w.A.id },
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) =>
      restoreRemovedMember({
        projectId: w.A.id,
        userId: w.users.former!.id,
        batch: null,
        member: { role: 'MEMBER', addedBy: w.lead.id, addedAt: '2026-09-01T09:00:00+07:00' },
      }),
  }),
  defineRow({
    id: 'PERM-XA',
    spec: 'X09 GET /api/people/options — any logged-in user (member picker)',
    action: 'GET /api/people/options',
    mutates: false,
    expect: { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' },
    run: () => callRoute(getPeopleOptions, '/api/people/options'),
  }),
]
