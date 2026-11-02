import type { Metadata } from 'next'
import { PersonLeave } from '@/components/people/PersonLeave'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.people.tabs.leave }

/** Person tab วันลา (FR-1008, M9-D16): authz first; entries from GET /api/people/[userId]/time-off (M5 masking). */
export default async function PersonLeavePage(props: PageProps<'/people/[id]/leave'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const header = await orNotFound(services.people.getPersonHeader(db, user, id))
  return <PersonLeave userId={header.userId} />
}
