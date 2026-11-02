// tests/helpers/world.ts — the standard permission world (PLAN.md §4.3, X91).
// M1: four users; M2 adds clients C1/C2/C3 and projects P/Q/A (lead = LEAD of P, member = MEMBER of P, outsider =
// MEMBER of Q only; A = archived, P's team; Q has no LEAD; C3 archived without projects). Always built.
// The four role users stay top-level; extra users added by later parts live under `w.users.<name>`.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { ISODate } from '@/domain/types'
import { extractContentText } from '@/lib/editor/content-text'
import type { RemovedMemberSnapshot } from '@/lib/contracts/tasks'
import type {
  ClientRow,
  FileRow,
  HolidayRow,
  LeaveTypeRow,
  PageRow,
  PlanMarkerDbRow,
  ProjectRow,
  TimeOffRow,
} from '@/server/db/schema'
import { db } from '@/server/db/client'
import { pages } from '@/server/db/schema'
import type { AllocRow } from '@/server/repo/allocations'
import type { TaskRow } from '@/server/repo/tasks'
import type { AssignmentRow } from '@/server/repo/task-assignments'
import type { TaskBlockerRow } from '@/server/repo/task-blockers'
import type { TaskStatusRow } from '@/server/repo/task-statuses'
import { pdfBytes } from './files'
import {
  makeAllocation,
  makeAssignment,
  makeDayAllocations,
  makeBlocker,
  makeClient,
  makeFile,
  makeHoliday,
  makeLeaveType,
  makeMembership,
  makePage,
  makePlanMarker,
  makeProject,
  makeStatus,
  makeStatuses,
  makeTask,
  makeTaskBody,
  makeTimeOff,
  makeUser,
  type DefaultKey,
  type TestUser,
} from './factories'

/** Pinned part list (X91); each milestone adds the builder for its part(s).
 *  M3 tasks · M4 pages, files · M5 timeOff · M6 allocations · M6.1 taskBodies · M7 dayAllocations · M7.1 planMarkers ·
 *  M8 milestones */
export type WorldPart =
  | 'tasks'
  | 'pages'
  | 'taskBodies'
  | 'files'
  | 'timeOff'
  | 'allocations'
  | 'dayAllocations'
  | 'planMarkers'
  | 'milestones'

/** Fixed build order of the parts. */
export const WORLD_PART_ORDER: readonly WorldPart[] = [
  'tasks',
  'pages',
  'taskBodies', // M6.1: after pages (its TASK pages sit beside the world's DOC pages)
  'files',
  'timeOff',
  'allocations',
  'dayAllocations',
  'planMarkers', // M7.1: needs only P / Q / A
  'milestones',
]

/** Implications; the owning milestone adds its entry (M6 allocations → tasks + timeOff, M7 dayAllocations →
 *  allocations, M8 milestones → tasks + allocations). */
export const WORLD_PART_IMPLIES: Partial<Record<WorldPart, readonly WorldPart[]>> = {
  files: ['pages'], // M4: every world file sits on a world page
  allocations: ['tasks', 'timeOff'], // M6: plans on the M3 assignments + the M5 coworker (plan/m06 S0.11)
  taskBodies: ['tasks', 'pages'], // M6.1: bodies of M3 tasks; tree tests compare with the M4 pages
  dayAllocations: ['allocations'], // M7: day plans on M6's assignments (plan/m07 S0.9, G17 — no new users/tasks)
}

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
    /** M6 (with 'allocations'): P root 'งานร่วม P-ลับ03' after pDone, assigned coworker. */
    pCoworker: TaskRow
  }
  /** Soft-deleted roots (1 day ago) whose batches are w.batches.pDeletedTask / aDeletedTask. */
  deletedTasks: { pDeleted: TaskRow; aDeleted: TaskRow }
  assignments: {
    pChildAMember: AssignmentRow
    pLeafLead: AssignmentRow
    qTaskOutsider: AssignmentRow
    aTaskMember: AssignmentRow
    /** M6 (with 'allocations'): member on pDone (completed 2026-09-28). */
    pDoneMember: AssignmentRow
    /** M6 (with 'allocations'): coworker on pCoworker. */
    pCoworker: AssignmentRow
    /** M6 (with 'allocations'): coworker on qTask (feeds P's otherProjects; Q stays hidden). */
    qTaskCoworker: AssignmentRow
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

/** Part 'pages' (M4, plan/m04 S0.15). Distinctive titles for leak tests. */
export interface WorldPages {
  pages: {
    /** P root, is_charter, 'Charter P-ลับ04'. */
    pCharter: PageRow
    /** P root after the charter, 'หน้า P-ลับ05', content 'เนื้อหา P-ลับ06'. */
    pPage: PageRow
    /** P depth 1 under pPage, 'ลูก P-ลับ07'. */
    pChild: PageRow
    /** Q root 'หน้า Q-ลับ08', content 'เนื้อหา Q-ลับ09'. */
    qPage: PageRow
    /** A (archived) root 'หน้า A-ลับ10'. */
    aPage: PageRow
    /** WORKSPACE root 'คู่มือ W-01'. */
    wiki: PageRow
    /** WORKSPACE child of wiki 'ย่อย W-02'. */
    wikiChild: PageRow
    /** WORKSPACE root, locked, 'นโยบาย W-ล็อก03'. */
    wikiProtected: PageRow
    /** Child of wikiProtected (inherits protection, X63) 'ย่อยล็อก W-04'. */
    wikiProtectedChild: PageRow
    /** WORKSPACE root, unlocked, 'แฟ้ม W-05' (its child is locked). */
    wikiFolder: PageRow
    /** Locked child of wikiFolder 'ล็อกในแฟ้ม W-06'. */
    wikiFolderLocked: PageRow
  }
  /** Soft-deleted roots under the w.batches.*Page batches. */
  deletedPages: { pDeleted: PageRow; aDeleted: PageRow; wikiDeleted: PageRow; pOldDeleted: PageRow }
}

/** Part 'taskBodies' (M6.1, plan/m06.1 S0.15; implies 'tasks', 'pages'). Distinctive body texts for leak tests.
 *  Tasks WITHOUT a body used by rows: w.tasks.pChildB, w.tasks.aTask2. */
export interface WorldTaskBodies {
  taskBodies: {
    /** TASK page of pLeaf: 'รายละเอียด P-ลับ11' + an image block of pLeafBodyImage; fullWidth false. */
    pLeafBody: PageRow
    /** IMAGE file on pLeafBody (project P). */
    pLeafBodyImage: FileRow
    /** TASK page of aTask (archived A): 'รายละเอียด A-ลับ12'. */
    aTaskBody: PageRow
    /** TASK page of qTask (Q, outsider's project): 'รายละเอียด Q-ลับ13'. */
    qTaskBody: PageRow
  }
}

/** Part 'files' (M4; implies 'pages'). Bytes exist under UPLOAD_DIR. */
export interface WorldFiles {
  files: {
    /** IMAGE (1×1 PNG) on pPage. */
    pImage: FileRow
    /** ATTACHMENT (pdf) 'สัญญา.pdf' on pPage. */
    pPdf: FileRow
    /** IMAGE on qPage. */
    qFile: FileRow
    /** IMAGE on aPage (archived project). */
    aFile: FileRow
    /** IMAGE on wiki (project_id null). */
    wikiFile: FileRow
  }
}

/** Part 'timeOff' (M5, plan/m05 S0.15). Distinctive strings for leak greps; adds w.users.coworker / pOnly. */
export interface WorldTimeOff {
  leaveTypes: {
    /** 'ลาพักร้อน-โลก' #0369A1, first by position. */
    vacation: LeaveTypeRow
    /** 'ลาป่วย-โลก' #B91C1C. */
    sick: LeaveTypeRow
    /** 'อบรม-โลก' #7E22CE (only the member's own entry uses it). */
    training: LeaveTypeRow
    /** 'ลาเก่า-โลก', archived. */
    archived: LeaveTypeRow
  }
  timeOff: {
    /** coworker · vacation · 2026-11-09..2026-11-10 · note 'โน้ตลับ-โลก-01'. */
    coworker: TimeOffRow
    /** pOnly · sick · 2026-11-16 PM · note 'โน้ตลับ-โลก-02'. */
    pOnly: TimeOffRow
    /** member · training · 2026-11-02 · note 'โน้ตของ member'. */
    member: TimeOffRow
  }
  holidays: {
    /** 2026-11-20 'วันหยุดโลก'. */
    h1: HolidayRow
  }
}

/** Part 'allocations' (M6, plan/m06 S0.11). Rows of each assignment (plain inserts: every assignment version stays 1).
 *  No November 2026 week on pLeafLead or aTaskMember (M7's dayAllocations uses 11-02 / 11-09). */
export interface WorldAllocations {
  allocations: {
    /** WEEK 2026-09-28 = 250, 2026-10-05 = 500. */
    pLeafLead: AllocRow[]
    /** WEEK 2026-09-28 = 100; DAY 2026-10-12 = 50, 2026-10-13 = 50 (the X27 DAY week). */
    pChildAMember: AllocRow[]
    /** WEEK 2026-09-28 = 100, 2026-10-05 = 200 (BR-50: 10-05 not counted, pDone completed 2026-09-28). */
    pDoneMember: AllocRow[]
    /** WEEK 2026-09-28 = 300 (Q). */
    qTaskOutsider: AllocRow[]
    /** WEEK 2026-10-05 = 200 (archived A). */
    aTaskMember: AllocRow[]
    /** WEEK 2026-10-05 = 100. */
    pCoworker: AllocRow[]
    /** WEEK 2026-10-05 = 300 (Q). */
    qTaskCoworker: AllocRow[]
  }
}

/** Part 'dayAllocations' (M7, plan/m07 S0.9). Weeks (Mondays) of the rows it adds on M6's assignments; plain inserts,
 *  every assignment version stays 1. */
export interface WorldDayAllocations {
  dayWeeks: {
    /** WEEK 250 on `assignments.pLeafLead` (P). */
    pWeek: ISODate
    /** DAY { 11-09: 100, 11-10: 100, 11-11: 50 } on `assignments.pLeafLead`. */
    pDay: ISODate
    /** DAY { 11-09: 50 } on `assignments.aTaskMember` (archived A). */
    aDay: ISODate
    /** DAY { 11-10: 75 } on `assignments.qTaskCoworker` (Q) — feeds P's `otherProjects['D:2026-11-10']` of coworker. */
    qDay: ISODate
  }
}

/** Part 'planMarkers' (M7.1, plan/m07.1 S0.11): live markers only, created by the project's lead (Q: the manager). */
export interface WorldPlanMarkers {
  planMarkers: {
    /** P · RED · 2026-10-23 · 'UAT sign-off'. */
    pRed: PlanMarkerDbRow
    /** P · GREEN · 2026-11-06 · no label. */
    pGreen: PlanMarkerDbRow
    /** A (archived) · YELLOW · 2026-10-16 · 'A-ลับ เส้นกำกับ'. */
    aYellow: PlanMarkerDbRow
    /** Q (member and lead are not members) · RED · 2026-10-30 · 'Q-ลับ เส้นกำกับ'. */
    qRed: PlanMarkerDbRow
  }
}

/** Batch ids of every part; each part fills its own keys (reading another part's key throws). */
export type WorldBatches = WorldTasks['batches'] & {
  /** P root 'ลบแล้ว P', deleted 1 day ago. */
  pDeletedPage: string
  /** A root, deleted 1 day ago. */
  aDeletedPage: string
  /** WORKSPACE root, deleted 1 day ago. */
  wikiDeletedPage: string
  /** P root deleted 31 days ago (outside the restore window). */
  pOldDeletedPage: string
  /** coworker · sick · 2026-11-23, soft-deleted 1 day ago (restoreTimeOff input). */
  coworkerDeletedTimeOff: string
}

export interface World
  extends
    Omit<WorldTasks, 'batches'>,
    WorldPages,
    WorldTaskBodies,
    WorldFiles,
    WorldTimeOff,
    WorldAllocations,
    WorldDayAllocations,
    WorldPlanMarkers {
  batches: WorldBatches
  manager: TestUser
  lead: TestUser
  member: TestUser
  outsider: TestUser
  /** Extra users added by later parts (M3 `former`; M5 `coworker` = MEMBER of P and Q, visible to everyone in the
   *  world; `pOnly` = MEMBER of P only, invisible to the outsider). */
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

/** Keys a later part adds to an object an earlier part built: reading one before that part ran throws like notBuilt.
 *  Only the listed keys trap, so matchers that probe other properties keep working. */
function withPendingKeys<T extends object>(
  obj: T,
  part: WorldPart,
  field: string,
  keys: readonly string[],
): T {
  const pending = new Set(keys)
  return new Proxy(obj, {
    get(t, prop, receiver) {
      if (typeof prop === 'string' && pending.has(prop) && !(prop in t)) {
        throw new Error(`world.${field}.${prop} needs createWorld({ with: ['${part}'] })`)
      }
      return Reflect.get(t, prop, receiver) as unknown
    },
  })
}

const DAY_AGO = { daysAgo: 1 } as const

/** Which part fills each w.batches key (error messages of the batches proxy). */
const BATCH_PART: Record<keyof WorldBatches, WorldPart> = {
  pDeletedTask: 'tasks',
  aDeletedTask: 'tasks',
  pRemovedAssignment: 'tasks',
  pDeletedStatus: 'tasks',
  aDeletedStatus: 'tasks',
  pDeletedPage: 'pages',
  aDeletedPage: 'pages',
  wikiDeletedPage: 'pages',
  pOldDeletedPage: 'pages',
  coworkerDeletedTimeOff: 'timeOff',
}

/** w.batches: builders Object.assign their keys; reading a key of an unbuilt part throws like notBuilt. */
function batchesProxy(): WorldBatches {
  return new Proxy({} as WorldBatches, {
    get(t, prop) {
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON' || prop in t)
        return (t as Record<string | symbol, unknown>)[prop]
      const part = (BATCH_PART as Record<string, WorldPart | undefined>)[prop] ?? '?'
      throw new Error(`world.batches.${prop} needs createWorld({ with: ['${part}'] })`)
    },
  })
}

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
  w.tasks = withPendingKeys(
    { pParent, pChildA, pChildB, pLeaf, pDone, qTask, aTask, aTask2 } as World['tasks'],
    'allocations',
    'tasks',
    ['pCoworker'],
  )
  w.deletedTasks = { pDeleted, aDeleted }
  w.assignments = withPendingKeys(
    { pChildAMember, pLeafLead, qTaskOutsider, aTaskMember } as World['assignments'],
    'allocations',
    'assignments',
    ['pDoneMember', 'pCoworker', 'qTaskCoworker'],
  )
  Object.assign(w.batches, {
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
  })
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

const para = (text: string): unknown[] => [{ type: 'paragraph', content: text }]

/** M4 'pages' part (plan/m04 S0.15). Created by the manager; deleted roots under fresh batches. */
async function buildPages(w: World): Promise<void> {
  const { manager, P, Q, A } = w
  const by = { createdBy: manager }
  const pCharter = await makePage({
    project: P,
    title: 'Charter P-ลับ04',
    isCharter: true,
    icon: '📋',
    ...by,
  })
  const pPage = await makePage({ project: P, title: 'หน้า P-ลับ05', content: para('เนื้อหา P-ลับ06'), ...by })
  const pChild = await makePage({ parent: pPage, title: 'ลูก P-ลับ07', ...by })
  const qPage = await makePage({ project: Q, title: 'หน้า Q-ลับ08', content: para('เนื้อหา Q-ลับ09'), ...by })
  const aPage = await makePage({ project: A, title: 'หน้า A-ลับ10', ...by })
  const wiki = await makePage({ title: 'คู่มือ W-01', ...by })
  const wikiChild = await makePage({ parent: wiki, title: 'ย่อย W-02', ...by })
  const wikiProtected = await makePage({ title: 'นโยบาย W-ล็อก03', locked: true, ...by })
  const wikiProtectedChild = await makePage({ parent: wikiProtected, title: 'ย่อยล็อก W-04', ...by })
  const wikiFolder = await makePage({ title: 'แฟ้ม W-05', ...by })
  const wikiFolderLocked = await makePage({
    parent: wikiFolder,
    title: 'ล็อกในแฟ้ม W-06',
    locked: true,
    ...by,
  })

  const pDeletedPage = randomUUID()
  const aDeletedPage = randomUUID()
  const wikiDeletedPage = randomUUID()
  const pOldDeletedPage = randomUUID()
  const pDeleted = await makePage({
    project: P,
    title: 'ลบแล้ว P',
    deleted: { batch: pDeletedPage, ...DAY_AGO },
    ...by,
  })
  const aDeleted = await makePage({
    project: A,
    title: 'ลบแล้ว A',
    deleted: { batch: aDeletedPage, ...DAY_AGO },
    ...by,
  })
  const wikiDeleted = await makePage({
    title: 'ลบแล้ว W',
    deleted: { batch: wikiDeletedPage, ...DAY_AGO },
    ...by,
  })
  const pOldDeleted = await makePage({
    project: P,
    title: 'ลบนานแล้ว P',
    deleted: { batch: pOldDeletedPage, daysAgo: 31 },
    ...by,
  })

  w.pages = {
    pCharter,
    pPage,
    pChild,
    qPage,
    aPage,
    wiki,
    wikiChild,
    wikiProtected,
    wikiProtectedChild,
    wikiFolder,
    wikiFolderLocked,
  }
  w.deletedPages = { pDeleted, aDeleted, wikiDeleted, pOldDeleted }
  Object.assign(w.batches, { pDeletedPage, aDeletedPage, wikiDeletedPage, pOldDeletedPage })
}

/** M6.1 'taskBodies' part (plan/m06.1 S0.15): TASK pages of pLeaf, aTask and qTask (+ an image on pLeaf's). */
async function buildTaskBodies(w: World): Promise<void> {
  const { manager } = w
  const by = { createdBy: manager }
  const pLeafBody = await makeTaskBody({ task: w.tasks.pLeaf, content: 'รายละเอียด P-ลับ11', ...by })
  const pLeafBodyImage = await makeFile({ page: pLeafBody, uploadedBy: manager })
  const content = [
    { type: 'paragraph', content: 'รายละเอียด P-ลับ11' },
    { type: 'image', props: { url: `/api/files/${pLeafBodyImage.id}`, name: 'image.png' } },
  ]
  const [withImage] = await db
    .update(pages)
    .set({ content, contentText: extractContentText(content) })
    .where(eq(pages.id, pLeafBody.id))
    .returning()
  w.taskBodies = {
    pLeafBody: withImage!,
    pLeafBodyImage,
    aTaskBody: await makeTaskBody({ task: w.tasks.aTask, content: 'รายละเอียด A-ลับ12', ...by }),
    qTaskBody: await makeTaskBody({ task: w.tasks.qTask, content: 'รายละเอียด Q-ลับ13', ...by }),
  }
}

/** M4 'files' part (plan/m04 S0.15): bytes on disk under UPLOAD_DIR + files rows. */
async function buildFiles(w: World): Promise<void> {
  const { manager } = w
  const by = { uploadedBy: manager }
  w.files = {
    pImage: await makeFile({ page: w.pages.pPage, ...by }),
    pPdf: await makeFile({
      page: w.pages.pPage,
      kind: 'ATTACHMENT',
      name: 'สัญญา.pdf',
      bytes: pdfBytes(),
      ...by,
    }),
    qFile: await makeFile({ page: w.pages.qPage, ...by }),
    aFile: await makeFile({ page: w.pages.aPage, ...by }),
    wikiFile: await makeFile({ page: w.pages.wiki, ...by }),
  }
}

/** M5 'timeOff' part (plan/m05 S0.15): leave types, two extra workers, leave entries, one holiday. */
async function buildTimeOff(w: World): Promise<void> {
  const { manager, member, P, Q } = w
  const vacation = await makeLeaveType({ name: 'ลาพักร้อน-โลก', color: '#0369A1' })
  const sick = await makeLeaveType({ name: 'ลาป่วย-โลก', color: '#B91C1C' })
  const training = await makeLeaveType({ name: 'อบรม-โลก', color: '#7E22CE' })
  const archived = await makeLeaveType({ name: 'ลาเก่า-โลก', archived: true })

  const coworker = await makeUser({ role: 'worker', name: 'World Coworker', nickname: 'Coworker' })
  const pOnly = await makeUser({ role: 'worker', name: 'World POnly', nickname: 'POnly' })
  await makeMembership({ project: P, user: coworker, addedBy: manager })
  await makeMembership({ project: Q, user: coworker, addedBy: manager })
  await makeMembership({ project: P, user: pOnly, addedBy: manager })

  const coworkerEntry = await makeTimeOff({
    user: coworker,
    leaveType: vacation,
    startDate: '2026-11-09',
    endDate: '2026-11-10',
    note: 'โน้ตลับ-โลก-01',
  })
  const pOnlyEntry = await makeTimeOff({
    user: pOnly,
    leaveType: sick,
    startDate: '2026-11-16',
    half: 'PM',
    note: 'โน้ตลับ-โลก-02',
  })
  const memberEntry = await makeTimeOff({
    user: member,
    leaveType: training,
    startDate: '2026-11-02',
    note: 'โน้ตของ member',
  })
  const coworkerDeletedTimeOff = randomUUID()
  await makeTimeOff({
    user: coworker,
    leaveType: sick,
    startDate: '2026-11-23',
    deleted: { batch: coworkerDeletedTimeOff, ...DAY_AGO },
  })
  const h1 = await makeHoliday({ date: '2026-11-20', name: 'วันหยุดโลก' })

  w.users.coworker = coworker
  w.users.pOnly = pOnly
  w.leaveTypes = { vacation, sick, training, archived }
  w.timeOff = { coworker: coworkerEntry, pOnly: pOnlyEntry, member: memberEntry }
  w.holidays = { h1 }
  Object.assign(w.batches, { coworkerDeletedTimeOff })
}

/** M6 'allocations' part (plan/m06 S0.11): plans on the M3 assignments + three new assignments (WorldAllocations). */
async function buildAllocations(w: World): Promise<void> {
  const { manager, member, P } = w
  const coworker = w.users.coworker!
  const week = (assignment: { id: string }, pairs: readonly (readonly [ISODate, number])[]) =>
    Promise.all(pairs.map(([period, cd]) => makeAllocation({ assignment, period, cd })))

  const pCoworkerTask = await makeTask({ project: P, name: 'งานร่วม P-ลับ03', createdBy: manager })
  const pDoneMember = await makeAssignment({ task: w.tasks.pDone, user: member })
  const pCoworker = await makeAssignment({ task: pCoworkerTask, user: coworker })
  const qTaskCoworker = await makeAssignment({ task: w.tasks.qTask, user: coworker })
  const a = w.assignments

  const pChildAMember = [
    ...(await week(a.pChildAMember, [['2026-09-28', 100]])),
    await makeAllocation({ assignment: a.pChildAMember, period: '2026-10-12', cd: 50, granularity: 'DAY' }),
    await makeAllocation({ assignment: a.pChildAMember, period: '2026-10-13', cd: 50, granularity: 'DAY' }),
  ]
  w.allocations = {
    pLeafLead: await week(a.pLeafLead, [
      ['2026-09-28', 250],
      ['2026-10-05', 500],
    ]),
    pChildAMember,
    pDoneMember: await week(pDoneMember, [
      ['2026-09-28', 100],
      ['2026-10-05', 200],
    ]),
    qTaskOutsider: await week(a.qTaskOutsider, [['2026-09-28', 300]]),
    aTaskMember: await week(a.aTaskMember, [['2026-10-05', 200]]),
    pCoworker: await week(pCoworker, [['2026-10-05', 100]]),
    qTaskCoworker: await week(qTaskCoworker, [['2026-10-05', 300]]),
  }
  Object.assign(w.tasks, { pCoworker: pCoworkerTask })
  Object.assign(w.assignments, { pDoneMember, pCoworker, qTaskCoworker })
}

/** M7 'dayAllocations' part (plan/m07 S0.9): rows on M6's assignments only (WorldDayAllocations). */
async function buildDayAllocations(w: World): Promise<void> {
  const a = w.assignments
  const dayWeeks: World['dayWeeks'] = {
    pWeek: '2026-11-02',
    pDay: '2026-11-09',
    aDay: '2026-11-09',
    qDay: '2026-11-09',
  }
  await makeAllocation({ assignment: a.pLeafLead, period: dayWeeks.pWeek, cd: 250 })
  await makeDayAllocations({
    assignment: a.pLeafLead,
    days: { '2026-11-09': 100, '2026-11-10': 100, '2026-11-11': 50 },
  })
  await makeDayAllocations({ assignment: a.aTaskMember, days: { '2026-11-09': 50 } })
  await makeDayAllocations({ assignment: a.qTaskCoworker, days: { '2026-11-10': 75 } })
  w.dayWeeks = dayWeeks
}

/** M7.1 'planMarkers' part (plan/m07.1 S0.11). */
async function buildPlanMarkers(w: World): Promise<void> {
  w.planMarkers = {
    pRed: await makePlanMarker({
      projectId: w.P.id,
      date: '2026-10-23',
      color: 'RED',
      label: 'UAT sign-off',
      createdBy: w.lead,
    }),
    pGreen: await makePlanMarker({
      projectId: w.P.id,
      date: '2026-11-06',
      color: 'GREEN',
      createdBy: w.lead,
    }),
    aYellow: await makePlanMarker({
      projectId: w.A.id,
      date: '2026-10-16',
      color: 'YELLOW',
      label: 'A-ลับ เส้นกำกับ',
      createdBy: w.lead,
    }),
    qRed: await makePlanMarker({
      projectId: w.Q.id,
      date: '2026-10-30',
      color: 'RED',
      label: 'Q-ลับ เส้นกำกับ',
      createdBy: w.manager,
    }),
  }
}

/** Builders by part; each milestone adds its own. */
const BUILDERS: Partial<Record<WorldPart, PartBuilder>> = {
  tasks: buildTasks,
  pages: buildPages,
  taskBodies: buildTaskBodies,
  files: buildFiles,
  timeOff: buildTimeOff,
  allocations: buildAllocations,
  dayAllocations: buildDayAllocations,
  planMarkers: buildPlanMarkers,
}

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
    batches: batchesProxy(),
    removedMembers: notBuilt('tasks', 'removedMembers'),
    statuses: notBuilt('tasks', 'statuses'),
    blockers: notBuilt('tasks', 'blockers'),
    pages: notBuilt('pages', 'pages'),
    deletedPages: notBuilt('pages', 'deletedPages'),
    taskBodies: notBuilt('taskBodies', 'taskBodies'),
    files: notBuilt('files', 'files'),
    leaveTypes: notBuilt('timeOff', 'leaveTypes'),
    timeOff: notBuilt('timeOff', 'timeOff'),
    holidays: notBuilt('timeOff', 'holidays'),
    allocations: notBuilt('allocations', 'allocations'),
    dayWeeks: notBuilt('dayAllocations', 'dayWeeks'),
    planMarkers: notBuilt('planMarkers', 'planMarkers'),
  }
  for (const p of WORLD_PART_ORDER) if (parts.has(p)) await BUILDERS[p]!(w)
  return w
}
