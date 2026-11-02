// GET /api/people — the ทีมงาน directory (FR-1008, M9-D14, §3.3): visible users incl. managers, grouped by position,
// with this week's load. services.people.listPeopleDirectory applies visibleUserIds. (/api/people/options — the picker
// directory, X09 — is a separate static segment.)
import type { PeopleDirectoryResponse } from '@/lib/contracts/workload'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route((_req, { user }): Promise<PeopleDirectoryResponse> => {
  authz.requireUser(user)
  const today = serverToday()
  return db.transaction((tx) => services.people.listPeopleDirectory(tx, user, today), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
})
