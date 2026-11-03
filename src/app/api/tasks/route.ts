// GET /api/tasks — team tasks across every project the viewer can see (SPEC v3.1 FR-665, X75, M3-D33).
// Authz: services.teamTasks.listTeamTasks filters visibility in SQL via authz.visibleProjectIds; `projectId` of an
// invisible project → 404. Query: teamTasksQuerySchema over teamTasksQueryFromSearchParams(url.searchParams) —
// `category` may repeat, which the route() wrapper's own `query` option would collapse; a bad query string is a 400.
// `today` = serverToday() (M1-D4) centres each card's plannedCd horizon (M11.4, FR-668).
import type { TeamTasksResponse } from '@/lib/contracts/tasks'
import { teamTasksQueryFromSearchParams, teamTasksQuerySchema } from '@/lib/schemas/tasks'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { ValidationError } from '@/server/errors'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route((_req, { user, url }): Promise<TeamTasksResponse> => {
  const parsed = teamTasksQuerySchema.safeParse(teamTasksQueryFromSearchParams(url.searchParams))
  if (!parsed.success) return Promise.reject(ValidationError.fromZod(parsed.error))
  return db.transaction((tx) => services.teamTasks.listTeamTasks(tx, user, parsed.data, serverToday()), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
})
