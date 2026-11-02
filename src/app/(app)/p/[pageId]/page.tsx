import { redirect } from 'next/navigation'
import { PageScreen } from '@/components/pages/PageScreen'
import { taskPageRedirect } from '@/components/pages/task-page-redirect'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import { getPageView } from '@/server/services/pages'
import { requirePageUser } from '@/server/session'

/** `?a=1&b=2` of the route's search params ('' when none) — kept by the redirects below (M11-D26: `?db=&row=`). */
function searchOf(params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') q.append(k, v)
    else if (Array.isArray(v)) for (const x of v) q.append(k, x)
  }
  const s = q.toString()
  return s === '' ? '' : `?${s}`
}

/**
 * A page of either space (FR-505: one URL shape `/p/<id>` for the wiki and project documents). Authz runs first,
 * before any Suspense boundary (X41, X57 — no loading.tsx in this segment): an invisible, deleted, unknown or
 * malformed id answers a real 404 with `not-found.tsx`. A TASK page (a task's body) redirects to `/t/<taskId>` after the
 * same authz — a viewer without access to the task still gets the 404 (M6.1-D5). M11 (M11-D8): a DB_ROW page (a
 * database row's body) redirects to `/r/<rowId>` the same way; both redirects keep the query (`?db=&row=`, M11-D26).
 */
export default async function PageRoute(props: PageProps<'/p/[pageId]'>) {
  const user = await requirePageUser()
  const { pageId } = await props.params
  const view = await orNotFound(getPageView(db, user, pageId))
  if (view.page.kind === 'DB_ROW' && view.page.rowId)
    redirect(`/r/${view.page.rowId}${searchOf(await props.searchParams)}`)
  const toTask = taskPageRedirect(view.page)
  if (toTask) redirect(toTask + searchOf(await props.searchParams))
  // keyed by id: client header state never leaks between pages when only the param changes
  return <PageScreen key={view.page.id} view={view} />
}
