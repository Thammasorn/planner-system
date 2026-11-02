// GET /api/projects/[id]/milestones — every live milestone of the project with status, lateness and progress
// (SPEC §4.7, FR-409, PERM-06 read, M8-D17). Authz: authz.requireProject(…, 'view') before
// services.milestones.listProjectMilestones — invisible / malformed id → 404 (X86), archived readable; "today" from
// serverToday() (X90).
import type { ProjectMilestonesResponse } from '@/lib/contracts/milestones'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route<{ id: string }>(
  (_req, { user, params }): Promise<ProjectMilestonesResponse> =>
    db.transaction(
      async (tx) => {
        await authz.requireProject(tx, user, params.id, 'view')
        return services.milestones.listProjectMilestones(tx, user, params.id, serverToday())
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    ),
)
