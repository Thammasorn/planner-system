'use client'
// src/components/layout/PageHeaderBar.tsx — the 48 px header bar of every signed-in screen (FR-1603, SPEC §8.12,
// M6.1-D19): ☰ below 900 px (the shell drawer), optional ← back, the breadcrumb (`nav`, middle collapse into a menu
// when it has more than three crumbs), then the actions on the right with the status / lease / actions slots that the
// editor and `HeaderActions` portal into. Work screens make their last crumb the screen's <h1>; documents keep the big
// title in the column as the <h1> and show the last crumb as text.
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import MenuIcon from '@mui/icons-material/Menu'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { type JSX, type ReactNode, useState } from 'react'
import Link from '@/components/Link'
import { th } from '@/i18n/th'
import { slotRef } from './headerSlots'
import styles from './PageHeaderBar.module.css'
import { useShellDrawer } from './ShellDrawer'

export interface Crumb {
  label: string
  href?: string
  icon?: ReactNode
  /** The last crumb of a work screen is the screen's <h1> (M6.1-D19). */
  asHeading?: boolean
  /** Rendered instead of `label` (e.g. the project name with inline rename); `label` still names it in the … menu. */
  content?: ReactNode
}

export interface PageHeaderBarProps {
  crumbs: Crumb[]
  back?: { onClick(): void }
  actions?: ReactNode
  testId?: string
  /** No gap below the bar (a tab row sits directly under it, e.g. the project shell). */
  flush?: boolean
}

/** More than this many crumbs → first · … · last two (M6.1-D19). */
const MAX_VISIBLE = 3

const statusRef = slotRef('status')
const leaseRef = slotRef('lease')
const actionsRef = slotRef('actions')

function CrumbView({ c, current }: { c: Crumb; current: boolean }): JSX.Element {
  const body = (
    <>
      {c.icon}
      {c.content ?? <span className={styles.label}>{c.label}</span>}
    </>
  )
  if (c.asHeading)
    return (
      <h1 className={styles.heading} {...(current ? { 'aria-current': 'page' as const } : {})}>
        {body}
      </h1>
    )
  if (c.href && !current)
    return (
      <Link href={c.href} className={styles.crumbLink}>
        {body}
      </Link>
    )
  return (
    <span className={styles.crumb} {...(current ? { 'aria-current': 'page' as const } : {})}>
      {body}
    </span>
  )
}

function Collapsed({ hidden }: { hidden: Crumb[] }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconButton
        size="small"
        aria-label={th.layout.moreCrumbs}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : 'false'}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ fontSize: 'var(--font-md)', borderRadius: 'var(--radius-sm)', px: 0.5 }}
      >
        …
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {hidden.map((c, i) =>
          c.href ? (
            <MenuItem key={`${i}:${c.label}`} component={Link} href={c.href} onClick={() => setAnchor(null)}>
              {c.icon}
              {c.label}
            </MenuItem>
          ) : (
            <MenuItem key={`${i}:${c.label}`} disabled>
              {c.icon}
              {c.label}
            </MenuItem>
          ),
        )}
      </Menu>
    </>
  )
}

/** first · hidden[] · last two, or every crumb when there are at most three. */
export function collapseCrumbs(crumbs: readonly Crumb[]): { shown: Crumb[]; hidden: Crumb[]; at: number } {
  if (crumbs.length <= MAX_VISIBLE) return { shown: [...crumbs], hidden: [], at: -1 }
  const first = crumbs[0] as Crumb
  return { shown: [first, ...crumbs.slice(-2)], hidden: crumbs.slice(1, -2), at: 1 }
}

export function PageHeaderBar(p: PageHeaderBarProps): JSX.Element {
  const drawer = useShellDrawer()
  const { shown, hidden, at } = collapseCrumbs(p.crumbs)
  const views: ReactNode[] = shown.map((c, i) => (
    <CrumbView key={`c${i}:${c.label}`} c={c} current={i === shown.length - 1} />
  ))
  const items =
    hidden.length > 0
      ? [...views.slice(0, at), <Collapsed key="more" hidden={hidden} />, ...views.slice(at)]
      : views
  return (
    <div
      data-testid={p.testId ?? 'page-header'}
      className={styles.bar}
      style={p.flush ? { marginBottom: 0 } : undefined}
    >
      {drawer ? (
        <IconButton
          className={styles.menuButton}
          aria-label={th.layout.openMenu}
          data-shell-menu=""
          onClick={() => drawer.open()}
        >
          <MenuIcon fontSize="small" />
        </IconButton>
      ) : null}
      {p.back ? (
        <IconButton aria-label={th.layout.back} onClick={() => p.back?.onClick()}>
          <ArrowBackOutlined fontSize="small" />
        </IconButton>
      ) : null}
      <nav aria-label={th.layout.breadcrumb} className={styles.crumbs}>
        <ol className={styles.crumbList}>
          {items.map((node, i) => (
            <li key={i} className={styles.crumbItem}>
              {i > 0 ? (
                <span aria-hidden className={styles.sep}>
                  ›
                </span>
              ) : null}
              {node}
            </li>
          ))}
        </ol>
      </nav>
      <div className={styles.actions} data-testid="page-header-actions">
        {/* page-status-slot: the M4/M6 e2e contract of the save-status target (now in the header bar) */}
        <span ref={statusRef} className={styles.slot} data-slot="status" data-testid="page-status-slot" />
        <span ref={leaseRef} className={styles.slot} data-slot="lease" />
        {p.actions}
        <span ref={actionsRef} className={styles.slot} data-slot="actions" />
      </div>
    </div>
  )
}
