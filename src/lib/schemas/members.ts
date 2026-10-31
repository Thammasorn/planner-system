// src/lib/schemas/members.ts — membership inputs (FR-403, BR-62). User ids are text (M2-D14).
import { z } from '@/lib/z'
import { userIdSchema } from './common'

export const projectRoleSchema = z.enum(['LEAD', 'MEMBER'])

export const addMemberSchema = z.object({
  projectId: z.uuid(),
  userId: userIdSchema,
  role: projectRoleSchema.default('MEMBER'),
})
export const changeMemberRoleSchema = z.object({
  projectId: z.uuid(),
  userId: userIdSchema,
  role: projectRoleSchema,
})
export const removeMemberSchema = z.object({ projectId: z.uuid(), userId: userIdSchema })

export type AddMemberInput = z.input<typeof addMemberSchema>
export type ChangeMemberRoleInput = z.input<typeof changeMemberRoleSchema>
export type RemoveMemberInput = z.input<typeof removeMemberSchema>
