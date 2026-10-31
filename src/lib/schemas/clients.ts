// src/lib/schemas/clients.ts — client CRUD inputs shared by forms and actions (FR-301, FR-302, M2-D07, M2-D15).
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { colorSchema, optionalText } from './common'

export const clientName = z
  .string()
  .trim()
  .min(1, { error: th.clients.errors.nameRequired })
  .max(120, { error: th.clients.errors.nameTooLong })

const clientFields = {
  code: optionalText(20, th.projects.errors.codeTooLong),
  color: colorSchema.nullable().optional(),
  note: optionalText(2000, th.projects.errors.noteTooLong),
}

export const createClientSchema = z.object({ name: clientName, ...clientFields })
/** undefined = unchanged; null = clear (code, color, note). */
export const updateClientSchema = z.object({
  clientId: z.uuid(),
  name: clientName.optional(),
  ...clientFields,
})
export const clientIdSchema = z.object({ clientId: z.uuid() })

export type CreateClientInput = z.input<typeof createClientSchema>
export type UpdateClientInput = z.input<typeof updateClientSchema>
export type ClientIdInput = z.input<typeof clientIdSchema>
