// GET /api/pages/:id/embed/tasks — data of a taskView block (FR-1301, FR-1304, §7.8; M10-D1/D2/D3). The param is
// parsed here (X86): a malformed id is a 404 before any query. getEmbedTasks runs requirePage(view) (invisible or
// deleted → 404) and answers { kind: 'wiki' } for a WORKSPACE page. Query parameters are ignored (M10-D2).
import type { EmbedTasksResponse } from '@/lib/contracts/embed'
import { embedParamsSchema } from '@/lib/schemas/embed'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import { getEmbedTasks } from '@/server/services/embed'

export const GET = route<{ id: string }>((_req, { user, params }): Promise<EmbedTasksResponse> => {
  const parsed = embedParamsSchema.safeParse(params)
  if (!parsed.success) throw new NotFoundError()
  return db.transaction((tx) => getEmbedTasks(tx, user, parsed.data.id), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
})
