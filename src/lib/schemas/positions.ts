// src/lib/schemas/positions.ts — position CRUD schemas (FR-208, M1-D14). Keys are generated on the server (X48);
// the only client-supplied key is the one returned by deletePosition and sent back by restorePosition.
import { th } from '@/i18n/th'
import { z } from '@/lib/z'

export const positionName = z.string().trim().min(1, { error: th.positions.nameRequired }).max(100)
/** fractional-indexing key shape (base-62 digits, integer head letter). */
export const POSITION_KEY = /^[A-Za-z][0-9A-Za-z]{1,200}$/

export const createPositionInput = z.object({ name: positionName })
export const renamePositionInput = z.object({ id: z.uuid(), name: positionName })
export const movePositionInput = z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) })
export const deletePositionInput = z.object({ id: z.uuid() })
export const restorePositionInput = z.object({
  id: z.uuid(),
  name: positionName,
  position: z.string().regex(POSITION_KEY),
})

export type CreatePositionInput = z.input<typeof createPositionInput>
export type RenamePositionInput = z.input<typeof renamePositionInput>
export type MovePositionInput = z.input<typeof movePositionInput>
export type DeletePositionInput = z.input<typeof deletePositionInput>
export type RestorePositionInput = z.input<typeof restorePositionInput>
