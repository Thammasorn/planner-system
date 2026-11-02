// GET /api/pages/:id/embed/workload — data of a projectWorkload block (FR-1303, FR-1304, §7.8; M10-D1/D3/D11). The
// param is parsed here (X86): a malformed id is a 404 before any query. getEmbedWorkload runs requirePage(view) and
// reuses M9's buildTable (same masking and population as /api/workload). No query parameters (the view is a prop).
import type { EmbedWorkloadResponse } from '@/lib/contracts/embed'
import { embedParamsSchema } from '@/lib/schemas/embed'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import { getEmbedWorkload } from '@/server/services/embed'

export const GET = route<{ id: string }>((_req, { user, params }): Promise<EmbedWorkloadResponse> => {
  const parsed = embedParamsSchema.safeParse(params)
  if (!parsed.success) throw new NotFoundError()
  return db.transaction((tx) => getEmbedWorkload(tx, user, parsed.data.id, serverToday()), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
})
