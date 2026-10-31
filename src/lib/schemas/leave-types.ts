// src/lib/schemas/leave-types.ts — leave type management (FR-902, M5-D10, X48). Order keys are generated on the
// server; the only client-supplied key is the one deleteLeaveType returned and restoreLeaveType sends back.
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { colorSchema } from './common'
import { POSITION_KEY } from './positions'

const leaveTypeName = z
  .string()
  .trim()
  .min(1, { error: th.leaveTypes.errors.nameRequired })
  .max(60, { error: th.leaveTypes.errors.nameTooLong })

export const createLeaveTypeSchema = z.object({ name: leaveTypeName, color: colorSchema })
export const updateLeaveTypeSchema = z.object({
  id: z.uuid(),
  name: leaveTypeName.optional(),
  color: colorSchema.optional(),
})
export const moveLeaveTypeSchema = z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) })
export const leaveTypeIdSchema = z.object({ id: z.uuid() })
export const setLeaveTypeArchivedSchema = z.object({ id: z.uuid(), archived: z.boolean() })
export const restoreLeaveTypeSchema = z.object({
  id: z.uuid(),
  name: leaveTypeName,
  color: colorSchema,
  position: z.string().regex(POSITION_KEY),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
})

export type CreateLeaveTypeInput = z.input<typeof createLeaveTypeSchema>
export type UpdateLeaveTypeInput = z.input<typeof updateLeaveTypeSchema>
