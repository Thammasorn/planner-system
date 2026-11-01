// src/lib/schemas/task-pages.ts — task body inputs (SPEC §4.6.4, §7.7; plan/m06.1 S0.4). Ids are z.uuid() (X47, X86).
import { z } from '@/lib/z'

/** `ensureTaskBody({ taskId })` (M6.1-D6). */
export const ensureTaskBodySchema = z.object({ taskId: z.uuid() })

/** Route params of `GET /api/tasks/[id]/body` and the `/t/[taskId]` loader (malformed → 404, X86). */
export const taskBodyParamsSchema = z.object({ id: z.uuid() })
