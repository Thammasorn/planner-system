// src/server/services/embed.ts — data of the live blocks taskView / projectWorkload (SPEC §4.13 FR-1301…1304, §7.8;
// plan/m10 S1.9/S1.10, M10-D2/D3/D11). The page is resolved with authz.requirePage(view) BEFORE any data query
// (invisible / deleted → NotFoundError, X41/X63); a WORKSPACE page answers { kind: 'wiki' }; the project comes from
// the page (never from block props, FR-1304). Takes `today` explicitly (X56) and imports no request context.
// Masking and population are M9's (buildTable) and M3's (listProjectTasks) — no copy of either rule here.
import { addWeeks, weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { compareThai } from '@/lib/collate'
import type { EmbedTasksResponse, EmbedWorkloadResponse } from '@/lib/contracts/embed'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import type { SessionUser } from '../session'
import { listProjectTasks } from './tasks'
import { buildTable } from './workload'

export const EMBED_WORKLOAD_WEEKS = 8

/** M3 listProjectTasks of the page's project — same payload and visibility as the tasks tab (M10-D2). */
export async function getEmbedTasks(tx: DbOrTx, user: SessionUser, pageId: string): Promise<EmbedTasksResponse> {
  const { page } = await authz.requirePage(tx, user, pageId, 'view') // invisible / deleted → 404
  if (page.space === 'WORKSPACE' || page.projectId === null) return { kind: 'wiki' }
  const data = await listProjectTasks(tx, user, page.projectId) // M3: requireProject(view), archived readable
  return {
    kind: 'project',
    projectId: page.projectId,
    projectName: data.project.name,
    tasksHref: `/projects/${page.projectId}/tasks`,
    data,
  }
}

/** M9 buildTable restricted to the project's members, 8 weeks from this week (M10-D11). */
export async function getEmbedWorkload(
  tx: DbOrTx,
  user: SessionUser,
  pageId: string,
  today: ISODate,
): Promise<EmbedWorkloadResponse> {
  const { page, archived } = await authz.requirePage(tx, user, pageId, 'view') // 404 first
  if (page.space === 'WORKSPACE' || page.projectId === null) return { kind: 'wiki' }
  const projectId = page.projectId
  const project = await repo.projects.getProject(tx, projectId) // exists after requirePage
  if (!project) throw new NotFoundError()
  const ws = weekStart(today)
  // [] (never undefined) = nobody: M9's listCandidates treats `userIds: []` as an empty population (C92).
  const members = (await repo.members.listMembers(tx, projectId)).map((m) => m.userId)
  const wl = await buildTable(
    tx,
    user,
    { window: { from: ws, to: addWeeks(ws, EMBED_WORKLOAD_WEEKS) }, userIds: members },
    today,
  )
  const people = wl.groups
    .flatMap((g) => g.people)
    .map((p) => ({ userId: p.userId, name: p.name, deactivated: p.deactivatedOn !== null, cells: p.cells }))
    .sort((a, b) => compareThai(a.name, b.name) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
  return {
    kind: 'project',
    projectId,
    projectName: project.name,
    archived,
    workloadHref: `/workload?projectId=${projectId}`,
    weeks: wl.weeks,
    people,
    projects: wl.projects,
  }
}
