import { th } from '@/i18n/th'

/** A key of Sidebar's icon map — nav.ts stays data-only (no component imports). Later keys:
 *  M3 'my' | 'teamTasks', M5 'calendar', M9 'workload' | 'people'. */
export type NavIcon = 'home' | 'settings' | 'projects' | 'clients'

export interface NavItem {
  /** stable id used by tests and badges: 'home', 'my', 'tasks', 'workload', 'calendar', 'people', 'clients', 'settings' (X84) */
  id: string
  href: string
  label: string
  icon: NavIcon
  /** shown only to managers (M1+: settings) */
  managerOnly?: boolean
  /** path prefix that marks the item active when it differs from `href` (settings: '/settings') */
  activePrefix?: string
  // M3 adds `badge?: NavBadge` with `export type NavBadge = 'myTaskCount'`; M9 widens it to 'myTaskCount' | 'workloadOver' (X84).
}

/** Top group. Only implemented areas appear (X33: no dead links). Final order (X84, SPEC §8.1):
 *  home, my, tasks, workload, calendar — M3 appends my + tasks, M5 appends calendar, M9 inserts workload before calendar. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { id: 'home', href: '/home', label: th.nav.home, icon: 'home' },
]

/** Bottom group (SPEC §8.1 "people, clients, settings"); not rendered while empty for the viewer.
 *  Final order: people (M9), clients (M2), settings (M1, managerOnly) — settings stays last: M2 inserts clients
 *  before it, M9 people before clients. The projects section header (M2) is a separate constant. */
export const BOTTOM_NAV: readonly NavItem[] = [
  { id: 'clients', href: '/clients', label: th.nav.clients, icon: 'clients' },
  { id: 'settings', href: '/settings/employees', label: th.nav.settings, icon: 'settings', managerOnly: true,
    activePrefix: '/settings' },
]

/** Header of the sidebar "โปรเจค" section (M2, X33): rendered above SidebarProjects; in neither PRIMARY_NAV nor
 *  BOTTOM_NAV. In the collapsed rail only this header icon (a link to /projects) is shown. */
export const PROJECTS_NAV: NavItem = {
  id: 'projects',
  href: '/projects',
  label: th.nav.projects,
  icon: 'projects',
}

/** Hides manager-only items from workers (a UI hint only; `/settings/*` pages 404 for workers on the server). */
export function visibleNav(items: readonly NavItem[], isManager: boolean): readonly NavItem[] {
  return isManager ? items : items.filter((i) => !i.managerOnly)
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
