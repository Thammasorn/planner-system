// GET /api/tasks/[id]/body — the task body view (SPEC §7.7, M6.1-D7, PERM-27): requireTask(view) inside
// getTaskBodyView before any read; `page: null` until the body is first edited. A malformed id is a 404 (X86).
import type { TaskBodyView } from '@/lib/contracts/task-pages'
import { taskBodyParamsSchema } from '@/lib/schemas/task-pages'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import { getTaskBodyView } from '@/server/services/task-pages'

export const GET = route<{ id: string }>((_req, { user, params }): Promise<TaskBodyView> => {
  const parsed = taskBodyParamsSchema.safeParse(params)
  if (!parsed.success) throw new NotFoundError()
  return getTaskBodyView(db, user, parsed.data.id)
})
