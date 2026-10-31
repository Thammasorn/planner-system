// GET /api/projects/[id]/tasks — the project's live tasks, statuses, blocker edges and members (§3.2 PERM-06, X62,
// M3-D37). Authz: services.tasks.listProjectTasks calls authz.requireProject(…, 'view') first (archived allowed); a
// malformed id is a 404 like an invisible project (X86).
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route<{ id: string }>(
  (_req, { user, params }): Promise<ProjectTasksResponse> =>
    db.transaction((tx) => services.tasks.listProjectTasks(tx, user, params.id), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
)
