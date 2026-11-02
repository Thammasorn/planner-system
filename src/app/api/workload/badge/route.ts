// GET /api/workload/badge — the sidebar ●N (FR-1007, M9-D11, X31): OVER cells over the people the viewer may see in
// [weekStart(today), +4 w). services.workload.badgeCount applies visibleUserIds (§3.3).
import type { WorkloadBadgeResponse } from '@/lib/contracts/workload'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route((_req, { user }): Promise<WorkloadBadgeResponse> => {
  authz.requireUser(user)
  const today = serverToday()
  return db.transaction((tx) => services.workload.badgeCount(tx, user, today), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
})
