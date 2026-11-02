import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TeamTasks } from '@/components/tasks/team/TeamTasks'
import { th } from '@/i18n/th'
import { isManager } from '@/server/authz'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.people.tabs.tasks }

/**
 * Person tab งาน (FR-667 person part, X77, M9-D15): M3's TeamTasks fixed to this person (GET /api/tasks?userId=,
 * visibility filtered in SQL — X75), filters in memory only (`syncUrl={false}`: the page owns no filter URL). A viewer
 * who is neither the person nor a manager sees only tasks of projects they can see — said by the hint.
 */
export default async function PersonTasksPage(props: PageProps<'/people/[id]/tasks'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const header = await orNotFound(services.people.getPersonHeader(db, user, id))
  const hint = !header.isSelf && !isManager(user) ? th.people.tasks.hiddenHint : undefined
  return (
    <Suspense>
      <TeamTasks fixedUserId={header.userId} syncUrl={false} {...(hint ? { hint } : {})} />
    </Suspense>
  )
}
