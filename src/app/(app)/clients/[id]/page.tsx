import type { Metadata } from 'next'
import { ClientDetailView } from '@/components/clients/ClientDetailView'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.clients.listTitle }

/** `/clients/[id]` (FR-303 part, M2-D01): requireClient first — invisible / unknown / malformed ids answer 404. */
export default async function ClientDetailPage(props: PageProps<'/clients/[id]'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const detail = await orNotFound(services.clients.getClientDetail(db, user, id))
  return <ClientDetailView detail={detail} />
}
