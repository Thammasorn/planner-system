// GET /api/workload?from&to&positionId&projectId&onlyOver — the Workload ทีม table (§3.2 PERM-22, §3.3, FR-1001…1006,
// M9-D2…D5/D10). Query parse (400) precedes authz; default window [weekStart(today), +12 w); one REPEATABLE READ
// read-only tx; services.workload.buildTable applies visibility (visibleUserIds totals, visibleProjectIds details) and
// 404s an invisible projectId filter (M9-D5).
import { addWeeks, weekStart } from '@/domain/dates'
import type { WorkloadResponse } from '@/lib/contracts/workload'
import { workloadQuerySchema } from '@/lib/schemas/workload'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route<Record<string, never>, typeof workloadQuerySchema>(
  (_req, { user, query }): Promise<WorkloadResponse> => {
    authz.requireUser(user)
    const today = serverToday()
    const from = query.from ?? weekStart(today)
    const to = query.to ?? addWeeks(weekStart(today), 12)
    return db.transaction(
      (tx) =>
        services.workload.buildTable(
          tx,
          user,
          {
            window: { from, to },
            positionId: query.positionId ?? null,
            projectId: query.projectId ?? null,
            onlyOver: query.onlyOver,
          },
          today,
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  },
  { query: workloadQuerySchema },
)
