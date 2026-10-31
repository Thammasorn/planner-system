import { PageScreen } from '@/components/pages/PageScreen'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import { getPageView } from '@/server/services/pages'
import { requirePageUser } from '@/server/session'

/**
 * A page of either space (FR-505: one URL shape `/p/<id>` for the wiki and project documents). Authz runs first,
 * before any Suspense boundary (X41, X57 — no loading.tsx in this segment): an invisible, deleted, unknown or
 * malformed id answers a real 404 with `not-found.tsx`.
 */
export default async function PageRoute(props: PageProps<'/p/[pageId]'>) {
  const user = await requirePageUser()
  const { pageId } = await props.params
  const view = await orNotFound(getPageView(db, user, pageId))
  // keyed by id: client header state never leaks between pages when only the param changes
  return <PageScreen key={view.page.id} view={view} />
}
