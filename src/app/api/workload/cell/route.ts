// GET /api/workload/cell?userId&week — the tasks behind one workload cell (FR-1005, M9-D9, §3.3). Parse (400) first;
// services.workload.cellDetail calls authz.requireVisibleUser (invisible / unknown user → 404, X86) before any data.
import type { WorkloadCellDetail } from '@/lib/contracts/workload'
import { workloadCellQuerySchema } from '@/lib/schemas/workload'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route<Record<string, never>, typeof workloadCellQuerySchema>(
  (_req, { user, query }): Promise<WorkloadCellDetail> => {
    authz.requireUser(user)
    const today = serverToday()
    return db.transaction((tx) => services.workload.cellDetail(tx, user, query, today), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  },
  { query: workloadCellQuerySchema },
)
