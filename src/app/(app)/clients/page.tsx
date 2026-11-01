import type { Metadata } from 'next'
import { ClientsView } from '@/components/clients/ClientsView'
import { th } from '@/i18n/th'
import { isManager } from '@/server/authz'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.clients.listTitle }

/**
 * `/clients` (FR-301..FR-303 part, X61): managers see every client (archived ones with `?archived=1`); workers see
 * only the clients of projects they belong to — the service filters on the server.
 */
export default async function ClientsPage(props: PageProps<'/clients'>) {
  const user = await requirePageUser()
  const sp = await props.searchParams
  const manager = isManager(user)
  const showingArchived = manager && sp.archived === '1'
  const items = await services.clients.listClientsForViewer(db, user, { includeArchived: showingArchived })
  return <ClientsView items={items} canManage={manager} showingArchived={showingArchived} />
}
