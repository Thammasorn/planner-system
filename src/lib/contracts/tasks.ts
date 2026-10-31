// src/lib/contracts/tasks.ts — isomorphic, type-only task DTOs (plan/m03 S0.5, SPEC §7.8). The API speaks these; no
// DB row types cross the wire. Forward compatibility (M3-D42): later milestones extend these types additively
// (M6 `SetTaskStatusResult.released`, M8 `TaskDTO.milestoneId`/`lateForMilestone`, `ProjectTasksResponse.milestones`,
// `TaskCard.milestoneId`, `TeamTasksResponse.milestonesByProject`). Keep every result an object.
import type { Certainty, ISODate, TaskStatusCategory } from '@/domain/types'

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
  notes: string | null
  startDate: ISODate | null
  dueDate: ISODate | null
  certaintyOverride: Certainty | null
  completedOn: ISODate | null
  assignees: TaskAssigneeDTO[]
  statusId: string
  /** BR-86 counts from SQL (X73). */
  blockers: { open: number; total: number }
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
  // M6 appends `released: ReleasedLoad | null` (M6-D16, C21) — do not add it here
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
}

/** GET /api/tasks/my (X22, M3-D8). */
export interface MyTasksResponse {
  groups: { project: { id: string; name: string; color: string; certainty: Certainty }; tasks: MyTaskDTO[] }[]
  count: number
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
}

/** GET /api/tasks (X75, M3-D33). */
export interface TeamTasksResponse {
  cards: TaskCard[]
  /** Only visible projects present in `cards`. */
  projects: { id: string; name: string; color: string }[]
  /** Same projects only (status menus, FR-666). */
  statusesByProject: Record<string, TaskStatusDTO[]>
  nextCursor: string | null
}
