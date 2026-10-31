// tests/helpers/world.ts — the standard permission world (PLAN.md §4.3, X91).
// M1: four users; M2 adds clients C1/C2/C3 and projects P/Q/A (lead = LEAD of P, member = MEMBER of P, outsider =
// MEMBER of Q only; A = archived, P's team; Q has no LEAD; C3 archived without projects). Always built.
// The four role users stay top-level; extra users added by later parts live under `w.users.<name>`.
import { randomUUID } from 'node:crypto'
import type { ISODate } from '@/domain/types'
import type { RemovedMemberSnapshot } from '@/lib/contracts/tasks'
import type { ClientRow, ProjectRow } from '@/server/db/schema'
import type { TaskRow } from '@/server/repo/tasks'
import type { AssignmentRow } from '@/server/repo/task-assignments'
import type { TaskBlockerRow } from '@/server/repo/task-blockers'
import type { TaskStatusRow } from '@/server/repo/task-statuses'
import {
  makeAssignment,
  makeBlocker,
  makeClient,
  makeProject,
  makeStatus,
  makeStatuses,
  makeTask,
  makeUser,
  type DefaultKey,
  type TestUser,
} from './factories'

/** Pinned part list (X91); each milestone adds the builder for its part(s).
 *  M3 tasks · M4 pages, files · M5 timeOff · M6 allocations · M7 dayAllocations · M8 milestones */
export type WorldPart =
  'tasks' | 'pages' | 'files' | 'timeOff' | 'allocations' | 'dayAllocations' | 'milestones'

/** Fixed build order of the parts. */
export const WORLD_PART_ORDER: readonly WorldPart[] = [
  'tasks',
  'pages',
  'files',
  'timeOff',
  'allocations',
  'dayAllocations',
  'milestones',
]

/** Implications; the owning milestone adds its entry (M6 allocations → tasks + timeOff, M7 dayAllocations →
 *  allocations, M8 milestones → tasks + allocations). */
export const WORLD_PART_IMPLIES: Partial<Record<WorldPart, readonly WorldPart[]>> = {}

/** A status-delete batch as `restoreTaskStatusBatch` takes it (X72, M3-D29) + the deleted status id. */
export interface DeletedStatusBatch {
  batch: string
  statusId: string
  moveToStatusId: string
  moved: { taskId: string; fromStatusId: string; completedOn: ISODate | null }[]
}

/** Part 'tasks' (M3, plan/m03 S0.15). Names are distinctive so leak tests can grep them. */
export interface WorldTasks {
  tasks: {
    /** P root 'งานแม่ P-ลับ01' (parent of pChildA, pChildB). */
    pParent: TaskRow
    /** P depth 1, assigned member. */
    pChildA: TaskRow
    /** P depth 1, unassigned (soft-deleted assignments of lead and former), status doing. */
    pChildB: TaskRow
    /** P root after pParent, assigned lead; blocked by pChildA. */
    pLeaf: TaskRow
    /** P root after pLeaf, completed 2026-09-28 (status done), unassigned. */
    pDone: TaskRow
    /** Q root 'งาน Q-ลับ02', assigned outsider. */
    qTask: TaskRow
    /** A (archived) root, assigned member. */
    aTask: TaskRow
    /** A second root (status doing after aDeletedStatus). */
    aTask2: TaskRow
  }
  /** Soft-deleted roots (1 day ago) whose batches are w.batches.pDeletedTask / aDeletedTask. */
  deletedTasks: { pDeleted: TaskRow; aDeleted: TaskRow }
  assignments: {
    pChildAMember: AssignmentRow
    pLeafLead: AssignmentRow
    qTaskOutsider: AssignmentRow
    aTaskMember: AssignmentRow
  }
  batches: {
    pDeletedTask: string
    aDeletedTask: string
    /** Soft-deleted assignment of lead on pChildB (1 day ago). */
    pRemovedAssignment: string
    pDeletedStatus: DeletedStatusBatch
    aDeletedStatus: DeletedStatusBatch
  }
  /** Input for restoreRemovedMember rows: `former` was a MEMBER of P (one soft-deleted assignment on pChildB). */
  removedMembers: {
    pFormer: { projectId: string; userId: string; batch: string; member: RemovedMemberSnapshot }
  }
  statuses: {
    /** 5 defaults + pSecret 'สถานะลับ P-03' (WAITING, unused, before done). */
    P: Record<DefaultKey, TaskStatusRow> & { pSecret: TaskStatusRow }
    /** 5 defaults; waitData renamed 'สถานะลับ Q-04'. */
    Q: Record<DefaultKey, TaskStatusRow>
    A: Record<DefaultKey, TaskStatusRow>
  }
  blockers: { pLeafByChildA: TaskBlockerRow }
}

export interface World extends WorldTasks {
  manager: TestUser
  lead: TestUser
  member: TestUser
  outsider: TestUser
  /** Extra users added by later parts (M3 `former`, M5 coworker/pOnly). */
  users: Record<string, TestUser>
  /** Client of P and A. */
  C1: ClientRow
  /** Client of Q. */
  C2: ClientRow
  /** Archived client without projects. */
  C3: ClientRow
  /** 'World P' · C1 · LEAD lead · MEMBER member. */
  P: ProjectRow
  /** 'World Q' · C2 · MEMBER outsider · no LEAD. */
  Q: ProjectRow
  /** 'World A' · C1 · LEAD lead · MEMBER member · archived. */
  A: ProjectRow
}

type PartBuilder = (w: World) => Promise<void>

/** Placeholder for part fields: any property read throws, so a row that forgot `with: [part]` fails clearly. */
function notBuilt<T extends object>(part: WorldPart, field: string): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
      throw new Error(`world.${field}.${prop} needs createWorld({ with: ['${part}'] })`)
    },
  })
}

const DAY_AGO = { daysAgo: 1 } as const

/** M3 'tasks' part (plan/m03 S0.15). */
async function buildTasks(w: World): Promise<void> {
  const { manager, lead, member, outsider, P, Q, A } = w
  const by = { createdBy: manager }

  // statuses (X70)
  const sp = await makeStatuses({ project: P })
  const pSecret = await makeStatus({
    project: P,
    name: 'สถานะลับ P-03',
    category: 'WAITING',
    afterId: sp.blocked.id,
  })
  const sq = await makeStatuses({ project: Q, rename: { waitData: 'สถานะลับ Q-04' } })
  const sa = await makeStatuses({ project: A })

  // P tree: pParent(pChildA, pChildB), pLeaf, pDone
  const pParent = await makeTask({ project: P, name: 'งานแม่ P-ลับ01', ...by })
  const pChildA = await makeTask({ project: P, parent: pParent, name: 'งานย่อย P-ลับ05', ...by })
  const pChildB = await makeTask({
    project: P,
    parent: pParent,
    name: 'งานย่อย P-ลับ06',
    status: sp.doing,
    ...by,
  })
  const pLeaf = await makeTask({ project: P, name: 'งานเดี่ยว P-ลับ07', ...by })
  const pDone = await makeTask({
    project: P,
    name: 'งานเสร็จ P-ลับ08',
    completedOn: '2026-09-28',
    status: sp.done,
    ...by,
  })
  const qTask = await makeTask({ project: Q, name: 'งาน Q-ลับ02', ...by })
  const aTask = await makeTask({ project: A, name: 'งาน A-ลับ09', ...by })
  const aTask2 = await makeTask({ project: A, name: 'งาน A-ลับ10', status: sa.doing, ...by })

  const pDeletedTask = randomUUID()
  const aDeletedTask = randomUUID()
  const pDeleted = await makeTask({
    project: P,
    name: 'งานที่ลบแล้ว P',
    deleted: { batch: pDeletedTask, ...DAY_AGO },
    ...by,
  })
  const aDeleted = await makeTask({
    project: A,
    name: 'งานที่ลบแล้ว A',
    deleted: { batch: aDeletedTask, ...DAY_AGO },
    ...by,
  })

  // assignments (BR-31: leaves only; active ⇒ member)
  const pChildAMember = await makeAssignment({ task: pChildA, user: member })
  const pLeafLead = await makeAssignment({ task: pLeaf, user: lead })
  const qTaskOutsider = await makeAssignment({ task: qTask, user: outsider })
  const aTaskMember = await makeAssignment({ task: aTask, user: member })
  const pRemovedAssignment = randomUUID()
  await makeAssignment({ task: pChildB, user: lead, deleted: { batch: pRemovedAssignment, ...DAY_AGO } })

  // former member of P (FR-404 restore input)
  const former = await makeUser({ role: 'worker', name: 'World Former', nickname: 'Former' })
  const pFormerBatch = randomUUID()
  await makeAssignment({ task: pChildB, user: former, deleted: { batch: pFormerBatch, ...DAY_AGO } })

  // deleted statuses (X72): their task was moved to `doing` by the delete
  const pDeletedStatusBatch = randomUUID()
  const pDeletedStatus = await makeStatus({
    project: P,
    name: 'สถานะที่ลบแล้ว P',
    category: 'TODO',
    deleted: { batch: pDeletedStatusBatch, ...DAY_AGO },
  })
  const aDeletedStatusBatch = randomUUID()
  const aDeletedStatus = await makeStatus({
    project: A,
    name: 'สถานะที่ลบแล้ว A',
    category: 'TODO',
    deleted: { batch: aDeletedStatusBatch, ...DAY_AGO },
  })

  const pLeafByChildA = await makeBlocker({ task: pLeaf, blocker: pChildA, createdBy: manager })

  w.users.former = former
  w.tasks = { pParent, pChildA, pChildB, pLeaf, pDone, qTask, aTask, aTask2 }
  w.deletedTasks = { pDeleted, aDeleted }
  w.assignments = { pChildAMember, pLeafLead, qTaskOutsider, aTaskMember }
  w.batches = {
    pDeletedTask,
    aDeletedTask,
    pRemovedAssignment,
    pDeletedStatus: {
      batch: pDeletedStatusBatch,
      statusId: pDeletedStatus.id,
      moveToStatusId: sp.doing.id,
      moved: [{ taskId: pChildB.id, fromStatusId: pDeletedStatus.id, completedOn: null }],
    },
    aDeletedStatus: {
      batch: aDeletedStatusBatch,
      statusId: aDeletedStatus.id,
      moveToStatusId: sa.doing.id,
      moved: [{ taskId: aTask2.id, fromStatusId: aDeletedStatus.id, completedOn: null }],
    },
  }
  w.removedMembers = {
    pFormer: {
      projectId: P.id,
      userId: former.id,
      batch: pFormerBatch,
      member: { role: 'MEMBER', addedBy: lead.id, addedAt: '2026-09-01T09:00:00+07:00' },
    },
  }
  w.statuses = { P: { ...sp, pSecret }, Q: sq, A: sa }
  w.blockers = { pLeafByChildA }
}

/** Builders by part; each milestone adds its own. */
const BUILDERS: Partial<Record<WorldPart, PartBuilder>> = { tasks: buildTasks }

/** Transitive closure over WORLD_PART_IMPLIES. */
export function expandParts(parts: readonly WorldPart[]): Set<WorldPart> {
  const out = new Set<WorldPart>()
  const stack = [...parts]
  while (stack.length > 0) {
    const p = stack.pop()!
    if (out.has(p)) continue
    out.add(p)
    stack.push(...(WORLD_PART_IMPLIES[p] ?? []))
  }
  return out
}

export async function createWorld(opts: { with?: readonly WorldPart[] } = {}): Promise<World> {
  const parts = expandParts(opts.with ?? [])
  for (const p of parts) if (!BUILDERS[p]) throw new Error(`world part ${p} has no builder yet`)
  const manager = await makeUser({ role: 'manager', name: 'World Manager', nickname: 'Manager' })
  const lead = await makeUser({ role: 'worker', name: 'World Lead', nickname: 'Lead' })
  const member = await makeUser({ role: 'worker', name: 'World Member', nickname: 'Member' })
  const outsider = await makeUser({ role: 'worker', name: 'World Outsider', nickname: 'Outsider' })
  const C1 = await makeClient({ name: 'World C1' })
  const C2 = await makeClient({ name: 'World C2' })
  const C3 = await makeClient({ name: 'World C3', archived: true })
  const P = await makeProject({ name: 'World P', client: C1, lead, members: [member], createdBy: manager })
  const Q = await makeProject({ name: 'World Q', client: C2, members: [outsider], createdBy: manager })
  const A = await makeProject({
    name: 'World A',
    client: C1,
    lead,
    members: [member],
    archived: true,
    createdBy: manager,
  })
  const w: World = {
    manager,
    lead,
    member,
    outsider,
    users: {},
    C1,
    C2,
    C3,
    P,
    Q,
    A,
    tasks: notBuilt('tasks', 'tasks'),
    deletedTasks: notBuilt('tasks', 'deletedTasks'),
    assignments: notBuilt('tasks', 'assignments'),
    batches: notBuilt('tasks', 'batches'),
    removedMembers: notBuilt('tasks', 'removedMembers'),
    statuses: notBuilt('tasks', 'statuses'),
    blockers: notBuilt('tasks', 'blockers'),
  }
  for (const p of WORLD_PART_ORDER) if (parts.has(p)) await BUILDERS[p]!(w)
  return w
}
