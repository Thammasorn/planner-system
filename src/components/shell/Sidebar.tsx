'use client'
import { usePathname } from 'next/navigation'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import MenuIcon from '@mui/icons-material/Menu'
import MenuOpenIcon from '@mui/icons-material/MenuOpen'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { th } from '@/i18n/th'
import { BOTTOM_NAV, PRIMARY_NAV, visibleNav } from './nav'
import { NavRow } from './NavRow'
import { SidebarProjects } from './SidebarProjects'
import { UserMenu } from './UserMenu'
import styles from './Sidebar.module.css'

/** Sidebar content (SPEC §8.1): used by the permanent <aside> and by the narrow-screen Drawer. Dense rows are plain
 *  elements + CSS Modules (PLAN.md §3.9); the active row has a background, bold text and a left bar (not colour only). */
export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean
  onToggle?: () => void
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const isManager = useCurrentUser()?.role === 'manager'
  const primary = visibleNav(PRIMARY_NAV, isManager)
  const bottom = visibleNav(BOTTOM_NAV, isManager)
  const toggleLabel = collapsed ? th.nav.expandSidebar : th.nav.collapseSidebar
  return (
    <div className={styles.root} data-collapsed={String(collapsed)}>
      <div className={styles.header}>
        {collapsed ? null : <span className={styles.appName}>{th.meta.appName}</span>}
        {onToggle ? (
          <Tooltip title={th.nav.toggleHint(toggleLabel)} describeChild placement="right">
            <IconButton
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              onClick={onToggle}
            >
              {collapsed ? <MenuIcon /> : <MenuOpenIcon />}
            </IconButton>
          </Tooltip>
        ) : null}
      </div>
      <nav aria-label={th.nav.sidebarLabel} className={styles.nav}>
        <div className={styles.top}>
          <ul className={styles.list}>
            {primary.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
          <SidebarProjects collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
        </div>
        {bottom.length > 0 ? (
          <ul className={styles.list}>
            {bottom.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        ) : null}
      </nav>
      <div className={styles.footer}>
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  )
}
