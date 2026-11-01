// src/lib/schemas/tasks.ts — task, assignment, status, blocker and team-task inputs shared by forms and actions
// (plan/m03 S0.4, SPEC §7.8, r4 §29–§30). Only the name is required to create a task (SPEC §1.3 P1, M3-D15).
import { compareISO } from '@/domain/dates'
import { STATUS_COLORS } from '@/domain/status'
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { userIdSchema } from './common'
import { certaintySchema } from './projects'

/** Better Auth text ids (M2-D14). */
export const zUserId = userIdSchema
export const zCertainty = certaintySchema
/** JS `trim` also removes NBSP, which the DB check would accept (r5 M3-01, R7). */
export const zTaskName = z
  .string()
  .trim()
  .min(1, { error: th.tasks.errors.nameRequired })
  .max(500, { error: th.tasks.errors.nameTooLong })
const zTaskIds = z.array(z.uuid()).min(1).max(500)
/** M3-D3: assignment re-point applied in the same transaction as a tree change (BR-31, X20). */
export const zTransfer = z.object({
  assignmentIds: z.array(z.uuid()).min(1).max(100),
  fromTaskId: z.uuid(),
  toTaskId: z.uuid(),
})

export const createTaskSchema = z.object({
  projectId: z.uuid(),
  parentId: z.uuid().nullable().default(null),
  /** undefined = append at the end, null = first child (M3-D11: intent, never order keys). */
  afterId: z.uuid().nullable().optional(),
  name: zTaskName,
  /** Column quick add (FR-664); default status = BR-81. */
  statusId: z.uuid().optional(),
})

/**
 * undefined = unchanged, null = clear. At least one field. M6.1-D12: no `notes` (FR-692) — an unknown key is stripped,
 * so a notes-only patch fails the "at least one field" refine (400).
 */
export const taskPatchSchema = z
  .object({
    name: zTaskName.optional(),
    startDate: z.iso.date().nullable().optional(),
    dueDate: z.iso.date().nullable().optional(),
    certaintyOverride: zCertainty.nullable().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined))
  .refine((p) => !p.startDate || !p.dueDate || compareISO(p.dueDate, p.startDate) >= 0, {
    error: th.tasks.errors.dueBeforeStart,
    path: ['dueDate'],
  })
export const updateTaskSchema = z.object({ taskId: z.uuid(), patch: taskPatchSchema })
export type TaskPatch = z.input<typeof taskPatchSchema>

/** indentTask / outdentTask */
export const taskRefSchema = z.object({ taskId: z.uuid() })
export const moveTaskSchema = z.object({
  taskId: z.uuid(),
  parentId: z.uuid().nullable(),
  afterId: z.uuid().nullable(),
  transfer: zTransfer.optional(),
})
export const completeTaskSchema = z.object({ taskIds: zTaskIds, withChildren: z.boolean().default(false) })
export const uncompleteTaskSchema = z.object({ taskIds: zTaskIds })
export const deleteTaskTreeSchema = z.object({ taskIds: zTaskIds, transfer: zTransfer.optional() })
export const restoreTaskBatchSchema = z.object({ batch: z.uuid(), transfer: zTransfer.optional() })

export const assignSchema = z.object({ taskIds: zTaskIds, userId: zUserId })
export const unassignSchema = z.object({ assignmentIds: z.array(z.uuid()).min(1).max(500) })
export const restoreAssignmentBatchSchema = z.object({ batch: z.uuid() })

/** FR-404 combined op (X16, M3-D14). */
export const removeMemberWithAssignmentsSchema = z.object({ projectId: z.uuid(), userId: zUserId })
export const restoreRemovedMemberSchema = z.object({
  projectId: z.uuid(),
  userId: zUserId,
  batch: z.uuid().nullable(),
  member: z.object({
    role: z.enum(['LEAD', 'MEMBER']),
    addedBy: zUserId.nullable(),
    addedAt: z.iso.datetime({ offset: true }),
  }),
})

// ── SPEC v3.1: statuses, blockers, team tasks (§7.8) ──

export const zStatusCategory = z.enum(['TODO', 'IN_PROGRESS', 'WAITING', 'DONE'])
/** Fixed palette (M3-D25). */
export const zStatusColor = z.enum(STATUS_COLORS)
export const zStatusName = z
  .string()
  .trim()
  .min(1, { error: th.tasks.status.errors.nameRequired })
  .max(40, { error: th.tasks.status.errors.nameTooLong })

export const setTaskStatusSchema = z.object({
  taskIds: zTaskIds,
  statusId: z.uuid(),
  withChildren: z.boolean().default(false),
})
/** M3-D28: the exact undo of setTaskStatus / completeTask / uncompleteTask. */
export const revertTaskStatusSchema = z.object({
  items: z
    .array(z.object({ taskId: z.uuid(), statusId: z.uuid(), completedOn: z.iso.date().nullable() }))
    .min(1)
    .max(500),
})
export const createTaskStatusSchema = z.object({
  projectId: z.uuid(),
  name: zStatusName,
  category: zStatusCategory,
  color: zStatusColor,
  afterId: z.uuid().nullable().optional(),
})
export const updateTaskStatusSchema = z.object({
  statusId: z.uuid(),
  patch: z
    .object({
      name: zStatusName.optional(),
      category: zStatusCategory.optional(),
      color: zStatusColor.optional(),
    })
    .refine((p) => Object.values(p).some((v) => v !== undefined)),
})
export const reorderTaskStatusSchema = z.object({ statusId: z.uuid(), afterId: z.uuid().nullable() })
export const deleteTaskStatusSchema = z.object({ statusId: z.uuid(), moveToStatusId: z.uuid().optional() })
/** X72 + M3-D29. */
export const restoreTaskStatusBatchSchema = z.object({
  batch: z.uuid(),
  moveToStatusId: z.uuid().nullable(),
  moved: z
    .array(z.object({ taskId: z.uuid(), fromStatusId: z.uuid(), completedOn: z.iso.date().nullable() }))
    .max(20_000),
})
export const addTaskBlockerSchema = z
  .object({ taskId: z.uuid(), blockerTaskId: z.uuid() })
  .refine((v) => v.taskId !== v.blockerTaskId, {
    error: th.tasks.blockers.errors.self,
    path: ['blockerTaskId'],
  })
/** `task_blockers.id` */
export const removeTaskBlockerSchema = z.object({ blockerId: z.uuid() })

/** GET /api/tasks (X75, M3-D33). `category` may repeat in the URL (see teamTasksQueryFromSearchParams). */
export const teamTasksQuerySchema = z.object({
  projectId: z.uuid().optional(),
  userId: zUserId.optional(),
  positionId: z.uuid().optional(),
  category: z.array(zStatusCategory).optional(),
  blocked: z.stringbool().default(false),
  includeDone: z.stringbool().default(false),
  cursor: z.string().max(400).optional(),
})
export type TeamTasksQuery = z.output<typeof teamTasksQuerySchema>
export type TeamTasksQueryInput = z.input<typeof teamTasksQuerySchema>

/**
 * Raw input for `teamTasksQuerySchema` from a URL: every repeated `category` is kept (the `route()` wrapper's
 * `Object.fromEntries` would keep only the last one), other keys take their single value.
 */
export function teamTasksQueryFromSearchParams(sp: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of sp) if (key !== 'category') out[key] = value
  const categories = sp.getAll('category')
  if (categories.length > 0) out.category = categories
  return out
}

/** The inverse, for the client fetch / URL mirror: omits undefined and default (false) flags. */
export function teamTasksSearchParams(q: TeamTasksQueryInput): URLSearchParams {
  const sp = new URLSearchParams()
  if (q.projectId) sp.set('projectId', q.projectId)
  if (q.userId) sp.set('userId', q.userId)
  if (q.positionId) sp.set('positionId', q.positionId)
  for (const c of q.category ?? []) sp.append('category', c)
  if (q.blocked !== undefined && q.blocked !== 'false' && q.blocked !== '0') sp.set('blocked', q.blocked)
  if (q.includeDone !== undefined && q.includeDone !== 'false' && q.includeDone !== '0') {
    sp.set('includeDone', q.includeDone)
  }
  if (q.cursor) sp.set('cursor', q.cursor)
  return sp
}

export type CreateTaskInput = z.input<typeof createTaskSchema>
export type UpdateTaskInput = z.input<typeof updateTaskSchema>
export type MoveTaskInput = z.input<typeof moveTaskSchema>
export type AssignInput = z.input<typeof assignSchema>
export type SetTaskStatusInput = z.input<typeof setTaskStatusSchema>
export type RevertTaskStatusInput = z.input<typeof revertTaskStatusSchema>
export type CreateTaskStatusInput = z.input<typeof createTaskStatusSchema>
export type UpdateTaskStatusInput = z.input<typeof updateTaskStatusSchema>
export type RestoreTaskStatusBatchInput = z.input<typeof restoreTaskStatusBatchSchema>
export type RestoreRemovedMemberInput = z.input<typeof restoreRemovedMemberSchema>
