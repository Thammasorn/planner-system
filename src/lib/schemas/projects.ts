// src/lib/schemas/projects.ts — project inputs shared by forms and actions (FR-401, FR-405..FR-407, M2-D15).
// Only the name is required (SPEC §1.3 P1); defaults (colour #2F5597, CONFIRMED) come from the DB.
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { colorSchema, optionalText, userIdSchema } from './common'

export const projectName = z
  .string()
  .trim()
  .min(1, { error: th.projects.errors.nameRequired })
  .max(200, { error: th.projects.errors.nameTooLong })

export const certaintySchema = z.enum(['CONFIRMED', 'TENTATIVE'])

export const createProjectSchema = z.object({
  name: projectName,
  clientId: z.uuid().nullable().optional(),
  code: optionalText(20, th.projects.errors.codeTooLong),
  color: colorSchema.optional(),
  certainty: certaintySchema.optional(),
  certaintyNote: optionalText(500, th.projects.errors.noteTooLong),
  leadUserId: userIdSchema.nullable().optional(),
})

/** undefined = unchanged; null = clear (clientId, code, certaintyNote). */
export const updateProjectSchema = z.object({
  projectId: z.uuid(),
  name: projectName.optional(),
  clientId: z.uuid().nullable().optional(),
  code: optionalText(20, th.projects.errors.codeTooLong),
  color: colorSchema.optional(),
  certainty: certaintySchema.optional(),
  certaintyNote: optionalText(500, th.projects.errors.noteTooLong),
})

export const projectIdSchema = z.object({ projectId: z.uuid() })

/** FR-407: the server compares `confirmName.trim()` with the project name. */
export const deleteProjectSchema = z.object({ projectId: z.uuid(), confirmName: z.string().max(400) })

export type CreateProjectInput = z.input<typeof createProjectSchema>
export type UpdateProjectInput = z.input<typeof updateProjectSchema>
export type ProjectIdInput = z.input<typeof projectIdSchema>
export type DeleteProjectInput = z.input<typeof deleteProjectSchema>
