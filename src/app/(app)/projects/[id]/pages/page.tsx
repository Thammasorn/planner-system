import type { Metadata } from 'next'
import { ProjectPagesView } from '@/components/pages/ProjectPagesView'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.projects.tabs.pages }

/**
 * เอกสาร tab (FR-408 part, X15): the project's page tree. Authz first, before any Suspense boundary (X41, X57):
 * layouts do not re-run on client navigation, so the page repeats the project check like the งาน tab. The tree
 * itself comes from GET /api/pages/tree through TanStack Query (PLAN §3.5).
 */
export default async function ProjectPagesPage(props: PageProps<'/projects/[id]/pages'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const header = await orNotFound(services.projects.getProjectHeader(db, user, id))
  return <ProjectPagesView projectId={header.id} projectName={header.name} />
}
