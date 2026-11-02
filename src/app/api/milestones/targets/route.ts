// GET /api/milestones/targets — projects where the viewer may create a milestone (palette "สร้าง milestone", M8-D18):
// manager → non-archived projects, worker → projects where LEAD. Authz: the route() session gate + authz.requireUser,
// then services.milestones.listTargets applies visibility itself (M8-D25).
import type { MilestoneTargetsResponse } from '@/lib/contracts/milestones'
import * as authz from '@/server/authz'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route(
  (_req, { user }): Promise<MilestoneTargetsResponse> => {
    authz.requireUser(user)
    return db.transaction((tx) => services.milestones.listTargets(tx, user), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  },
)
