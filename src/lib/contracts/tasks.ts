// src/lib/contracts/tasks.ts — isomorphic, type-only task DTOs (plan/m03 S0.5, SPEC §7.8). The API speaks these; no
// DB row types cross the wire. Forward compatibility (M3-D42): later milestones extend these types additively
// (M6 `SetTaskStatusResult.released`, M8 `TaskDTO.milestoneId`/`lateForMilestone`, `ProjectTasksResponse.milestones`,
// `TaskCard.milestoneId`, `TeamTasksResponse.milestonesByProject` — added in M8 S0.3). Keep every result an object.
import type { Cd, Certainty, ISODate, TaskStatusCategory } from '@/domain/types'
import type { MilestoneColor, MilestoneRef } from './milestones'

export type TaskDepth = 0 | 1 | 2

export interface TaskAssigneeDTO {
  assignmentId: string
  userId: string
}

export interface TaskDTO {
  id: string
  projectId: string
  parentId: string | null
  depth: TaskDepth
  /** Fractional key (COLLATE "C"); compare with `<`, never localeCompare (X48). */
  position: string
  name: string
  // notes: removed in M6.1 (FR-692, M6.1-D12) — details live in the task body (TASK page)
  startDate: ISODate | null
  dueDate: ISODate | null
  certaintyOverride: Certainty | null
  completedOn: ISODate | null
  assignees: TaskAssigneeDTO[]
  statusId: string
  /** BR-86 counts from SQL (X73). */
  blockers: { open: number; total: number }
  /** FR-691 (M6.1-D11): the task has a live, non-blank body (text, image or file) — 📄 marker. */
  hasBody: boolean
  /** M8 (M8-D13): the LIVE milestone (a deleted milestone reads as null, M8-D5). */
  milestoneId: string | null
  /** BR-71 (M8-D6). */
  lateForMilestone: boolean
}

export interface TaskStatusDTO {
  id: string
  projectId: string
  name: string
  color: string
  category: TaskStatusCategory
  position: string
}

export type StatusRef = Pick<TaskStatusDTO, 'id' | 'name' | 'color' | 'category'>

/** `taskId` is blocked by `blockerTaskId`. */
export interface BlockerEdgeDTO {
  id: string
  taskId: string
  blockerTaskId: string
}

/** GET /api/projects/[id]/tasks (M3-D37). */
export interface ProjectTasksResponse {
  project: { id: string; name: string; certainty: Certainty; archived: boolean }
  /** canEdit = !archived; canManage = role ∈ {MANAGER, LEAD} && !archived. */
  viewer: { role: 'MANAGER' | 'LEAD' | 'MEMBER'; canEdit: boolean; canManage: boolean }
  members: { userId: string; role: 'LEAD' | 'MEMBER' }[]
  /** Flat, live tasks only (X62); the client builds the tree. */
  tasks: TaskDTO[]
  /** Live statuses of the project, ORDER BY position, id. */
  statuses: TaskStatusDTO[]
  /** Live edges between live tasks of this project (same project only, D12). */
  blockerEdges: BlockerEdgeDTO[]
  /** M8 (M8-D13): live milestones of the project, date then id. */
  milestones: MilestoneRef[]
}

export interface AssignmentTransfer {
  assignmentIds: string[]
  fromTaskId: string
  toTaskId: string
}

/** `afterId` null = first child. */
export interface TreePlacement {
  parentId: string | null
  afterId: string | null
}

export interface CreateTaskResult {
  task: TaskDTO
  transfer: AssignmentTransfer | null
}

export interface UpdateTaskResult {
  task: TaskDTO
}

export type TreeMoveResult =
  | { changed: false }
  | { changed: true; task: TaskDTO; previous: TreePlacement; transfer: AssignmentTransfer | null }

/** setTaskStatus, completeTask, uncompleteTask, revertTaskStatus (X71, M3-D28). */
export interface SetTaskStatusResult {
  projectId: string
  /** null for revertTaskStatus (per-item targets). */
  statusId: string | null
  changed: { taskId: string; previous: { statusId: string; completedOn: ISODate | null } }[]
  /** FR-608 prompt (single task, DONE target, !withChildren). */
  openDescendantIds: string[]
  /** BR-52 (M6-D16): load released by tasks newly entering DONE in this call; null when 0 and for revert/uncomplete. */
  released: ReleasedLoad | null
}

/** BR-52: X = future cd after the completion week, N = distinct weeks (M6-D16). */
export interface ReleasedLoad {
  cd: Cd
  weeks: number
}

export interface DeleteTaskTreeResult {
  projectId: string
  batch: string
  rootIds: string[]
  deletedIds: string[]
  transfer: AssignmentTransfer | null
}

export interface RestoreTaskBatchResult {
  projectId: string
  restoredIds: string[]
  transfer: AssignmentTransfer | null
}

export interface AssignResult {
  projectId: string
  created: { assignmentId: string; taskId: string }[]
  addedMember: boolean
  skippedParentIds: string[]
  alreadyAssignedIds: string[]
}

export interface UnassignResult {
  projectId: string
  batch: string
  taskIds: string[]
}

export interface RestoreAssignmentBatchResult {
  projectId: string
  restored: { assignmentId: string; taskId: string }[]
  skipped: number
}

export interface RemovedMemberSnapshot {
  role: 'LEAD' | 'MEMBER'
  addedBy: string | null
  /** ISO datetime with offset. */
  addedAt: string
}

export interface RemoveMemberWithAssignmentsResult {
  batch: string | null
  member: RemovedMemberSnapshot
  unassignedTaskCount: number
}

export interface RestoreRemovedMemberResult {
  restoredAssignments: number
  skipped: number
}

export interface MyTaskDTO {
  id: string
  projectId: string
  name: string
  parentName: string | null
  startDate: ISODate | null
  dueDate: ISODate | null
  status: StatusRef
  /** FR-691 (M6.1-D11): the task has a TASK body page. */
  hasBody: boolean
}

// ── M9 (FR-1009 buckets, M9-D17, X95) ──

export type MyBucketKey = 'THIS_WEEK' | 'NEXT_WEEK' | 'LATER' | 'UNPLANNED'

export interface MyBucketTask extends MyTaskDTO {
  project: { id: string; name: string; color: string; certainty: Certainty }
  /** Earliest week ≥ weekStart(today) with my counted cd > 0; null when UNPLANNED. */
  firstWeek: ISODate | null
  /** My cd in firstWeek; null when UNPLANNED. */
  plannedCd: Cd | null
}

/** GET /api/tasks/my from M9 (replaced M3's MyTasksResponse, X95): 4 buckets always, in key order;
 *  count = THIS_WEEK length (= the sidebar number). */
export interface MyTaskBucketsResponse {
  today: ISODate
  buckets: { key: MyBucketKey; tasks: MyBucketTask[] }[]
  count: number
  /** M6.1-D12/D25 (FR-1606 "/my เปลี่ยนสถานะ"): live statuses of the projects of the listed tasks only. */
  statusesByProject: Record<string, TaskStatusDTO[]>
}

// ── SPEC v3.1 ──

/** GET /api/projects/[id]/statuses. `usage` = live tasks per status id. */
export interface ProjectStatusesResponse {
  statuses: TaskStatusDTO[]
  usage: Record<string, number>
  canManage: boolean
}

export interface TaskStatusResult {
  status: TaskStatusDTO
}

export interface ReorderTaskStatusResult {
  status: TaskStatusDTO
  previousAfterId: string | null
}

export interface DeleteTaskStatusResult {
  projectId: string
  batch: string
  moveToStatusId: string | null
  moved: { taskId: string; fromStatusId: string; completedOn: ISODate | null }[]
}

export interface RestoreTaskStatusBatchResult {
  projectId: string
  status: TaskStatusDTO
  restored: number
  skipped: number
}

export interface AddTaskBlockerResult {
  projectId: string
  edge: BlockerEdgeDTO
  created: boolean
}

/** No batch (M3-D31, §7.8). */
export interface RemoveTaskBlockerResult {
  projectId: string
  edgeId: string
  taskId: string
  blockerTaskId: string
}

/** SPEC §7.8 minus milestoneId (M8, M3-D37). */
export interface TaskCard {
  id: string
  projectId: string
  name: string
  parentPath: string[]
  status: StatusRef
  assigneeIds: string[]
  dueDate: ISODate | null
  certainty: Certainty
  completed: boolean
  /** Counts only — names only in the project's own panel. */
  blockers: { open: number; total: number }
  /** FR-691 (M6.1-D11): the task has a TASK body page. */
  hasBody: boolean
  /** SPEC §7.8 (M8-D15): live milestone id; name via `TeamTasksResponse.milestonesByProject`. */
  milestoneId: string | null
}

/** M11.4 (FR-668/669): a /tasks card — TaskCard + what the ตาราง / ปฏิทิน views read. */
export interface TeamTaskCard extends TaskCard {
  /** the explicit start date (table column, calendar bar BR-103) */
  startDate: ISODate | null
  /** BR-51 completion day (Asia/Bangkok) — null while open (the calendar's done styling) */
  completedOn: ISODate | null
  /** Σ counted planned load (BR-50) of the task's OWN live assignees in today ± 3 years (X66 horizon), integer cd */
  plannedCd: Cd
}

/** M11.4 (FR-668): a milestone ref with its colour (◆ in the table). */
export type TeamMilestoneRef = MilestoneRef & { color: MilestoneColor }

/** GET /api/tasks (X75, M3-D33). */
export interface TeamTasksResponse {
  cards: TeamTaskCard[]
  /** Only visible projects present in `cards`. */
  projects: { id: string; name: string; color: string }[]
  /** Same projects only (status menus, FR-666). */
  statusesByProject: Record<string, TaskStatusDTO[]>
  /** M8 (M8-D15): live milestones of the same projects only (date then id). */
  milestonesByProject: Record<string, TeamMilestoneRef[]>
  nextCursor: string | null
}
