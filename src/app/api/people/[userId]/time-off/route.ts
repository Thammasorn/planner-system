// GET /api/people/[userId]/time-off — the person page วันลา tab (FR-1008, M9-D16, §3.3 MASK-5). Parse (400) first; a
// malformed id → 404 (X86); services.people.listPersonTimeOff calls authz.requireVisibleUser first and masks entries
// with M5's maskTimeOff.
import type { PersonTimeOffResponse } from '@/lib/contracts/workload'
import { personTimeOffQuerySchema } from '@/lib/schemas/workload'
import { zUserId } from '@/lib/schemas/tasks'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route<{ userId: string }, typeof personTimeOffQuerySchema>(
  (_req, { user, params }): Promise<PersonTimeOffResponse> => {
    authz.requireUser(user)
    const id = zUserId.safeParse(params.userId)
    if (!id.success) throw new NotFoundError() // X86
    const today = serverToday()
    return db.transaction((tx) => services.people.listPersonTimeOff(tx, user, id.data, today), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  },
  { query: personTimeOffQuerySchema },
)
