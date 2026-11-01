import type { Metadata } from 'next'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Link from '@/components/Link'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { CreateProjectButton } from '@/components/projects/CreateProjectButton'
import { ProjectsTable } from '@/components/projects/ProjectsTable'
import { th } from '@/i18n/th'
import { isManager } from '@/server/authz'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.projects.listTitle }

/**
 * `/projects` (FR-401 entry, §12 M2): the projects the viewer can see — managers all, workers their own (the service
 * filters with visibleProjectIds; nothing invisible reaches the client). `?archived=1` lists archived ones.
 */
export default async function ProjectsPage(props: PageProps<'/projects'>) {
  const user = await requirePageUser()
  const sp = await props.searchParams
  const archived = sp.archived === '1'
  const items = await services.projects.listProjectsForViewer(db, user, { archived })
  const manager = isManager(user)
  const empty = archived ? th.projects.emptyArchived : manager ? th.projects.empty : th.projects.emptyWorker
  const title = archived ? th.projects.archivedListTitle : th.projects.listTitle
  return (
    <>
      <PageHeaderBar
        crumbs={
          archived
            ? [
                { label: th.nav.projects, href: '/projects' },
                { label: title, asHeading: true },
              ]
            : [{ label: title, asHeading: true }]
        }
        actions={
          <>
            <Button component={Link} href={archived ? '/projects' : '/projects?archived=1'}>
              {archived ? th.projects.showActive : th.projects.showArchived}
            </Button>
            {manager && !archived ? <CreateProjectButton /> : null}
          </>
        }
      />
      <Stack spacing={2}>
        {items.length === 0 ? <EmptyState title={empty} /> : <ProjectsTable items={items} label={title} />}
      </Stack>
    </>
  )
}
