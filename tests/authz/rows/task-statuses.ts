// PERM-23 "จัดการชุดสถานะงานของโปรเจค (เพิ่ม/แก้/เรียง/ลบ)" (SPEC v3.1 §3.2: M/L allow · Me 403 · W 404 · archived
// 403, X79) + the status-set read (PERM-06) + team tasks GET /api/tasks (X75: every role, filtered in SQL; a
// projectId the viewer cannot see → 404; a bad query string → 400, X86). plan/m03-tasks.md §7.2.
import { GET as getProjectStatuses } from '@/app/api/projects/[id]/statuses/route'
import { GET as getTeamTasks } from '@/app/api/tasks/route'
import {
  createTaskStatus,
  deleteTaskStatus,
  reorderTaskStatus,
  restoreTaskStatusBatch,
  updateTaskStatus,
} from '@/server/actions/task-statuses'
import type { World } from '../../helpers/world'
import { callRoute } from '../_support/http'
import { defineRow, type AuthzRow } from '../types'

const TASKS = ['tasks'] as const
const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const
const TEAM = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const
/** PERM-23: M/L manage; a MEMBER sees the set but may not change it (403); the outsider never sees it (404). */
const MANAGE = { M: 'allow', L: 'allow', Me: '403', W: '404' } as const
const ARCHIVED_WRITE = { M: '403', L: '403', Me: '403', W: '404' } as const

const auditStatusP = { entity: 'task_status', projectId: (w: World) => w.P.id } as const
const auditStatusA = { entity: 'task_status', projectId: (w: World) => w.A.id } as const

export const rows: AuthzRow[] = [
  // ── reads ────────────────────────────────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'S-LIST',
    spec: 'PERM-06 §3.2 เปิดโปรเจค — GET /api/projects/{P}/statuses',
    action: 'GET /api/projects/[id]/statuses',
    mutates: false,
    with: TASKS,
    expect: TEAM,
    run: (w) => callRoute(getProjectStatuses, `/api/projects/${w.P.id}/statuses`, { id: w.P.id }),
  }),
  defineRow({
    id: 'T-TEAM',
    spec: 'X75 GET /api/tasks — every role; visibility filtered in SQL (content in masking.int.test.ts)',
    action: 'GET /api/tasks',
    mutates: false,
    with: TASKS,
    expect: ALL,
    run: () => callRoute(getTeamTasks, '/api/tasks'),
  }),
  defineRow({
    id: 'T-TEAM-P',
    spec: 'PERM-06 + X75 — GET /api/tasks?projectId={P}; an invisible project → 404',
    action: 'GET /api/tasks',
    mutates: false,
    with: TASKS,
    expect: TEAM,
    run: (w) => callRoute(getTeamTasks, `/api/tasks?projectId=${w.P.id}`),
  }),
  defineRow({
    id: 'T-TEAM-BADQ',
    spec: 'X86 — a malformed query string on GET /api/tasks is a 400 for everyone',
    action: 'GET /api/tasks',
    mutates: false,
    with: TASKS,
    expect: { M: '400', L: '400', Me: '400', W: '400' },
    run: () => callRoute(getTeamTasks, '/api/tasks?projectId=x'),
  }),

  // ── status-set management (FR-621–624, X72) ──────────────────────────────────────────────────────────────────
  defineRow({
    id: 'S-CREATE',
    spec: 'PERM-23 เพิ่มสถานะ (FR-622)',
    action: 'createTaskStatus',
    mutates: true,
    audit: auditStatusP,
    with: TASKS,
    expect: MANAGE,
    run: (w) => createTaskStatus({ projectId: w.P.id, name: 'ใหม่', category: 'WAITING', color: '#B45309' }),
  }),
  defineRow({
    id: 'S-CREATE-ARCH',
    spec: 'PERM-23 + X42 — add a status to archived A',
    action: 'createTaskStatus',
    mutates: true,
    audit: auditStatusA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => createTaskStatus({ projectId: w.A.id, name: 'ใหม่', category: 'WAITING', color: '#B45309' }),
  }),
  defineRow({
    id: 'S-UPDATE',
    spec: 'PERM-23 แก้สถานะ — colour of pSecret (FR-622)',
    action: 'updateTaskStatus',
    mutates: true,
    audit: auditStatusP,
    with: TASKS,
    expect: MANAGE,
    run: (w) => updateTaskStatus({ statusId: w.statuses.P.pSecret.id, patch: { color: '#7C3AED' } }),
  }),
  defineRow({
    id: 'S-REORDER',
    spec: 'PERM-23 เรียงสถานะ — P.blocked to the front (FR-622)',
    action: 'reorderTaskStatus',
    mutates: true,
    audit: auditStatusP,
    with: TASKS,
    expect: MANAGE,
    run: (w) => reorderTaskStatus({ statusId: w.statuses.P.blocked.id, afterId: null }),
  }),
  defineRow({
    id: 'S-DELETE',
    spec: 'PERM-23 ลบสถานะ — unused pSecret (FR-624)',
    action: 'deleteTaskStatus',
    mutates: true,
    audit: auditStatusP,
    with: TASKS,
    expect: MANAGE,
    run: (w) => deleteTaskStatus({ statusId: w.statuses.P.pSecret.id }),
  }),
  // Archived rows beyond plan §7.2 (DoD "archived rows for every new action").
  defineRow({
    id: 'S-UPDATE-ARCH',
    spec: 'PERM-23 + X42 — recolour a status of archived A',
    action: 'updateTaskStatus',
    mutates: true,
    audit: auditStatusA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => updateTaskStatus({ statusId: w.statuses.A.blocked.id, patch: { color: '#7C3AED' } }),
  }),
  defineRow({
    id: 'S-REORDER-ARCH',
    spec: 'PERM-23 + X42 — reorder a status of archived A',
    action: 'reorderTaskStatus',
    mutates: true,
    audit: auditStatusA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => reorderTaskStatus({ statusId: w.statuses.A.blocked.id, afterId: null }),
  }),
  defineRow({
    id: 'S-DELETE-ARCH',
    spec: 'PERM-23 + X42 — delete an unused status of archived A',
    action: 'deleteTaskStatus',
    mutates: true,
    audit: auditStatusA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => deleteTaskStatus({ statusId: w.statuses.A.blocked.id }),
  }),
  defineRow({
    id: 'S-RESTORE',
    spec: 'PERM-23 + X72 — restoreTaskStatusBatch of P’s deleted status (moved: pChildB back from doing)',
    action: 'restoreTaskStatusBatch',
    mutates: true,
    audit: auditStatusP,
    with: TASKS,
    expect: MANAGE,
    run: (w) => {
      const { batch, moveToStatusId, moved } = w.batches.pDeletedStatus
      return restoreTaskStatusBatch({ batch, moveToStatusId, moved })
    },
  }),
  defineRow({
    id: 'S-RESTORE-ARCH',
    spec: 'PERM-23 + X42 — restoreTaskStatusBatch in archived A',
    action: 'restoreTaskStatusBatch',
    mutates: true,
    audit: auditStatusA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => {
      const { batch, moveToStatusId, moved } = w.batches.aDeletedStatus
      return restoreTaskStatusBatch({ batch, moveToStatusId, moved })
    },
  }),
]
