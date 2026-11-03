// GET /api/projects/[id]/plan-spans?from&to — plan-derived task spans of the project calendar (SPEC v3.6 FR-812,
// BR-103a). `from`/`to` = the month grid (Mondays, `to` exclusive, ≤ 42 days; calendarQuerySchema → 400). A malformed
// id → 404 (X86); services.planSpans.getProjectPlanSpans calls authz.requireProject(…, 'view') first. One read-only
// REPEATABLE READ transaction (PLAN §3.4.5).
import type { PlanSpansResponse } from '@/lib/contracts/plan-spans'
import { calendarQuerySchema } from '@/lib/schemas/calendar'
import { z } from '@/lib/z'
import * as authz from '@/server/authz'
import { db } from '@/server/db/client'
import { NotFoundError } from '@/server/errors'
import { route } from '@/server/route'
import * as services from '@/server/services'

const idSchema = z.uuid()

export const GET = route<{ id: string }, typeof calendarQuerySchema>(
  (_req, { user, params, query }): Promise<PlanSpansResponse> => {
    authz.requireUser(user)
    const id = idSchema.safeParse(params.id)
    if (!id.success) throw new NotFoundError() // X86
    return db.transaction((tx) => services.planSpans.getProjectPlanSpans(tx, user, id.data, query), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  },
  { query: calendarQuerySchema },
)
