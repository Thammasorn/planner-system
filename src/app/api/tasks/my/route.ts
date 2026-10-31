// GET /api/tasks/my — my open assigned leaf tasks in non-archived projects, grouped by project (FR-1009 basic, X22,
// M3-D8). Authz: services.myTasks.listMyTasks calls authz.requireUser; only the caller's own rows are selected (no
// masking involved).
import type { MyTasksResponse } from '@/lib/contracts/tasks'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route((_req, { user }): Promise<MyTasksResponse> => services.myTasks.listMyTasks(db, user))
