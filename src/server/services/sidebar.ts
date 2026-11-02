// src/server/services/sidebar.ts — `GET /api/sidebar` (SPEC §8.1, M2-D08).
// Visible non-archived projects sorted by compareThai; masking: only rows from visibleProjectIds are ever selected.
import type { ISODate } from '@/domain/types'
import { sortByThai } from '@/lib/collate'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'
import { countMyOpenTasks } from './my-tasks'
import type { SessionUser } from '../session'

/** `today` (X90) comes from the route (the server clock); the my-task count is "this week" (M9-D17). */
export async function getSidebar(tx: DbOrTx, user: SessionUser, today: ISODate): Promise<SidebarResponse> {
  const visible = await authz.visibleProjectIds(tx, user)
  const [rows, hasArchived] = await Promise.all([
    repo.projects.listProjects(tx, { ids: visible, archived: false }),
    repo.projects.existsArchivedVisible(tx, visible),
  ])
  const projects = sortByThai(
    rows.map((p) => ({ id: p.id, name: p.name, color: p.color, certainty: p.certainty })),
    (p) => p.name,
  )
  const myTaskCount = await countMyOpenTasks(tx, user.id, today) // X22/M9-D17: my open tasks in สัปดาห์นี้
  return { projects, hasArchived, canCreateProject: authz.isManager(user), myTaskCount }
}
