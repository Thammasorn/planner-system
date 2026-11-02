// GET /api/clients/[id]/load — the client page load (FR-303 load part, M9-D20, §3.2 PERM-04). A malformed id → 404
// (X86); services.workload.clientLoad calls authz.requireClient first (invisible → 404) and sums only the viewer's
// visible, non-archived projects of the client (§3.3).
import type { ClientLoadResponse } from '@/lib/contracts/workload'
import { z } from '@/lib/z'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import * as services from '@/server/services'

const idSchema = z.uuid()

export const GET = route<{ id: string }>((_req, { user, params }): Promise<ClientLoadResponse> => {
  authz.requireUser(user)
  const id = idSchema.safeParse(params.id)
  if (!id.success) throw new NotFoundError() // X86
  const today = serverToday()
  return db.transaction((tx) => services.workload.clientLoad(tx, user, id.data, today), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
})
