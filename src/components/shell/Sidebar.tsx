'use client'
import { usePathname } from 'next/navigation'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import MenuIcon from '@mui/icons-material/Menu'
import MenuOpenIcon from '@mui/icons-material/MenuOpen'
import Link from '@/components/Link'
import { th } from '@/i18n/th'
import { BOTTOM_NAV, PRIMARY_NAV, isActive, type NavIcon, type NavItem } from './nav'
import styles from './Sidebar.module.css'

/** Every milestone that widens `NavIcon` adds its entry here, so typecheck catches a missing icon. */
const NAV_ICONS: Record<NavIcon, typeof HomeOutlined> = { home: HomeOutlined }

function NavRow({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  onNavigate: (() => void) | undefined
}) {
  const Icon = NAV_ICONS[item.icon]
  return (
    <li>
      <Tooltip title={collapsed ? item.label : ''} placement="right">
        <Link
          className={styles.row}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? 'page' : undefined}
          aria-label={collapsed ? item.label : undefined}
          data-nav-id={item.id}
          onClick={onNavigate}
        >
          <Icon className={styles.icon} fontSize="inherit" />
          {collapsed ? null : <span className={styles.label}>{item.label}</span>}
        </Link>
      </Tooltip>
    </li>
  )
}

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
        <ul className={styles.list}>
          {PRIMARY_NAV.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
        {BOTTOM_NAV.length > 0 ? (
          <ul className={styles.list}>
            {BOTTOM_NAV.map((item) => (
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
    </div>
  )
}
