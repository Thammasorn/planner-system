import type { Metadata } from 'next'
import { TaskPageScreen } from '@/components/tasks/page/TaskPageScreen'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.taskPage.metaTitle }

/**
 * The task as a document page (SPEC §4.6.4 FR-683, FR-687, M6.1-D7). Authz runs first, before any Suspense boundary
 * (X41, X56/X57 — no loading.tsx in this segment): an invisible, deleted, unknown or malformed task id answers a real
 * 404 with `not-found.tsx` (the loader validates the id, X86). Live properties come from the project's task query.
 */
export default async function TaskPageRoute(props: PageProps<'/t/[taskId]'>) {
  const user = await requirePageUser()
  const { taskId } = await props.params
  const view = await orNotFound(services.taskPages.getTaskPageView(db, user, taskId))
  // keyed by id: client state (title edit, menu, full width) never leaks between tasks when only the param changes
  return <TaskPageScreen key={view.task.id} view={view} />
}
