import { th } from '@/i18n/th'

/** A key of Sidebar's icon map — nav.ts stays data-only (no component imports). Later keys: M1 'settings',
 *  M2 'projects' | 'clients', M3 'my' | 'teamTasks', M5 'calendar', M9 'workload' | 'people'. */
export type NavIcon = 'home'

export interface NavItem {
  /** stable id used by tests and badges: 'home', 'my', 'tasks', 'workload', 'calendar', 'people', 'clients', 'settings' (X84) */
  id: string
  href: string
  label: string
  icon: NavIcon
  /** shown only to managers (M1+: settings) */
  managerOnly?: boolean
  // M3 adds `badge?: NavBadge` with `export type NavBadge = 'myTaskCount'`; M9 widens it to 'myTaskCount' | 'workloadOver' (X84).
}

/** Top group. Only implemented areas appear (X33: no dead links). Final order (X84, SPEC §8.1):
 *  home, my, tasks, workload, calendar — M3 appends my + tasks, M5 appends calendar, M9 inserts workload before calendar. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { id: 'home', href: '/home', label: th.nav.home, icon: 'home' },
]

/** Bottom group (SPEC §8.1 "people, clients, settings"). Empty in M0 and not rendered while empty.
 *  Final order: people (M9), clients (M2), settings (M1, managerOnly) — M2 inserts clients before settings, M9 people before clients.
 *  The projects section header (M2) is a separate constant, never part of either group. */
export const BOTTOM_NAV: readonly NavItem[] = []

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
