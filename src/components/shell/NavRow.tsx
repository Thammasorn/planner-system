'use client'
import type { ReactNode } from 'react'
import Tooltip from '@mui/material/Tooltip'
import BusinessOutlined from '@mui/icons-material/BusinessOutlined'
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined'
import FolderOutlined from '@mui/icons-material/FolderOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import ViewKanbanOutlined from '@mui/icons-material/ViewKanbanOutlined'
import Link from '@/components/Link'
import { useSidebar } from '@/hooks/useSidebar'
import { isActive, type NavBadge, type NavIcon, type NavItem } from './nav'
import styles from './Sidebar.module.css'

/** Every milestone that widens `NavIcon` adds its entry here, so typecheck catches a missing icon. */
export const NAV_ICONS: Record<NavIcon, typeof HomeOutlined> = {
  home: HomeOutlined,
  settings: SettingsOutlined,
  projects: FolderOutlined,
  clients: BusinessOutlined,
  my: CheckBoxOutlined,
  teamTasks: ViewKanbanOutlined,
}

/** The badge's number, or null while loading / when there is none. */
function useBadgeCount(badge: NavBadge | undefined): number | null {
  const q = useSidebar()
  if (badge === undefined) return null
  return q.data?.myTaskCount ?? null
}

/** One sidebar link row (icon + label; icon-only with a tooltip in the collapsed rail). `exact` marks it active only
 *  on its own path; `action` renders after the link in the same row (e.g. the projects section `+`). */
export function NavRow({
  item,
  pathname,
  collapsed,
  onNavigate,
  exact,
  action,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  onNavigate: (() => void) | undefined
  exact?: boolean
  action?: ReactNode
}) {
  const Icon = NAV_ICONS[item.icon]
  const active = exact ? pathname === item.href : isActive(pathname, item.activePrefix ?? item.href)
  const count = useBadgeCount(item.badge)
  const full = count === null ? item.label : `${item.label} ${count}`
  return (
    <li className={action ? styles.rowWithAction : undefined}>
      <Tooltip title={collapsed ? full : ''} placement="right">
        <Link
          className={styles.row}
          href={item.href}
          aria-current={active ? 'page' : undefined}
          aria-label={collapsed || count !== null ? full : undefined}
          data-nav-id={item.id}
          onClick={onNavigate}
        >
          <Icon className={styles.icon} fontSize="inherit" />
          {collapsed ? null : <span className={styles.label}>{item.label}</span>}
          {collapsed || count === null ? null : (
            <span className={styles.badge} data-testid={`nav-badge-${item.id}`}>
              {count}
            </span>
          )}
        </Link>
      </Tooltip>
      {action}
    </li>
  )
}
