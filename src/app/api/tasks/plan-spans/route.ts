// GET /api/tasks/plan-spans?from&to[&projectId] — the team calendar's plan-derived task spans (M11.4, FR-669, BR-103a).
// `from`/`to` = the month grid (Mondays, `to` exclusive, ≤ 42 days), `projectId` optional (teamPlanSpansQuerySchema →
// 400). services.planSpans.getTeamPlanSpans filters visibility through authz.visibleProjectIds (in SQL); a `projectId`
// the viewer cannot access → 404. Ids + dates only (§3.3). One read-only REPEATABLE READ transaction (PLAN §3.4.5).
import type { TeamPlanSpansResponse } from '@/lib/contracts/plan-spans'
import { teamPlanSpansQuerySchema } from '@/lib/schemas/calendar'
import * as authz from '@/server/authz'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route<Record<string, never>, typeof teamPlanSpansQuerySchema>(
  (_req, { user, query }): Promise<TeamPlanSpansResponse> => {
    authz.requireUser(user)
    return db.transaction((tx) => services.planSpans.getTeamPlanSpans(tx, user, query), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  },
  { query: teamPlanSpansQuerySchema },
)
