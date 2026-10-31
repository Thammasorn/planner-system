import type { Metadata } from 'next'
import { ProjectOverview } from '@/components/projects/ProjectOverview'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.projects.tabs.overview }

/** ภาพรวม tab (FR-409 part): project info, members, warnings — no load figures until M9 (X15). Authz first. */
export default async function ProjectOverviewPage(props: PageProps<'/projects/[id]/overview'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const data = await orNotFound(services.projects.getProjectOverview(db, user, id))
  return <ProjectOverview data={data} />
}
