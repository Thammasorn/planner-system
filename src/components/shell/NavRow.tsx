'use client'
import type { ReactNode } from 'react'
import Tooltip from '@mui/material/Tooltip'
import BusinessOutlined from '@mui/icons-material/BusinessOutlined'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined'
import FolderOutlined from '@mui/icons-material/FolderOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import InsertChartOutlined from '@mui/icons-material/InsertChartOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import ViewKanbanOutlined from '@mui/icons-material/ViewKanbanOutlined'
import Link from '@/components/Link'
import { WorkloadBadge, useWorkloadOverCount } from '@/components/workload/WorkloadBadge'
import { useSidebar } from '@/hooks/useSidebar'
import { th } from '@/i18n/th'
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
  calendar: CalendarMonthOutlined,
  // M9 (plan/m09 S0.9)
  workload: InsertChartOutlined,
  people: GroupsOutlined,
}

interface NavRowProps {
  item: NavItem
  pathname: string
  collapsed: boolean
  onNavigate: (() => void) | undefined
  exact?: boolean
  action?: ReactNode
  /** M9-D11: the server-rendered ●N of 'workloadOver' rows (X31); 0 when absent. */
  initialWorkloadOver?: number
}

/** One sidebar link row (icon + label; icon-only with a tooltip in the collapsed rail). `exact` marks it active only
 *  on its own path; `action` renders after the link in the same row (e.g. the projects section `+`). The badge kind
 *  picks the row variant — an exhaustive switch, so a new NavBadge fails typecheck until it is rendered here. */
export function NavRow(props: NavRowProps) {
  const badge: NavBadge | undefined = props.item.badge
  switch (badge) {
    case undefined:
      return <RowView {...props} count={null} badge={null} />
    case 'myTaskCount':
      return <MyTaskCountRow {...props} />
    case 'workloadOver':
      return <WorkloadOverRow {...props} />
    default: {
      const never: never = badge
      return never
    }
  }
}

/** M3-D40: "งานของฉัน N" from the sidebar query (text, not a dot); nothing while loading. */
function MyTaskCountRow(props: NavRowProps) {
  const count = useSidebar().data?.myTaskCount ?? null
  return (
    <RowView
      {...props}
      count={count}
      badge={
        count === null ? null : (
          <span className={styles.badge} data-testid={`nav-badge-${props.item.id}`}>
            {count}
          </span>
        )
      }
    />
  )
}

/** M9-D11: "Workload ทีม ●N" (hidden at 0); the collapsed rail names the number in its tooltip / label. */
function WorkloadOverRow(props: NavRowProps) {
  const initial = props.initialWorkloadOver ?? 0
  const n = useWorkloadOverCount(initial)
  return (
    <RowView
      {...props}
      count={n > 0 ? n : null}
      fullLabel={n > 0 ? `${props.item.label} ${th.workload.badge.label(n)}` : props.item.label}
      badge={<WorkloadBadge initial={initial} />}
    />
  )
}

function RowView({
  item,
  pathname,
  collapsed,
  onNavigate,
  exact,
  action,
  count,
  badge,
  fullLabel,
}: NavRowProps & {
  count: number | null
  badge: ReactNode
  /** The accessible name when a count shows (default "label N"). */
  fullLabel?: string
}) {
  const Icon = NAV_ICONS[item.icon]
  const active = exact ? pathname === item.href : isActive(pathname, item.activePrefix ?? item.href)
  const full = fullLabel ?? (count === null ? item.label : `${item.label} ${count}`)
  const needsLabel = collapsed || count !== null
  return (
    <li className={action ? styles.rowWithAction : undefined}>
      <Tooltip title={collapsed ? full : ''} placement="right">
        <Link
          className={styles.row}
          href={item.href}
          aria-current={active ? 'page' : undefined}
          aria-label={needsLabel ? full : undefined}
          data-nav-id={item.id}
          onClick={onNavigate}
        >
          <Icon className={styles.icon} fontSize="inherit" />
          {collapsed ? null : <span className={styles.label}>{item.label}</span>}
          {collapsed ? null : badge}
        </Link>
      </Tooltip>
      {action}
    </li>
  )
}
