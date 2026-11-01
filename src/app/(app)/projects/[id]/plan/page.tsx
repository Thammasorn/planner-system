import type { Metadata } from 'next'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'
import { PlanView } from './PlanView'

export const metadata: Metadata = { title: th.projects.tabs.plan }

/**
 * แผนงาน tab (FR-408 tab, FR-801–809, M6-D18). Authz first, before any Suspense boundary (X41/X57): layouts do not
 * re-run on client navigation, so the page repeats the project check. The grid data comes from
 * GET /api/grid/project/[projectId] through TanStack Query (PLAN §3.5); writes go through saveAllocations.
 */
export default async function ProjectPlanPage(props: PageProps<'/projects/[id]/plan'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const header = await orNotFound(services.projects.getProjectHeader(db, user, id))
  return (
    <PlanView
      projectId={header.id}
      projectName={header.name}
      archived={header.archived}
      canEdit={!header.archived}
    />
  )
}
