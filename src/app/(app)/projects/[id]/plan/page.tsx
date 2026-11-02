import type { Metadata } from 'next'
import { th } from '@/i18n/th'
import { gridPreference } from '@/lib/schemas/preferences'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'
import { PlanView } from './PlanView'
import { resolvePlanView } from './view'

export const metadata: Metadata = { title: th.projects.tabs.plan }

/**
 * แผนงาน tab (FR-408 tab, FR-801–809, FR-810, M6-D18, M7.1-D20). Authz first, before any Suspense boundary (X41/X57):
 * layouts do not re-run on client navigation, so the page repeats the project check. The grid data comes from
 * GET /api/grid/project/[projectId] through TanStack Query (PLAN §3.5); writes go through saveAllocations. The view
 * ([แผนงาน | ปฏิทิน]) = `?view=` when present, else the `plan.view` preference (FR-810). The other M7.1 grid keys
 * (`grid.showAssignees`, `grid.taskColumnWidth`, `grid.chart`) are passed like `grid.zoom` (the grid's first render
 * matches the server read).
 */
export default async function ProjectPlanPage(props: PageProps<'/projects/[id]/plan'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const header = await orNotFound(services.projects.getProjectHeader(db, user, id))
  const [prefs, search] = await Promise.all([services.preferences.getPreferences(db, user.id), props.searchParams])
  return (
    <PlanView
      projectId={header.id}
      projectName={header.name}
      projectColor={header.color}
      archived={header.archived}
      canEdit={!header.archived}
      // M7 (S3.11, FR-802): the zoom preference, read after authz; default 'WEEK'
      initialZoom={gridPreference(prefs, 'grid.zoom')}
      initialView={resolvePlanView(search.view, prefs['plan.view'])}
      initialTaskColumnWidth={gridPreference(prefs, 'grid.taskColumnWidth')}
      initialShowAssignees={gridPreference(prefs, 'grid.showAssignees')}
      initialChartOpen={gridPreference(prefs, 'grid.chart')}
    />
  )
}
