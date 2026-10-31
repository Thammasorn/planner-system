// PERM-11 (v3.1) "เพิ่ม/ลบตัวขวาง" — SPEC §3.2: M/L/Me allow · W 404; archived A read-only (X42); a blocker from
// another project is VALIDATION when the viewer can see it, else 404 (D12, M3-D32 — BR-33 pattern). The blocker
// services write their own audit row (entity task_blocker, M3-D43). plan/m03-tasks.md §7.2.
import { addTaskBlocker, removeTaskBlocker } from '@/server/actions/task-blockers'
import { makeBlocker } from '../../helpers/factories'
import type { World } from '../../helpers/world'
import { defineRow, type AuthzRow } from '../types'

const TASKS = ['tasks'] as const
const TEAM = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const
const ARCHIVED_WRITE = { M: '403', L: '403', Me: '403', W: '404' } as const

const auditBlockerP = { entity: 'task_blocker', projectId: (w: World) => w.P.id } as const
const auditBlockerA = { entity: 'task_blocker', projectId: (w: World) => w.A.id } as const

export const rows: AuthzRow[] = [
  defineRow({
    id: 'B-ADD',
    spec: 'PERM-11 v3.1 เพิ่มตัวขวาง — pChildB blocked by pLeaf (no ancestry, no cycle: FR-640, BR-85)',
    action: 'addTaskBlocker',
    mutates: true,
    audit: auditBlockerP,
    with: TASKS,
    expect: TEAM,
    run: (w) => addTaskBlocker({ taskId: w.tasks.pChildB.id, blockerTaskId: w.tasks.pLeaf.id }),
  }),
  defineRow({
    id: 'B-ADD-X',
    spec: 'PERM-11 + D12 — a Q task as blocker of pLeaf (manager: VALIDATION crossProject, others: 404)',
    action: 'addTaskBlocker',
    mutates: false,
    with: TASKS,
    expect: { M: '400', L: '404', Me: '404', W: '404' },
    run: (w) => addTaskBlocker({ taskId: w.tasks.pLeaf.id, blockerTaskId: w.tasks.qTask.id }),
  }),
  defineRow({
    id: 'B-ADD-ARCH',
    spec: 'PERM-11 + X42 — add a blocker in archived A',
    action: 'addTaskBlocker',
    mutates: true,
    audit: auditBlockerA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    run: (w) => addTaskBlocker({ taskId: w.tasks.aTask.id, blockerTaskId: w.tasks.aTask2.id }),
  }),
  defineRow({
    id: 'B-REMOVE',
    spec: 'PERM-11 v3.1 ลบตัวขวาง — the live edge pLeaf ← pChildA (M3-D31: no batch)',
    action: 'removeTaskBlocker',
    mutates: true,
    audit: auditBlockerP,
    with: TASKS,
    expect: TEAM,
    run: (w) => removeTaskBlocker({ blockerId: w.blockers.pLeafByChildA.id }),
  }),
  // Beyond plan §7.2 (DoD "archived rows for every new action"): the world has no live edge in A, so setup adds one.
  defineRow({
    id: 'B-REMOVE-ARCH',
    spec: 'PERM-11 + X42 — remove a blocker in archived A',
    action: 'removeTaskBlocker',
    mutates: true,
    audit: auditBlockerA,
    with: TASKS,
    expect: ARCHIVED_WRITE,
    setup: (w) => makeBlocker({ task: w.tasks.aTask, blocker: w.tasks.aTask2, createdBy: w.manager }),
    run: (_w, edge) => removeTaskBlocker({ blockerId: edge.id }),
  }),
]
