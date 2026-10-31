// GET /api/sidebar — the viewer's visible non-archived projects for the sidebar (SPEC §8.1, M2-D08, X90).
// Authz: services.sidebar.getSidebar selects only rows from authz.visibleProjectIds (masking §3.3).
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route((_req, { user }): Promise<SidebarResponse> =>
  services.sidebar.getSidebar(db, user, serverToday()),
)
