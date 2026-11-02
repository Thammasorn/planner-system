// GET /api/projects/[id]/load — the overview load section (FR-409 load part, M9-D19, §3.2 PERM-06). A malformed id →
// 404 (X86); services.workload.projectLoad calls authz.requireProject(…, 'view') first (invisible → 404; archived →
// `archived: true` without numbers, X42).
import type { ProjectLoadResponse } from '@/lib/contracts/workload'
import { z } from '@/lib/z'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import * as services from '@/server/services'

const idSchema = z.uuid()

export const GET = route<{ id: string }>((_req, { user, params }): Promise<ProjectLoadResponse> => {
  authz.requireUser(user)
  const id = idSchema.safeParse(params.id)
  if (!id.success) throw new NotFoundError() // X86
  const today = serverToday()
  return db.transaction((tx) => services.workload.projectLoad(tx, user, id.data, today), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
})
