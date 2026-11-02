// src/lib/schemas/embed.ts — route params of GET /api/pages/:id/embed/{tasks,workload} (M10-D1, X86). A malformed id
// is answered 404 (NOT_FOUND), exactly like an unknown or invisible page. No query schema: view and filters are block
// props applied on the client (M10-D6, M9-D2).
import { z } from '@/lib/z'

export const embedParamsSchema = z.object({ id: z.uuid() })
export type EmbedParams = z.infer<typeof embedParamsSchema>
