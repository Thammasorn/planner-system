import { ProjectArchivedBanner, ProjectHeaderBar } from '@/components/projects/ProjectHeaderBar'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

/**
 * Project shell (FR-408, M2-D10). Authz runs first, before any Suspense boundary (X41, M2-D21): an invisible,
 * unknown or malformed id answers 404 with `projects/not-found.tsx`. Each tab page repeats its own check, because
 * layouts do not re-run on client navigation.
 */
export default async function ProjectLayout(props: LayoutProps<'/projects/[id]'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const header = await orNotFound(services.projects.getProjectHeader(db, user, id))
  return (
    <>
      <ProjectHeaderBar header={header} />
      <ProjectTabs projectId={header.id} />
      <ProjectArchivedBanner archived={header.archived} />
      {props.children}
    </>
  )
}
