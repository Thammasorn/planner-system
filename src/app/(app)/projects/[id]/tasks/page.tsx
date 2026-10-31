import type { Metadata } from 'next'
import { TasksView } from '@/components/tasks/TasksView'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.projects.tabs.tasks }

/**
 * งาน tab (FR-408 tab, FR-601–614, FR-660–664). Authz first, before any Suspense boundary (X41): layouts do not
 * re-run on client navigation, so the page repeats the project check. The data itself comes from
 * GET /api/projects/[id]/tasks through TanStack Query (PLAN §3.5).
 */
export default async function ProjectTasksPage(props: PageProps<'/projects/[id]/tasks'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const header = await orNotFound(services.projects.getProjectHeader(db, user, id))
  return <TasksView projectId={header.id} />
}
