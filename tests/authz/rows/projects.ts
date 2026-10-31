// PERM-05 … PERM-07, PERM-09, PERM-10 — SPEC §3.2 project lines (plan/m02-clients-projects-authz.md §7.2).
// Not visible → 404; visible but not allowed → 403; manager-only global create → 403 (X41); archived projects are
// read-only: edits 403, unarchive M/L, permanent delete M (X42, M2-D02). The sidebar route is PERM-06a (content in
// visibility.int.test.ts / masking.int.test.ts).
import { GET as getSidebar } from '@/app/api/sidebar/route'
import {
  archiveProject,
  createProject,
  deleteProjectPermanently,
  unarchiveProject,
  updateProject,
} from '@/server/actions/projects'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { callRoute } from '../_support/http'
import { loaderOutcome } from '../_support/loader'
import { defineRow, type AuthzRow } from '../types'

const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const
/** Visible to the team of P (and A); 404 for the outsider. */
const TEAM_VIEW = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const
/** M and L may edit / manage P; a MEMBER sees it but may not (403); the outsider never sees it (404). */
const MANAGE = { M: 'allow', L: 'allow', Me: '403', W: '404' } as const
/** Writes on archived A (X42): read-only for everyone who can see it. */
const ARCHIVED_WRITE = { M: '403', L: '403', Me: '403', W: '404' } as const
/** Permanent delete (FR-407): manager only, archived too. */
const OWNER = { M: 'allow', L: '403', Me: '403', W: '404' } as const

export const rows: AuthzRow[] = [
  defineRow({
    id: 'PERM-05',
    spec: '§3.2 สร้างโปรเจค (FR-401)',
    action: 'createProject',
    mutates: true,
    audit: { entity: 'project', projectId: 'any' }, // the new project's id
    expect: { M: 'allow', L: '403', Me: '403', W: '403' },
    run: () => createProject({ name: 'New P' }),
  }),
  defineRow({
    id: 'PERM-06a',
    spec: '§3.2 เห็นโปรเจคในลิสต์ — sidebar (every role; content filtered)',
    action: 'GET /api/sidebar',
    mutates: false,
    expect: ALL,
    run: () => callRoute(getSidebar, '/api/sidebar'),
  }),
  defineRow({
    id: 'PERM-06b',
    spec: '§3.2 เปิดโปรเจค — P overview',
    action: 'services.projects.getProjectOverview',
    mutates: false,
    expect: TEAM_VIEW,
    run: (w) => loaderOutcome((user) => services.projects.getProjectOverview(db, user, w.P.id)),
  }),
  defineRow({
    id: 'PERM-06c',
    spec: '§3.2 เปิดโปรเจค — archived A is viewable (X42)',
    action: 'services.projects.getProjectOverview',
    mutates: false,
    expect: TEAM_VIEW,
    run: (w) => loaderOutcome((user) => services.projects.getProjectOverview(db, user, w.A.id)),
  }),
  defineRow({
    id: 'PERM-06d',
    spec: '§3.2 เห็นโปรเจคในลิสต์ — /projects (every role; content filtered)',
    action: 'services.projects.listProjectsForViewer',
    mutates: false,
    expect: ALL,
    run: () => loaderOutcome((user) => services.projects.listProjectsForViewer(db, user, { archived: false })),
  }),
  defineRow({
    id: 'PERM-06e',
    spec: '§3.2 เปิดโปรเจค — Q (outsider only) → 404 for P’s team',
    action: 'services.projects.getProjectOverview',
    mutates: false,
    expect: { M: 'allow', L: '404', Me: '404', W: 'allow' },
    run: (w) => loaderOutcome((user) => services.projects.getProjectOverview(db, user, w.Q.id)),
  }),
  defineRow({
    id: 'PERM-06f',
    spec: '§3.2 เปิดโปรเจค — header loader of the project layout (P)',
    action: 'services.projects.getProjectHeader',
    mutates: false,
    expect: TEAM_VIEW,
    run: (w) => loaderOutcome((user) => services.projects.getProjectHeader(db, user, w.P.id)),
  }),
  defineRow({
    id: 'PERM-07a',
    spec: '§3.2 แก้ข้อมูลโปรเจค — ชื่อ',
    action: 'updateProject',
    mutates: true,
    audit: { entity: 'project', projectId: (w) => w.P.id },
    expect: MANAGE,
    run: (w) => updateProject({ projectId: w.P.id, name: 'P2' }),
  }),
  defineRow({
    id: 'PERM-07b',
    spec: '§3.2 แก้ข้อมูลโปรเจค — ความแน่นอน (FR-405, M2-D03)',
    action: 'updateProject',
    mutates: true,
    audit: { entity: 'project', projectId: (w) => w.P.id },
    expect: MANAGE,
    run: (w) => updateProject({ projectId: w.P.id, certainty: 'TENTATIVE' }),
  }),
  defineRow({
    id: 'PERM-07c',
    spec: '§3.2 แก้ข้อมูลโปรเจค — archived A is read-only (X42)',
    action: 'updateProject',
    mutates: true,
    audit: { entity: 'project', projectId: (w) => w.A.id },
    expect: ARCHIVED_WRITE,
    run: (w) => updateProject({ projectId: w.A.id, name: 'A2' }),
  }),
  defineRow({
    id: 'PERM-07d',
    spec: '§3.2 แก้ความแน่นอน — archived A is read-only (X42)',
    action: 'updateProject',
    mutates: true,
    audit: { entity: 'project', projectId: (w) => w.A.id },
    expect: ARCHIVED_WRITE,
    run: (w) => updateProject({ projectId: w.A.id, certainty: 'TENTATIVE' }),
  }),
  defineRow({
    id: 'PERM-09a',
    spec: '§3.2 Archive โปรเจค (FR-406)',
    action: 'archiveProject',
    mutates: true,
    audit: { entity: 'project', projectId: (w) => w.P.id },
    expect: MANAGE,
    run: (w) => archiveProject({ projectId: w.P.id }),
  }),
  defineRow({
    id: 'PERM-09b',
    spec: '§3.2 Archive โปรเจค — เลิก archive A (FR-406, M2-D02 allowArchived)',
    action: 'unarchiveProject',
    mutates: true,
    audit: { entity: 'project', projectId: (w) => w.A.id },
    expect: MANAGE,
    run: (w) => unarchiveProject({ projectId: w.A.id }),
  }),
  defineRow({
    id: 'PERM-09c',
    spec: 'M2-D20 archive an already archived project → 403 (read-only)',
    action: 'archiveProject',
    mutates: true,
    audit: { entity: 'project', projectId: (w) => w.A.id },
    expect: ARCHIVED_WRITE,
    run: (w) => archiveProject({ projectId: w.A.id }),
  }),
  defineRow({
    id: 'PERM-10a',
    spec: '§3.2 ลบโปรเจคถาวร (FR-407) — the audit row outlives the project',
    action: 'deleteProjectPermanently',
    mutates: true,
    audit: { entity: 'project', projectId: (w) => w.P.id },
    expect: OWNER,
    run: (w) => deleteProjectPermanently({ projectId: w.P.id, confirmName: 'World P' }),
  }),
  defineRow({
    id: 'PERM-10b',
    spec: '§3.2 ลบโปรเจคถาวร — archived A (owner is exempt from read-only, M2-D02)',
    action: 'deleteProjectPermanently',
    mutates: true,
    audit: { entity: 'project', projectId: (w) => w.A.id },
    expect: OWNER,
    run: (w) => deleteProjectPermanently({ projectId: w.A.id, confirmName: 'World A' }),
  }),
]
