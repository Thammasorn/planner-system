// src/lib/schemas/row-pages.ts — database row body inputs (SPEC §4.14 FR-1453, §7.7; plan/m11 S0.5, M11-D8). Ids are
// z.uuid() (X47, X86).
import { z } from '@/lib/z'

/** `ensureRowBody({ rowId })` (M11-D8). */
export const ensureRowBodySchema = z.object({ rowId: z.uuid() })

/** Route params of `GET /api/database-rows/[id]/body` and the `/r/[rowId]` loader (malformed → 404, X86). */
export const rowBodyParamsSchema = z.object({ id: z.uuid() })
