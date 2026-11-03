// tests/helpers/world.ts — the standard permission world (PLAN.md §4.3, X91).
// M1: four users; M2 adds clients C1/C2/C3 and projects P/Q/A (lead = LEAD of P, member = MEMBER of P, outsider =
// MEMBER of Q only; A = archived, P's team; Q has no LEAD; C3 archived without projects). Always built.
// The four role users stay top-level; extra users added by later parts live under `w.users.<name>`.
import { randomUUID } from 'node:crypto'
import { eq, gt } from 'drizzle-orm'
import type { ISODate } from '@/domain/types'
import { extractContentText } from '@/lib/editor/content-text'
import type { RemovedMemberSnapshot } from '@/lib/contracts/tasks'
import type {
  ClientRow,
  DatabaseRow,
  DbColumnRow,
  DbRowRow,
  DbViewRow,
  FileRow,
  HolidayRow,
  LeaveTypeRow,
  MilestoneDbRow,
  PageRow,
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
  bindTask,
  makeAllocation,
  makeAssignment,
  makeDayAllocations,
  makeBlocker,
  makeClient,
  makeFile,
  makeHoliday,
  makeDatabase,
  makeDbColumn,
  makeDbRow,
  makeDbView,
  makeLeaveType,
  makeMembership,
  makeMilestone,
  makePage,
  makeProject,
  makeRowBody,
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
 *  M3 tasks · M4 pages, files · M5 timeOff · M6 allocations · M6.1 taskBodies · M7 dayAllocations (M7.1's planMarkers part was removed in M11.1) ·
 *  M8 milestones · M10 home · M11 databases */
export type WorldPart =
  | 'tasks'
  | 'pages'
  | 'taskBodies'
  | 'files'
  | 'timeOff'
  | 'allocations'
  | 'dayAllocations'
  | 'milestones'
  | 'home'
  | 'databases'

/** Fixed build order of the parts. */
export const WORLD_PART_ORDER: readonly WorldPart[] = [
  'tasks',
  'pages',
  'taskBodies', // M6.1: after pages (its TASK pages sit beside the world's DOC pages)
  'files',
  'timeOff',
  'allocations',
  'dayAllocations',
  'milestones',
  'home', // M10: adds keys to the tasks / pages / timeOff / milestones objects of the earlier parts
  'databases', // M11: last — databases on the world's DOC / TASK pages (plan/m11 S0.17)
]

/** Implications; the owning milestone adds its entry (M6 allocations → tasks + timeOff, M7 dayAllocations →
 *  allocations, M8 milestones → tasks + allocations). */
export const WORLD_PART_IMPLIES: Partial<Record<WorldPart, readonly WorldPart[]>> = {
  files: ['pages'], // M4: every world file sits on a world page
  allocations: ['tasks', 'timeOff'], // M6: plans on the M3 assignments + the M5 coworker (plan/m06 S0.11)
  taskBodies: ['tasks', 'pages'], // M6.1: bodies of M3 tasks; tree tests compare with the M4 pages
  dayAllocations: ['allocations'], // M7: day plans on M6's assignments (plan/m07 S0.9, G17 — no new users/tasks)
  milestones: ['tasks', 'allocations'], // M8: bound M3 tasks; lateness reads M6's plans (plan/m08 S0.10, X91)
  home: ['tasks', 'pages', 'timeOff', 'allocations', 'milestones'], // M10: every home card (plan/m10 S0.12)
  databases: ['pages', 'taskBodies', 'files'], // M11 (X91): owner pages incl. a TASK body; a row-body image
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
    /** M10 (with 'home'): P root 'งานกำหนดส่ง P-ลับ17', assigned member, due 2026-10-02, no allocation (M9 bucket
     *  UNPLANNED → not on home). */
    pDueThisWeek: TaskRow
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
    /** M10 (with 'home'): Q root 'หน้าล่าสุด Q-ลับ18', updated_at 2026-09-30T09:00+07:00 — the newest page (every other
     *  world page is backdated to 2026-09-29T09:00+07:00 when it was newer). */
    qRecent: PageRow
    /** M10 (with 'home'): P root 'หน้าฝังบล็อก P-ลับ19', content = [taskView {view:'BOARD'}, projectWorkload {}]. */
    pEmbed: PageRow
    /** M10 (with 'home'): same content in Q 'หน้าฝังบล็อก Q-ลับ20'. */
    qEmbed: PageRow
    /** M10 (with 'home'): same content in archived A 'หน้าฝังบล็อก A-ลับ21'. */
    aEmbed: PageRow
    /** M10 (with 'home'): same content in the wiki 'หน้าฝังบล็อก W-07' (→ placeholder, FR-1304). */
    wikiEmbed: PageRow
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
    /** M10 (with 'home'): coworker · vacation · 2026-09-30 · note 'โน้ตลับ-โลก-03' (home "วันนี้" line). */
    coworkerToday: TimeOffRow
    /** M10 (with 'home'): pOnly · sick · 2026-10-06..2026-10-07 · note 'โน้ตลับ-โลก-04' (home "สัปดาห์หน้า" line). */
    pOnlyNextWeek: TimeOffRow
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

/** Part 'milestones' (M8, plan/m08 S0.10, M8-D23). Live milestones (P/A by the lead, Q by the manager) bound to M3
 *  tasks with bindTask; `w.tasks.*` rows carry the new `milestoneId`. Soft-deleted ones are in `deletedMilestones`
 *  and their batches in `w.batches`. */
export interface WorldMilestones {
  milestones: {
    /** P 'Milestone P-ลับ06' · 2026-10-23 · bound pChildB (no plans → not late). */
    p: MilestoneDbRow
    /** P 'ส่งมอบรอบแรก P' · 2026-10-02 · bound pLeaf (WEEK 10-05 = 500 > date → late, lateTaskCount 1). */
    pLate: MilestoneDbRow
    /** P 'Kickoff P' · 2026-09-15 · completedOn 2026-09-16 · bound pDone. */
    pDone: MilestoneDbRow
    /** Q 'Milestone Q-ลับ05' · 2026-10-20 · bound qTask. */
    q: MilestoneDbRow
    /** A (archived) 'Milestone A' · 2026-10-30 · bound aTask. */
    a: MilestoneDbRow
    /** M10 (with 'home'): P 'Milestone P-ลับ13' · 2026-09-25 · not done (OVERDUE on 2026-09-30). */
    pOverdue: MilestoneDbRow
    /** M10 (with 'home'): Q 'Milestone Q-ลับ15' · 2026-10-05 (DUE_SOON on 2026-09-30). */
    qSoon: MilestoneDbRow
    /** M10 (with 'home'): P 'Milestone P-ลับ16' · 2026-08-31 · not done (beyond the 4-week look-back, M10-D15). */
    pAncient: MilestoneDbRow
  }
  deletedMilestones: {
    /** P 'Milestone ที่ลบแล้ว P' · 2026-10-16 · soft-deleted 1 day ago; pParent.milestone_id still points at it. */
    pDeleted: MilestoneDbRow
    /** P 'Milestone เก่า P' · 2026-09-21 · soft-deleted 31 days ago (restore → 400 restoreExpired). */
    pExpired: MilestoneDbRow
    /** A 'Milestone ที่ลบแล้ว A' · 2026-10-09 · soft-deleted 1 day ago (restore → 403 archived). */
    aDeleted: MilestoneDbRow
  }
}

/** Part 'databases' (M11, plan/m11 S0.17; implies 'pages', 'taskBodies', 'files'). Created by the manager.
 *  Distinctive titles for leak tests; cell values of dbP are distinctive too (never searchable, FR-1474). */
export interface WorldDatabases {
  databases: {
    /** On pages.pPage, 'ฐานข้อมูล P-ลับ20': every column type, views ตาราง / คัมบัง (สถานะ) / ปฏิทิน (วันที่). */
    dbP: DatabaseRow
    /** Live columns of dbP by role (+ `deleted` = soft-deleted 'ลบแล้ว' under w.batches.dbColumn). */
    dbPColumns: {
      title: DbColumnRow
      status: DbColumnRow
      date: DbColumnRow
      text: DbColumnRow
      number: DbColumnRow
      multi: DbColumnRow
      check: DbColumnRow
      person: DbColumnRow
      url: DbColumnRow
      deleted: DbColumnRow
    }
    /** Option ids: status (ยังไม่เริ่ม / กำลังทำ / เสร็จ) and multi (แท็ก A / แท็ก B). */
    dbPOptions: { todo: string; doing: string; done: string; tagA: string; tagB: string }
    /** Views of dbP (+ `deleted` = soft-deleted view under w.batches.dbView). */
    dbPViews: { table: DbViewRow; kanban: DbViewRow; calendar: DbViewRow; deleted: DbViewRow }
    /** 'แถว P-ลับ21': every cell set (text 'ค่าเซลล์ P-ลับ28', คน = [member], date 2026-09-30); has pRowBody. */
    pRow1: DbRowRow
    /** 'แถว P-2' (no body; = pRowNoBody). */
    pRow2: DbRowRow
    /** 'แถว P-3' (no cells). */
    pRow3: DbRowRow
    pRowNoBody: DbRowRow
    /** DB_ROW page of pRow1: 'เนื้อหาแถว P-ลับ22' + an image block of pRowImage. */
    pRowBody: PageRow
    /** IMAGE on pRowBody (project P). */
    pRowImage: FileRow
    /** Soft-deleted row 'แถวลบแล้ว P' (+ body pRowDeletedBody) under w.batches.dbRows. */
    pRowDeleted: DbRowRow
    pRowDeletedBody: PageRow
    /** On pPage, detached (block no longer in the page content): 'ฐานข้อมูลหลุด P'. */
    dbPDetached: DatabaseRow
    /** On taskBodies.pLeafBody (a TASK owner page), 'ฐานข้อมูลงาน P', one row taskRow. */
    dbTask: DatabaseRow
    taskRow: DbRowRow
    /** On pages.aPage (archived A), 'ฐานข้อมูล A-ลับ26', row aRow with body aRowBody. */
    dbA: DatabaseRow
    aRow: DbRowRow
    aRowBody: PageRow
    /** On pages.qPage, 'ฐานข้อมูล Q-ลับ23', row 'แถว Q-ลับ24'. */
    dbQ: DatabaseRow
    qRow: DbRowRow
    /** On pages.wiki, 'ฐานข้อมูล W-08', row 'แถว W-25' with body wikiRowBody. */
    dbWiki: DatabaseRow
    wikiRow: DbRowRow
    wikiRowBody: PageRow
    /** On pages.wikiProtected (locked), 'ฐานข้อมูลล็อก W-09', one row wikiProtRow. */
    dbWikiProt: DatabaseRow
    wikiProtRow: DbRowRow
    /** On deletedPages.pDeleted, 'ฐานข้อมูลในหน้าที่ลบ P', one row. */
    dbDeletedPage: DatabaseRow
    deletedPageRow: DbRowRow
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
  /** M8: batch of deletedMilestones.pDeleted (1 day ago). */
  pDeletedMilestone: string
  /** M8: batch of deletedMilestones.pExpired (31 days ago). */
  pExpiredMilestone: string
  /** M8: batch of deletedMilestones.aDeleted (archived A, 1 day ago). */
  aDeletedMilestone: string
  /** M11: rows batch of dbP (pRowDeleted + pRowDeletedBody, 1 day ago). */
  dbRows: string
  /** M11: column batch of dbP (dbPColumns.deleted, 1 day ago). */
  dbColumn: string
  /** M11: view batch of dbP (dbPViews.deleted, 1 day ago). */
  dbView: string
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
    WorldMilestones,
    WorldDatabases {
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
  pDeletedMilestone: 'milestones',
  pExpiredMilestone: 'milestones',
  aDeletedMilestone: 'milestones',
  dbRows: 'databases',
  dbColumn: 'databases',
  dbView: 'databases',
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

  // M10's 'home' part adds qRecent and the four *Embed pages
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
  } as World['pages']
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
  // M10's 'home' part adds coworkerToday / pOnlyNextWeek (withPendingKeys in createWorld otherwise)
  w.timeOff = { coworker: coworkerEntry, pOnly: pOnlyEntry, member: memberEntry } as World['timeOff']
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

/** M8 'milestones' part (plan/m08 S0.10): milestones + bindings on M3 tasks only (X70: no task inserted). */
async function buildMilestones(w: World): Promise<void> {
  const t = w.tasks
  const bind = async (task: TaskRow, m: MilestoneDbRow) => {
    await bindTask(task, m)
    Object.assign(task, { milestoneId: m.id })
  }
  const p = await makeMilestone({
    project: w.P,
    name: 'Milestone P-ลับ06',
    date: '2026-10-23',
    createdBy: w.lead,
  })
  const pLate = await makeMilestone({
    project: w.P,
    name: 'ส่งมอบรอบแรก P',
    date: '2026-10-02',
    createdBy: w.lead,
  })
  const pDone = await makeMilestone({
    project: w.P,
    name: 'Kickoff P',
    date: '2026-09-15',
    completedOn: '2026-09-16',
    createdBy: w.lead,
  })
  const q = await makeMilestone({
    project: w.Q,
    name: 'Milestone Q-ลับ05',
    date: '2026-10-20',
    createdBy: w.manager,
  })
  const a = await makeMilestone({ project: w.A, name: 'Milestone A', date: '2026-10-30', createdBy: w.lead })
  await bind(t.pChildB, p)
  await bind(t.pLeaf, pLate)
  await bind(t.pDone, pDone)
  await bind(t.qTask, q)
  await bind(t.aTask, a)

  const batches = {
    pDeletedMilestone: randomUUID(),
    pExpiredMilestone: randomUUID(),
    aDeletedMilestone: randomUUID(),
  }
  const pDeleted = await makeMilestone({
    project: w.P,
    name: 'Milestone ที่ลบแล้ว P',
    date: '2026-10-16',
    createdBy: w.lead,
    deleted: { batch: batches.pDeletedMilestone, ...DAY_AGO },
  })
  const pExpired = await makeMilestone({
    project: w.P,
    name: 'Milestone เก่า P',
    date: '2026-09-21',
    createdBy: w.lead,
    deleted: { batch: batches.pExpiredMilestone, daysAgo: 31 },
  })
  const aDeleted = await makeMilestone({
    project: w.A,
    name: 'Milestone ที่ลบแล้ว A',
    date: '2026-10-09',
    createdBy: w.lead,
    deleted: { batch: batches.aDeletedMilestone, ...DAY_AGO },
  })
  await bind(t.pParent, pDeleted) // reads as unbound until restored (M8-D5)

  // M10's 'home' part adds pOverdue / qSoon / pAncient
  w.milestones = { p, pLate, pDone, q, a } as World['milestones']
  w.deletedMilestones = { pDeleted, pExpired, aDeleted }
  Object.assign(w.batches, batches)
}

/** Live-block content of the M10 embed pages (FR-1302: view config only). */
const LIVE_BLOCKS: unknown[] = [
  { type: 'taskView', props: { view: 'BOARD' } },
  { type: 'projectWorkload', props: {} },
]
const HOME_RECENT_AT = new Date('2026-09-30T09:00:00+07:00')
const HOME_OLDER_AT = new Date('2026-09-29T09:00:00+07:00')

/** M10 'home' part (plan/m10 S0.12): data for every home card and the embed pages; keys are added to the objects of
 *  the earlier parts (w.milestones, w.timeOff, w.tasks, w.pages). */
async function buildHome(w: World): Promise<void> {
  const { manager, lead, member, P, Q, A } = w
  const coworker = w.users.coworker!
  const pOnly = w.users.pOnly!

  Object.assign(w.milestones, {
    pOverdue: await makeMilestone({
      project: P,
      name: 'Milestone P-ลับ13',
      date: '2026-09-25',
      createdBy: lead,
    }),
    qSoon: await makeMilestone({
      project: Q,
      name: 'Milestone Q-ลับ15',
      date: '2026-10-05',
      createdBy: manager,
    }),
    pAncient: await makeMilestone({
      project: P,
      name: 'Milestone P-ลับ16',
      date: '2026-08-31',
      createdBy: lead,
    }),
  })

  Object.assign(w.timeOff, {
    coworkerToday: await makeTimeOff({
      user: coworker,
      leaveType: w.leaveTypes.vacation,
      startDate: '2026-09-30',
      note: 'โน้ตลับ-โลก-03',
    }),
    pOnlyNextWeek: await makeTimeOff({
      user: pOnly,
      leaveType: w.leaveTypes.sick,
      startDate: '2026-10-06',
      endDate: '2026-10-07',
      note: 'โน้ตลับ-โลก-04',
    }),
  })

  const pDueThisWeek = await makeTask({
    project: P,
    name: 'งานกำหนดส่ง P-ลับ17',
    dueDate: '2026-10-02',
    createdBy: manager,
  })
  await makeAssignment({ task: pDueThisWeek, user: member })
  Object.assign(w.tasks, { pDueThisWeek })

  const by = { createdBy: manager }
  const embeds = {
    pEmbed: await makePage({ project: P, title: 'หน้าฝังบล็อก P-ลับ19', content: LIVE_BLOCKS, ...by }),
    qEmbed: await makePage({ project: Q, title: 'หน้าฝังบล็อก Q-ลับ20', content: LIVE_BLOCKS, ...by }),
    aEmbed: await makePage({ project: A, title: 'หน้าฝังบล็อก A-ลับ21', content: LIVE_BLOCKS, ...by }),
    wikiEmbed: await makePage({ title: 'หน้าฝังบล็อก W-07', content: LIVE_BLOCKS, ...by }),
  }
  const qRecent = await makePage({ project: Q, title: 'หน้าล่าสุด Q-ลับ18', ...by })
  // qRecent is the newest page: backdate every newer page, then stamp qRecent (X45: APP_NOW is 2026-09-30T10:00).
  await db.update(pages).set({ updatedAt: HOME_OLDER_AT }).where(gt(pages.updatedAt, HOME_OLDER_AT))
  await db.update(pages).set({ updatedAt: HOME_RECENT_AT }).where(eq(pages.id, qRecent.id))
  const stamps = new Map(
    (await db.select({ id: pages.id, updatedAt: pages.updatedAt }).from(pages)).map((r) => [
      r.id,
      r.updatedAt,
    ]),
  )
  const added = { ...embeds, qRecent }
  for (const row of [
    ...Object.values(w.pages),
    ...Object.values(w.deletedPages),
    ...Object.values(w.taskBodies),
    ...Object.values(added),
  ] as { id?: unknown; updatedAt?: Date }[]) {
    const at = typeof row.id === 'string' ? stamps.get(row.id) : undefined
    if (at) row.updatedAt = at
  }
  Object.assign(w.pages, added)
}

/** M11 'databases' part (plan/m11 S0.17). Created by the manager; deleted objects under fresh batches. */
async function buildDatabases(w: World): Promise<void> {
  const { manager, member } = w
  const by = { createdBy: manager }
  const P = await makeDatabase({
    page: w.pages.pPage,
    title: 'ฐานข้อมูล P-ลับ20',
    columns: [
      { type: 'SELECT', name: 'สถานะ', options: ['ยังไม่เริ่ม', 'กำลังทำ', 'เสร็จ'] },
      { type: 'DATE', name: 'วันที่' },
      { type: 'TEXT', name: 'ข้อความ' },
      { type: 'NUMBER', name: 'ตัวเลข' },
      { type: 'MULTI_SELECT', name: 'หลาย', options: ['แท็ก A', 'แท็ก B'] },
      { type: 'CHECKBOX', name: 'ติ๊ก' },
      { type: 'PERSON', name: 'คน' },
      { type: 'URL', name: 'ลิงก์' },
    ],
    views: [
      { type: 'TABLE', name: 'ตาราง' },
      { type: 'KANBAN', name: 'คัมบัง', config: (c) => ({ groupByColumnId: c['สถานะ']!.id }) },
      { type: 'CALENDAR', name: 'ปฏิทิน', config: (c) => ({ dateColumnId: c['วันที่']!.id }) },
    ],
    ...by,
  })
  const c = P.columns
  const status = P.options['สถานะ']!
  const multi = P.options['หลาย']!
  const dbRows = randomUUID()
  const dbColumn = randomUUID()
  const dbView = randomUUID()
  const deletedColumn = (
    await makeDbColumn({
      database: P.database,
      type: 'TEXT',
      name: 'ลบแล้ว',
      deleted: { batch: dbColumn, ...DAY_AGO },
    })
  ).column
  const deletedView = await makeDbView({
    database: P.database,
    type: 'TABLE',
    name: 'มุมมองที่ลบ',
    deleted: { batch: dbView, ...DAY_AGO },
  })
  const pRow1 = await makeDbRow({
    database: P.database,
    title: 'แถว P-ลับ21',
    cells: {
      [c['สถานะ']!.id]: status['กำลังทำ'],
      [c['วันที่']!.id]: '2026-09-30',
      [c['ข้อความ']!.id]: 'ค่าเซลล์ P-ลับ28',
      [c['ตัวเลข']!.id]: '1234.5',
      [c['หลาย']!.id]: [multi['แท็ก A']],
      [c['ติ๊ก']!.id]: true,
      [c['คน']!.id]: [member.id],
      [c['ลิงก์']!.id]: 'https://example.com/p',
      [deletedColumn.id]: 'ค่าในคอลัมน์ที่ลบ P',
    },
    ...by,
  })
  const pRow2 = await makeDbRow({
    database: P.database,
    title: 'แถว P-2',
    cells: { [c['สถานะ']!.id]: status['ยังไม่เริ่ม'] },
    ...by,
  })
  const pRow3 = await makeDbRow({ database: P.database, title: 'แถว P-3', ...by })
  const pRowDeleted = await makeDbRow({
    database: P.database,
    title: 'แถวลบแล้ว P',
    deleted: { batch: dbRows, ...DAY_AGO },
    ...by,
  })
  const pRowDeletedBody = await makeRowBody({
    row: pRowDeleted,
    content: 'เนื้อหาแถวที่ลบ P',
    deleted: { batch: dbRows, ...DAY_AGO },
    ...by,
  })
  const bodyNoImage = await makeRowBody({ row: pRow1, content: 'เนื้อหาแถว P-ลับ22', ...by })
  const pRowImage = await makeFile({ page: bodyNoImage, uploadedBy: manager })
  const bodyContent = [
    { type: 'paragraph', content: 'เนื้อหาแถว P-ลับ22' },
    { type: 'image', props: { url: `/api/files/${pRowImage.id}`, name: 'image.png' } },
  ]
  const [pRowBody] = await db
    .update(pages)
    .set({ content: bodyContent, contentText: extractContentText(bodyContent) })
    .where(eq(pages.id, bodyNoImage.id))
    .returning()

  const one = async (page: { id: string }, title: string, rowTitle: string) => {
    const made = await makeDatabase({ page, title, ...by })
    const row = await makeDbRow({ database: made.database, title: rowTitle, ...by })
    return { database: made.database, row }
  }
  const detached = await makeDatabase({
    page: w.pages.pPage,
    title: 'ฐานข้อมูลหลุด P',
    detached: true,
    ...by,
  })
  const task = await one(w.taskBodies.pLeafBody, 'ฐานข้อมูลงาน P', 'แถวงาน P')
  const a = await one(w.pages.aPage, 'ฐานข้อมูล A-ลับ26', 'แถว A-ลับ27')
  const q = await one(w.pages.qPage, 'ฐานข้อมูล Q-ลับ23', 'แถว Q-ลับ24')
  const wiki = await one(w.pages.wiki, 'ฐานข้อมูล W-08', 'แถว W-25')
  const wikiProt = await one(w.pages.wikiProtected, 'ฐานข้อมูลล็อก W-09', 'แถวล็อก W-10')
  const deletedPage = await one(w.deletedPages.pDeleted, 'ฐานข้อมูลในหน้าที่ลบ P', 'แถวในหน้าที่ลบ P')

  w.databases = {
    dbP: P.database,
    dbPColumns: {
      title: c['ชื่อ']!,
      status: c['สถานะ']!,
      date: c['วันที่']!,
      text: c['ข้อความ']!,
      number: c['ตัวเลข']!,
      multi: c['หลาย']!,
      check: c['ติ๊ก']!,
      person: c['คน']!,
      url: c['ลิงก์']!,
      deleted: deletedColumn,
    },
    dbPOptions: {
      todo: status['ยังไม่เริ่ม']!,
      doing: status['กำลังทำ']!,
      done: status['เสร็จ']!,
      tagA: multi['แท็ก A']!,
      tagB: multi['แท็ก B']!,
    },
    dbPViews: {
      table: P.views['ตาราง']!,
      kanban: P.views['คัมบัง']!,
      calendar: P.views['ปฏิทิน']!,
      deleted: deletedView,
    },
    pRow1,
    pRow2,
    pRow3,
    pRowNoBody: pRow2,
    pRowBody: pRowBody!,
    pRowImage,
    pRowDeleted,
    pRowDeletedBody,
    dbPDetached: detached.database,
    dbTask: task.database,
    taskRow: task.row,
    dbA: a.database,
    aRow: a.row,
    aRowBody: await makeRowBody({ row: a.row, content: 'เนื้อหาแถว A-ลับ29', ...by }),
    dbQ: q.database,
    qRow: q.row,
    dbWiki: wiki.database,
    wikiRow: wiki.row,
    wikiRowBody: await makeRowBody({ row: wiki.row, content: 'เนื้อหาแถว W-11', ...by }),
    dbWikiProt: wikiProt.database,
    wikiProtRow: wikiProt.row,
    dbDeletedPage: deletedPage.database,
    deletedPageRow: deletedPage.row,
  }
  Object.assign(w.batches, { dbRows, dbColumn, dbView })
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
  milestones: buildMilestones,
  home: buildHome,
  databases: buildDatabases,
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
    milestones: notBuilt('milestones', 'milestones'),
    deletedMilestones: notBuilt('milestones', 'deletedMilestones'),
    databases: notBuilt('databases', 'databases'),
  }
  for (const p of WORLD_PART_ORDER) if (parts.has(p)) await BUILDERS[p]!(w)
  // M10: keys the 'home' part adds to earlier parts' objects throw clearly without it.
  if (!parts.has('home')) {
    w.tasks = withPendingKeys(w.tasks, 'home', 'tasks', ['pDueThisWeek'])
    w.pages = withPendingKeys(w.pages, 'home', 'pages', [
      'qRecent',
      'pEmbed',
      'qEmbed',
      'aEmbed',
      'wikiEmbed',
    ])
    w.timeOff = withPendingKeys(w.timeOff, 'home', 'timeOff', ['coworkerToday', 'pOnlyNextWeek'])
    w.milestones = withPendingKeys(w.milestones, 'home', 'milestones', ['pOverdue', 'qSoon', 'pAncient'])
  }
  return w
}
