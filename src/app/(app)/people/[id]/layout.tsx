import { PersonHeaderView } from '@/components/people/PersonHeaderView'
import { PersonTabs } from '@/components/people/PersonTabs'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

/**
 * Person shell (FR-1008, M9-D14, X57). Authz runs first, before any Suspense boundary: an invisible, unknown or
 * malformed id answers 404 (`authz.requireVisibleUser` inside getPersonHeader) with `people/not-found.tsx`. No
 * `loading.tsx` under people/**. Each tab page repeats its own check (layouts do not re-run on client navigation).
 */
export default async function PersonLayout(props: LayoutProps<'/people/[id]'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const header = await orNotFound(services.people.getPersonHeader(db, user, id))
  return (
    <>
      <PersonHeaderView header={header} />
      <PersonTabs userId={header.userId} />
      {props.children}
    </>
  )
}
