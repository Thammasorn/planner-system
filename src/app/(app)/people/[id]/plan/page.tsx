import type { Metadata } from 'next'
import { PersonPlan } from '@/components/people/PersonPlan'
import { isISODate, isoWeekday } from '@/domain/dates'
import { th } from '@/i18n/th'
import { gridPreference } from '@/lib/schemas/preferences'
import { db } from '@/server/db/client'
import { orNotFound } from '@/server/page-helpers'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.people.tabs.plan }

/**
 * Person tab แผนงาน (FR-1008, M9-D12/D28): authz first (layouts do not re-run on client navigation), then the grid
 * preferences (`grid.zoom`, `grid.taskColumnWidth`; `grid.unit` applies here — M9-D21). `?week=` must be a Monday,
 * otherwise it is ignored. The grid data comes from GET /api/grid/person/[userId] through TanStack Query.
 */
export default async function PersonPlanPage(props: PageProps<'/people/[id]/plan'>) {
  const user = await requirePageUser()
  const { id } = await props.params
  const header = await orNotFound(services.people.getPersonHeader(db, user, id))
  const [prefs, sp] = await Promise.all([services.preferences.getPreferences(db, user.id), props.searchParams])
  const week = typeof sp.week === 'string' && isISODate(sp.week) && isoWeekday(sp.week) === 1 ? sp.week : undefined
  return (
    <PersonPlan
      key={week ?? ''}
      userId={header.userId}
      name={header.name}
      {...(week ? { focusWeek: week } : {})}
      initialZoom={gridPreference(prefs, 'grid.zoom')}
      initialTaskColumnWidth={gridPreference(prefs, 'grid.taskColumnWidth')}
    />
  )
}
