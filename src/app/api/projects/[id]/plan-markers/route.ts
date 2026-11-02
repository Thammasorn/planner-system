// GET /api/projects/[id]/plan-markers — every live marker of the project (SPEC §7.10, PERM-06 read, M7.1-D15).
// Authz: services.planMarkers.list calls authz.requireProject(…, 'view') before any read — invisible → 404, archived
// readable, malformed id → 404 (X86).
import type { PlanMarkersResponse } from '@/lib/contracts/plan-markers'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route<{ id: string }>((_req, { user, params }): Promise<PlanMarkersResponse> =>
  db.transaction((tx) => services.planMarkers.list(tx, user, { projectId: params.id }), {
    accessMode: 'read only',
  }),
)
