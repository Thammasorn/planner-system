import { redirect } from 'next/navigation'
import { PageScreen } from '@/components/pages/PageScreen'
import { taskPageRedirect } from '@/components/pages/task-page-redirect'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import { getPageView } from '@/server/services/pages'
import { requirePageUser } from '@/server/session'

/**
 * A page of either space (FR-505: one URL shape `/p/<id>` for the wiki and project documents). Authz runs first,
 * before any Suspense boundary (X41, X57 — no loading.tsx in this segment): an invisible, deleted, unknown or
 * malformed id answers a real 404 with `not-found.tsx`. A TASK page (a task's body) redirects to `/t/<taskId>` after the
 * same authz — a viewer without access to the task still gets the 404 (M6.1-D5).
 */
export default async function PageRoute(props: PageProps<'/p/[pageId]'>) {
  const user = await requirePageUser()
  const { pageId } = await props.params
  const view = await orNotFound(getPageView(db, user, pageId))
  const toTask = taskPageRedirect(view.page)
  if (toTask) redirect(toTask)
  // keyed by id: client header state never leaks between pages when only the param changes
  return <PageScreen key={view.page.id} view={view} />
}
