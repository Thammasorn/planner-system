// PERM-08 — SPEC §3.2 "เพิ่ม/ลบสมาชิก, เปลี่ยน LEAD/MEMBER" (M, L allow · Me 403 · W 404), archived read-only (X42),
// BR-62 last LEAD: a worker LEAD gets CONFLICT (409), a manager may with a warning (M2-D06; the matrix asserts the
// manager's audit row). PERM-XA: the people directory for any logged-in user (X09). plan/m02 §7.2.
import { GET as getPeopleOptions } from '@/app/api/people/options/route'
import { addMember, changeMemberRole, removeMember } from '@/server/actions/members'
import { callRoute } from '../_support/http'
import { defineRow, type AuthzRow } from '../types'

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
  defineRow({
    id: 'PERM-XA',
    spec: 'X09 GET /api/people/options — any logged-in user (member picker)',
    action: 'GET /api/people/options',
    mutates: false,
    expect: { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' },
    run: () => callRoute(getPeopleOptions, '/api/people/options'),
  }),
]
