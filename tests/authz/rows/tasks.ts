// PERM-06 (task reads), PERM-11 (สร้าง/แก้/ลบ/ติ๊กเสร็จ task, เปลี่ยนสถานะ) and the own-data rows T-MY / T-SIDEBAR —
// SPEC §3.2, §7.8; plan/m03-tasks.md §7.2 (written from SPEC before S2's bodies exist, PLAN §4.1).
// Row ids are the plan's keys (T-CREATE …) so traceability's "rows/tasks.ts › T-CREATE" names the matrix test; the
// PERM line is in `spec` (ids must be unique, M2 used PERM-08a style suffixes for the same reason).
// Not visible → 404, visible but not allowed → 403 (X41); every write on archived A → 403 for M/L/Me (X42).
// Cross-project inputs (BR-33, M3-D23): visible to the manager → 400 VALIDATION, otherwise 404 (no existence leak).
import { expect } from 'vitest'
import { GET as getProjectTasks } from '@/app/api/projects/[id]/tasks/route'
import { GET as getSidebar } from '@/app/api/sidebar/route'
import { GET as getMyTasks } from '@/app/api/tasks/my/route'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import type { MyTasksResponse } from '@/lib/contracts/tasks'
import {
  completeTask,
  createTask,
  deleteTaskTree,
  indentTask,
  moveTask,
  outdentTask,
  restoreTaskBatch,
  revertTaskStatus,
  setTaskStatus,
  uncompleteTask,
  updateTask,
} from '@/server/actions/tasks'
import { makeTask, type TestUser } from '../../helpers/factories'
import type { World } from '../../helpers/world'
import { callRoute } from '../_support/http'
import { defineRow, type AuthzRow } from '../types'

const TASKS = ['tasks'] as const
const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const
/** PERM-06 / PERM-11: the team of P (and A) may; the outsider never sees it (404). */
const TEAM = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const
/** X42: archived A is read-only for everyone who can see it. */
const ARCHIVED_WRITE = { M: '403', L: '403', Me: '403', W: '404' } as const
/** BR-33 / M3-D23 / BR-83 cross-project input: only the manager sees both sides (→ 400); everyone else 404. */
const CROSS = { M: '400', L: '404', Me: '404', W: '404' } as const

const auditTaskP = { entity: 'task', projectId: (w: World) => w.P.id } as const
const auditTaskA = { entity: 'task', projectId: (w: World) => w.A.id } as const

/**
 * X22 / M3-D8: open assigned leaf tasks in non-archived projects. World 'tasks': lead → pLeaf, member → pChildA
 * (aTask is in archived A), outsider → qTask, manager → none.
 */
const myTaskCount = (w: World, actor: TestUser): number => (actor.id === w.manager.id ? 0 : 1)

export const rows: AuthzRow[] = [
  // ── reads ────────────────────────────────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'T-LIST',
    spec: 'PERM-06 §3.2 เปิดโปรเจค — GET /api/projects/{P}/tasks',
    action: 'GET /api/projects/[id]/tasks',
    mutates: false,
    with: TASKS,
    expect: TEAM,
    run: (w) => callRoute(getProjectTasks, `/api/projects/${w.P.id}/tasks`, { id: w.P.id }),
  }),
  defineRow({
    id: 'T-LIST-ARCH',
    spec: 'PERM-06 + X42 — archived A stays readable',
    action: 'GET /api/projects/[id]/tasks',
    mutates: false,
    with: TASKS,
    expect: TEAM,
    run: (w) => callRoute(getProjectTasks, `/api/projects/${w.A.id}/tasks`, { id: w.A.id }),
  }),
  defineRow({
    id: 'T-LIST-BAD',
    spec: 'PERM-06 + X86 — a malformed project id is a 404 like an invisible project',
    action: 'GET /api/projects/[id]/tasks',
    mutates: false,
    with: TASKS,
    expect: { M: '404', L: '404', Me: '404', W: '404' },
    run: () => callRoute(getProjectTasks, '/api/projects/not-a-uuid/tasks', { id: 'not-a-uuid' }),
  }),
  defineRow({
    id: 'T-MY',
    spec: 'X22 own data — GET /api/tasks/my (every role; only the caller’s rows)',
    action: 'GET /api/tasks/my',
    mutates: false,
    with: TASKS,
    expect: ALL,
    run: async (w, _ctx, actor) => {
      const res = await callRoute(getMyTasks, '/api/tasks/my')
      if (res.status === 200) {
        const body = (await res.clone().json()) as MyTasksResponse
        expect(body.count, 'X22 my open assigned leaf tasks').toBe(myTaskCount(w, actor))
      }
      return res
    },
  }),
  defineRow({
    id: 'T-SIDEBAR',
    spec: 'X22 / X33 — GET /api/sidebar carries myTaskCount (every role)',
    action: 'GET /api/sidebar',
    mutates: false,
    with: TASKS,
    expect: ALL,
    run: async (w, _ctx, actor) => {
      const res = await callRoute(getSidebar, '/api/sidebar')
      if (res.status === 200) {
        const body = (await res.clone().json()) as SidebarResponse
        expect(body.myTaskCount, 'sidebar count = number of tasks on /my (X22)').toBe(myTaskCount(w, actor))
      }
      return res
    },
  }),

  // ── create / update (FR-601, FR-602) ─────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'T-CREATE',
    spec: 'PERM-11 §3.2 สร้าง task (FR-602)',
    action: 'createTask',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => createTask({ projectId: w.P.id, name: 'งานใหม่' }),
  }),
  defineRow({
    id: 'T-CREATE-SUB',
    spec: 'PERM-11 §3.2 สร้างงานย่อย under pChildB (unassigned leaf, no transfer)',
    action: 'createTask',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => createTask({ projectId: w.P.id, parentId: w.tasks.pChildB.id, name: 'งานย่อยใหม่' }),
  }),
  defineRow({
    id: 'T-CREATE-ARCH',
    spec: 'PERM-11 + X42 — create in archived A',
    action: 'createTask',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => createTask({ projectId: w.A.id, name: 'งานใหม่' }),
  }),
  defineRow({
    id: 'T-UPDATE',
    spec: 'PERM-11 §3.2 แก้ task — name (FR-601)',
    action: 'updateTask',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => updateTask({ taskId: w.tasks.pLeaf.id, patch: { name: 'ชื่อใหม่' } }),
  }),
  defineRow({
    id: 'T-UPDATE-ARCH',
    spec: 'PERM-11 + X42 — update a task of archived A',
    action: 'updateTask',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => updateTask({ taskId: w.tasks.aTask.id, patch: { name: 'ชื่อใหม่' } }),
  }),

  // ── tree (FR-603, FR-604, BR-33) ─────────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'T-INDENT',
    spec: 'PERM-11 FR-603 Tab — pLeaf → last child of pParent (pParent has children: no transfer)',
    action: 'indentTask',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => indentTask({ taskId: w.tasks.pLeaf.id }),
  }),
  defineRow({
    id: 'T-OUTDENT',
    spec: 'PERM-11 FR-603 Shift+Tab — pChildA out of pParent',
    action: 'outdentTask',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => outdentTask({ taskId: w.tasks.pChildA.id }),
  }),
  defineRow({
    id: 'T-MOVE',
    spec: 'PERM-11 FR-604 — pDone to the first root position (order changes)',
    action: 'moveTask',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => moveTask({ taskId: w.tasks.pDone.id, parentId: null, afterId: null }),
  }),
  // Archived tree rows beyond plan §7.2 (DoD "archived rows for every new action").
  defineRow({
    id: 'T-INDENT-ARCH',
    spec: 'PERM-11 + X42 — indent aTask2 under aTask in archived A',
    action: 'indentTask',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => indentTask({ taskId: w.tasks.aTask2.id }),
  }),
  defineRow({
    id: 'T-OUTDENT-ARCH',
    spec: 'PERM-11 + X42 — outdent a child task in archived A',
    action: 'outdentTask',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    setup: (w) => makeTask({ project: w.A, parent: w.tasks.aTask2, name: 'งานย่อย A', createdBy: w.manager }),
    run: (_w, child) => outdentTask({ taskId: child.id }),
  }),
  defineRow({
    id: 'T-MOVE-ARCH',
    spec: 'PERM-11 + X42 — move aTask2 to the front in archived A',
    action: 'moveTask',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => moveTask({ taskId: w.tasks.aTask2.id, parentId: null, afterId: null }),
  }),
  defineRow({
    id: 'T-MOVE-X',
    spec: 'PERM-11 + BR-33 — move pLeaf under a Q task (manager: VALIDATION, others: 404)',
    action: 'moveTask',
    mutates: false,
    with: TASKS,
    expect: CROSS,
    run: (w) => moveTask({ taskId: w.tasks.pLeaf.id, parentId: w.tasks.qTask.id, afterId: null }),
  }),

  // ── completion and status (FR-607, FR-626, BR-80–83, M3-D5, M3-D28) ──────────────────────────────────────────
  defineRow({
    id: 'T-COMPLETE',
    spec: 'PERM-11 §3.2 ติ๊กเสร็จ task (FR-607, BR-82)',
    action: 'completeTask',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => completeTask({ taskIds: [w.tasks.pLeaf.id] }),
  }),
  defineRow({
    id: 'T-COMPLETE-ARCH',
    spec: 'PERM-11 + X42 — complete a task of archived A',
    action: 'completeTask',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => completeTask({ taskIds: [w.tasks.aTask.id] }),
  }),
  defineRow({
    id: 'T-UNCOMPLETE',
    spec: 'PERM-11 §3.2 ยกเลิกติ๊กเสร็จ (FR-607, BR-82 → default status)',
    action: 'uncompleteTask',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => uncompleteTask({ taskIds: [w.tasks.pDone.id] }),
  }),
  defineRow({
    id: 'T-UNCOMPLETE-ARCH',
    spec: 'PERM-11 + X42 — uncomplete a completed task of archived A (beyond plan §7.2)',
    action: 'uncompleteTask',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    setup: (w) =>
      makeTask({
        project: w.A,
        name: 'งานเสร็จ A',
        status: w.statuses.A.done,
        completedOn: '2026-09-28',
        createdBy: w.manager,
      }),
    run: (_w, done) => uncompleteTask({ taskIds: [done.id] }),
  }),
  defineRow({
    id: 'T-BULK-X',
    spec: 'PERM-11 + M3-D23 — bulk ids from two projects (manager: VALIDATION sameProjectOnly, others: 404)',
    action: 'completeTask',
    mutates: false,
    with: TASKS,
    expect: CROSS,
    run: (w) => completeTask({ taskIds: [w.tasks.pLeaf.id, w.tasks.qTask.id] }),
  }),
  defineRow({
    id: 'T-STATUS',
    spec: 'PERM-11 v3.1 เปลี่ยนสถานะ (FR-626, X71)',
    action: 'setTaskStatus',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => setTaskStatus({ taskIds: [w.tasks.pLeaf.id], statusId: w.statuses.P.doing.id }),
  }),
  defineRow({
    id: 'T-STATUS-ARCH',
    spec: 'PERM-11 + X42 — status change in archived A',
    action: 'setTaskStatus',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => setTaskStatus({ taskIds: [w.tasks.aTask.id], statusId: w.statuses.A.doing.id }),
  }),
  defineRow({
    id: 'T-STATUS-X',
    spec: 'PERM-11 + BR-83 — a status of another project is not found for anyone',
    action: 'setTaskStatus',
    mutates: false,
    with: TASKS,
    expect: { M: '404', L: '404', Me: '404', W: '404' },
    run: (w) => setTaskStatus({ taskIds: [w.tasks.pLeaf.id], statusId: w.statuses.Q.doing.id }),
  }),
  defineRow({
    id: 'T-REVERT',
    spec: 'PERM-11 + M3-D28 — exact undo of a status change (revertTaskStatus)',
    action: 'revertTaskStatus',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) =>
      revertTaskStatus({
        items: [{ taskId: w.tasks.pDone.id, statusId: w.statuses.P.todo.id, completedOn: null }],
      }),
  }),

  defineRow({
    id: 'T-REVERT-ARCH',
    spec: 'PERM-11 + X42 — revertTaskStatus in archived A (beyond plan §7.2)',
    action: 'revertTaskStatus',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) =>
      revertTaskStatus({
        items: [{ taskId: w.tasks.aTask2.id, statusId: w.statuses.A.todo.id, completedOn: null }],
      }),
  }),

  // ── delete / restore (FR-609, BR-32, §7.5 UNDO-5) ────────────────────────────────────────────────────────────
  defineRow({
    id: 'T-DELETE',
    spec: 'PERM-11 §3.2 ลบ task — pParent with 2 children (1 root → 1 audit row, M3-D4)',
    action: 'deleteTaskTree',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => deleteTaskTree({ taskIds: [w.tasks.pParent.id] }),
  }),
  defineRow({
    id: 'T-DELETE-ARCH',
    spec: 'PERM-11 + X42 — delete a task of archived A',
    action: 'deleteTaskTree',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => deleteTaskTree({ taskIds: [w.tasks.aTask.id] }),
  }),
  defineRow({
    id: 'T-RESTORE',
    spec: 'PERM-11 + UNDO-5 — restore the batch of a soft-deleted P root (1 day old)',
    action: 'restoreTaskBatch',
    mutates: true,
    audit: auditTaskP,
    with: TASKS,
    expect: TEAM,
    run: (w) => restoreTaskBatch({ batch: w.batches.pDeletedTask }),
  }),
  defineRow({
    id: 'T-RESTORE-ARCH',
    spec: 'PERM-11 + X42 — restore a batch in archived A',
    action: 'restoreTaskBatch',
    mutates: true,
    audit: auditTaskA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => restoreTaskBatch({ batch: w.batches.aDeletedTask }),
  }),
]
