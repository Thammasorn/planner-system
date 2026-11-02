import { th } from '@/i18n/th'

/** A key of Sidebar's icon map (NavRow NAV_ICONS) — nav.ts stays data-only (no component imports). */
export type NavIcon =
  'home' | 'settings' | 'projects' | 'clients' | 'my' | 'teamTasks' | 'calendar' | 'workload' | 'people'

/** A count shown as text after the label (M3-D40); M9 adds 'workloadOver' (the ●N OVER-cell badge, M9-D11). */
export type NavBadge = 'myTaskCount' | 'workloadOver'

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
  /** count from the sidebar query, rendered as text (never a coloured dot) */
  badge?: NavBadge
}

/** Top group. Only implemented areas appear (X33: no dead links). Final order (X84, SPEC §8.1):
 *  home, my, tasks, workload, calendar — M3 appends my + tasks, M5 appends calendar, M9 inserts workload before calendar. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { id: 'home', href: '/home', label: th.nav.home, icon: 'home' },
  { id: 'my', href: '/my', label: th.nav.my, icon: 'my', badge: 'myTaskCount' },
  { id: 'tasks', href: '/tasks', label: th.nav.teamTasks, icon: 'teamTasks' },
  // M9 (X84, M9-D11): directly after tasks, before calendar.
  { id: 'workload', href: '/workload', label: th.nav.workload, icon: 'workload', badge: 'workloadOver' },
  // M5 (X84): appended after tasks.
  { id: 'calendar', href: '/calendar', label: th.nav.calendar, icon: 'calendar' },
]

/** Bottom group (SPEC §8.1 "people, clients, settings"); not rendered while empty for the viewer.
 *  Final order: people (M9), clients (M2), settings (M1, managerOnly) — settings stays last: M2 inserts clients
 *  before it, M9 people before clients. The projects section header (M2) is a separate constant. */
export const BOTTOM_NAV: readonly NavItem[] = [
  // M9 (X33, M4-D27): directly before clients.
  { id: 'people', href: '/people', label: th.nav.people, icon: 'people' },
  { id: 'clients', href: '/clients', label: th.nav.clients, icon: 'clients' },
  {
    id: 'settings',
    href: '/settings/employees',
    label: th.nav.settings,
    icon: 'settings',
    managerOnly: true,
    activePrefix: '/settings',
  },
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
