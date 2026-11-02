// src/domain/database/limits.ts — FR-1475 limits, the "@me" token, the option palette and the domain error
// (SPEC §5.11, plan/m11 S1.1, M11-D35, M11-D37).
import type { MeToken, OptionColor } from '../types'

/** The single source of the FR-1475 numbers lives next to the zod schemas (plain constants, no zod). */
export { DB_LIMITS } from '@/lib/schemas/db-limits'

/** PERSON filter value meaning "the viewer" (BR-95 "ฉัน"). */
export const ME_TOKEN: MeToken = '@me'

/** M11-D35: the 10 option colours in palette order; BR-93 option creation cycles through them. */
export const OPTION_COLORS: readonly OptionColor[] = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
  'teal',
]

/** Why a domain call refused: TITLE conversion (BR-93 step 5) or a kanban drop that does not fit the column. */
export type DbDomainErrorCode = 'TITLE' | 'GROUP_COLUMN' | 'GROUP_KEY'

export class DbDomainError extends Error {
  readonly code: DbDomainErrorCode
  constructor(code: DbDomainErrorCode) {
    super(`database domain: ${code}`)
    this.name = 'DbDomainError'
    this.code = code
  }
}
