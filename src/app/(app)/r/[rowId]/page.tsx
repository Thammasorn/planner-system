import type { Metadata } from 'next'
import { RowPageScreen } from '@/components/database/row-page/RowPageScreen'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.database.rowPage.metaTitle }

/**
 * A database row as a page (SPEC §4.14 FR-1453, M11-D8/D27). Authz runs first, before any Suspense boundary (X41,
 * X56/X57 — no loading.tsx in this segment): an invisible owner page, a deleted row or database, an unknown or
 * malformed id all answer the same real 404 with `not-found.tsx` (the loader validates the id, X86). Live properties
 * come from the owner database's query — the same cache as the block and its side panel (FR-1401).
 */
export default async function RowPageRoute(props: PageProps<'/r/[rowId]'>) {
  const user = await requirePageUser()
  const { rowId } = await props.params
  const view = await orNotFound(services.rowPages.getRowPageView(db, user, rowId))
  // keyed by id: client state (title edit, menu, full width) never leaks between rows when only the param changes
  return <RowPageScreen key={view.row.id} view={view} />
}
