// GET /api/projects/[id]/statuses — the project's live status set + usage counts (SPEC v3.1 §7.8, PERM-06 read,
// FR-622). Authz: services.taskStatuses.listProjectStatuses calls authz.requireProject(…, 'view') first (archived
// readable); canManage = M/L and not archived (PERM-23); a malformed id is a 404 (X86).
import type { ProjectStatusesResponse } from '@/lib/contracts/tasks'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route<{ id: string }>(
  (_req, { user, params }): Promise<ProjectStatusesResponse> =>
    services.taskStatuses.listProjectStatuses(db, user, params.id),
)
