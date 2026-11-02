import type { Metadata } from 'next'
import { ProjectOverview } from '@/components/projects/ProjectOverview'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.projects.tabs.overview }

/** ภาพรวม tab (FR-409): project info, progress, members, status set (M3), milestones (M8), load (M9 — client section on
 *  GET /api/projects/[id]/load). Authz first. */
export default async function ProjectOverviewPage(props: PageProps<'/projects/[id]/overview'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const data = await orNotFound(services.projects.getProjectOverview(db, user, id))
  // FR-409 progress (M3-D21); getProjectOverview above has already authorised the project
  const progress = await services.projects.projectProgress(db, data.project.id)
  return <ProjectOverview data={data} progress={progress} />
}
