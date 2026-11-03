// src/lib/schemas/milestones.ts — milestone action inputs (SPEC §4.7 FR-701…708, §7.5; plan/m08 S0.4, M8-D3/D14/D19).
// Names trimmed 1–200 (DB check milestones_name_check mirrors it); description ≤ 2 000, blank → null. X47: z.uuid(),
// z.iso.date(), Thai only via th.*. "completedOn ≤ today" is checked in the service (needs serverToday()).
import { th } from '@/i18n/th'
import { MILESTONE_COLORS } from '@/lib/contracts/milestones'
import { z } from '@/lib/z'
import { isoDateSchema } from './dates'

export const MILESTONE_NAME_MAX = 200
export const MILESTONE_DESCRIPTION_MAX = 2_000
/** Bulk link / revert size limit (FR-614). */
export const MILESTONE_LINK_MAX = 500

export const zMilestoneName = z
  .string({ error: th.milestones.errors.nameRequired })
  .trim()
  .min(1, { error: th.milestones.errors.nameRequired })
  .max(MILESTONE_NAME_MAX, { error: th.milestones.errors.nameTooLong })
export const zMilestoneDate = isoDateSchema(th.milestones.errors.dateRequired)
export const zMilestoneDescription = z
  .string()
  .max(MILESTONE_DESCRIPTION_MAX, { error: th.milestones.errors.descriptionTooLong })
  .transform((s) => (s.trim() === '' ? null : s))
  .nullable()

/** M11.1 (FR-709): one of the five line colours. */
export const zMilestoneColor = z.enum(MILESTONE_COLORS)

export const createMilestoneSchema = z.object({
  projectId: z.uuid(),
  name: zMilestoneName,
  date: zMilestoneDate,
  description: zMilestoneDescription.optional(),
  /** absent = PURPLE (the DB default) */
  color: zMilestoneColor.optional(),
})

export const milestonePatchSchema = z
  .object({
    name: zMilestoneName.optional(),
    date: zMilestoneDate.optional(),
    description: zMilestoneDescription.optional(),
    color: zMilestoneColor.optional(),
    completed: z.boolean().optional(),
    /** Exact undo of complete/reopen (M8-D19); never together with `completed`; ≤ today checked in the service. */
    completedOn: z.iso.date().nullable().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), { error: th.milestones.errors.emptyPatch })
  .refine((p) => p.completed === undefined || p.completedOn === undefined, {
    error: th.milestones.errors.completedConflict,
    path: ['completedOn'],
  })

export const updateMilestoneSchema = z.object({ milestoneId: z.uuid(), patch: milestonePatchSchema })
export const deleteMilestoneSchema = z.object({ milestoneId: z.uuid() })
export const restoreMilestoneBatchSchema = z.object({ batch: z.uuid() })

export const linkTasksToMilestoneSchema = z.object({
  taskIds: z.array(z.uuid()).min(1).max(MILESTONE_LINK_MAX),
  milestoneId: z.uuid().nullable(),
})

export const revertTaskMilestonesSchema = z
  .object({
    items: z
      .array(z.object({ taskId: z.uuid(), milestoneId: z.uuid().nullable() }))
      .min(1)
      .max(MILESTONE_LINK_MAX),
  })
  .refine((v) => new Set(v.items.map((i) => i.taskId)).size === v.items.length, {
    error: th.milestones.errors.duplicateTask,
    path: ['items'],
  })

export type CreateMilestoneInput = z.input<typeof createMilestoneSchema>
export type MilestonePatch = z.input<typeof milestonePatchSchema>
export type UpdateMilestoneInput = z.input<typeof updateMilestoneSchema>
export type LinkTasksToMilestoneInput = z.input<typeof linkTasksToMilestoneSchema>
export type RevertTaskMilestonesInput = z.input<typeof revertTaskMilestonesSchema>
