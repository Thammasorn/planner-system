// The plan tab's view (FR-810, M7.1-D20): `?view=grid|calendar` (lowercase, wins over the stored value) → the
// `plan.view` preference (GRID | CALENDAR) → GRID. Isomorphic and pure: the page resolves it on the server.
import { PLAN_PREFERENCE_DEFAULTS, type PlanView } from '@/lib/schemas/preferences'

const FROM_PARAM: Record<string, PlanView> = { grid: 'GRID', calendar: 'CALENDAR' }

export function planViewParam(v: PlanView): string {
  return v === 'CALENDAR' ? 'calendar' : 'grid'
}

/** `param` = searchParams.view (string, string[] or absent); unknown values are ignored. */
export function resolvePlanView(param: string | string[] | undefined, stored: PlanView | undefined): PlanView {
  const raw = Array.isArray(param) ? param[0] : param
  return (raw === undefined ? undefined : FROM_PARAM[raw.toLowerCase()]) ?? stored ?? PLAN_PREFERENCE_DEFAULTS['plan.view']
}

/** The current URL with `view` set, other params (e.g. `?task=`) kept. */
export function urlWithView(href: string, v: PlanView): string {
  const url = new URL(href)
  url.searchParams.set('view', planViewParam(v))
  return `${url.pathname}${url.search}${url.hash}`
}
