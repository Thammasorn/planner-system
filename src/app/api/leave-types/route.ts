// GET /api/leave-types — the active leave types in order for the leave dialog (M5-D9, M5-D15: any logged-in user).
// Authz (AZ-2): authz.requireUser before the table is read. Archived types stay readable through the entries that
// reference them (calendar DTO), never through this list.
import type { LeaveTypesResponse } from '@/lib/contracts/leave-types'
import * as authz from '@/server/authz'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route(async (_req, { user }): Promise<LeaveTypesResponse> => {
  authz.requireUser(user)
  const list = await services.leaveTypes.listLeaveTypes(db, { includeArchived: false })
  return { leaveTypes: list.map(({ id, name, color, archived }) => ({ id, name, color, archived })) }
})
