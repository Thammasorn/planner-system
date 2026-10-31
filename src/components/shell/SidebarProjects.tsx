'use client'
import { useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Add from '@mui/icons-material/Add'
import ChevronRight from '@mui/icons-material/ChevronRight'
import ExpandMore from '@mui/icons-material/ExpandMore'
import Link from '@/components/Link'
import { CertaintyBadge } from '@/components/common/CertaintyBadge'
import { ProjectFormDialog } from '@/components/projects/ProjectFormDialog'
import { projectTabHref, sortedProjectTabs } from '@/components/projects/project-tabs'
import { usePreferences } from '@/hooks/usePreferences'
import { useSidebar } from '@/hooks/useSidebar'
import { th } from '@/i18n/th'
import { sortByThai } from '@/lib/collate'
import type { SidebarProject } from '@/lib/contracts/sidebar'
import { PROJECTS_NAV } from './nav'
import { NavRow } from './NavRow'
import styles from './SidebarProjects.module.css'

const PROJECT_KEY = 'project:'
const nodeKey = (projectId: string) => `${PROJECT_KEY}${projectId}`

/** Moved to src/hooks/useSidebar.ts (M3: the nav badge reads it too); re-exported for existing imports. */
export { useSidebar }

function ProjectNode({
  project,
  expanded,
  onToggle,
  pathname,
  onNavigate,
}: {
  project: SidebarProject
  expanded: boolean
  onToggle: () => void
  pathname: string
  onNavigate: (() => void) | undefined
}) {
  const base = `/projects/${project.id}`
  const active = pathname === base || pathname.startsWith(`${base}/`)
  return (
    <li data-testid={`sidebar-project-${project.id}`}>
      <div className={styles.projectRow}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-label={expanded ? th.sidebar.collapse(project.name) : th.sidebar.expand(project.name)}
          onClick={onToggle}
        >
          {expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
        </button>
        <Link
          className={styles.link}
          href={projectTabHref(project.id, 'overview')}
          aria-current={active ? 'page' : undefined}
          onClick={onNavigate}
        >
          <span className={styles.swatch} style={{ backgroundColor: project.color }} aria-hidden="true" />
          <span className={styles.name}>{project.name}</span>
        </Link>
        <CertaintyBadge certainty={project.certainty} />
      </div>
      {expanded ? (
        <ul className={styles.sub}>
          {sortedProjectTabs().map((tab) => {
            const href = projectTabHref(project.id, tab.id)
            const current = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <li key={tab.id}>
                <Link
                  className={styles.subLink}
                  href={href}
                  aria-current={current ? 'true' : undefined}
                  onClick={onNavigate}
                >
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </li>
  )
}

/**
 * The sidebar "โปรเจค" section (SPEC §8.1, UI-01..03, M2-D08): header link to /projects with `+` for managers,
 * the visible non-archived projects sorted by compareThai (◐ for อาจไม่ทำ), expandable to the PROJECT_TABS
 * sub-links (expansion saved in the `sidebar.expanded` preference — never localStorage, X05), and
 * "ดูโปรเจคที่ archive" when the viewer can see archived projects. The collapsed rail shows only the header icon.
 */
export function SidebarProjects({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean
  pathname: string
  onNavigate: (() => void) | undefined
}) {
  const { data, isPending, isError, refetch } = useSidebar()
  const { prefs, setPreference } = usePreferences()
  const [createOpen, setCreateOpen] = useState(false)
  const stored = prefs['sidebar.expanded'] ?? []
  const expanded = new Set(stored)
  const projects = data ? sortByThai(data.projects, (p) => p.name) : []

  const toggle = (projectId: string) => {
    const key = nodeKey(projectId)
    // Drop keys of projects that are gone from the list, so the stored array stays small (≤ 500 entries).
    const live = new Set(projects.map((p) => nodeKey(p.id)))
    const kept = stored.filter((k) => !k.startsWith(PROJECT_KEY) || live.has(k))
    setPreference('sidebar.expanded', kept.includes(key) ? kept.filter((k) => k !== key) : [...kept, key])
  }

  const addButton =
    !collapsed && data?.canCreateProject ? (
      <Tooltip title={th.sidebar.newProject}>
        <IconButton size="small" aria-label={th.sidebar.newProject} onClick={() => setCreateOpen(true)}>
          <Add fontSize="small" />
        </IconButton>
      </Tooltip>
    ) : null

  return (
    <div className={styles.section} data-testid="sidebar-projects">
      <ul className={styles.list}>
        <NavRow
          item={PROJECTS_NAV}
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={onNavigate}
          exact
          action={addButton}
        />
      </ul>
      {collapsed ? null : (
        <>
          <ul className={styles.list} aria-label={th.sidebar.projectsHeading} aria-busy={isPending}>
            {isPending ? (
              <>
                <li className={styles.srOnly}>{th.common.loading}</li>
                {[0, 1, 2].map((i) => (
                  <li key={i} className={styles.skeleton} aria-hidden="true">
                    <Skeleton variant="text" width={`${70 - i * 12}%`} />
                  </li>
                ))}
              </>
            ) : isError && !data ? (
              <li className={styles.status} role="alert">
                {th.sidebar.loadError}
                <button type="button" className={styles.retry} onClick={() => void refetch()}>
                  {th.sidebar.retry}
                </button>
              </li>
            ) : projects.length === 0 ? (
              <li className={styles.status}>{th.sidebar.noProjects}</li>
            ) : (
              projects.map((p) => (
                <ProjectNode
                  key={p.id}
                  project={p}
                  expanded={expanded.has(nodeKey(p.id))}
                  onToggle={() => toggle(p.id)}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              ))
            )}
          </ul>
          {data?.hasArchived ? (
            <Link className={styles.footerLink} href="/projects?archived=1" onClick={onNavigate}>
              {th.sidebar.archivedLink}
            </Link>
          ) : null}
        </>
      )}
      {data?.canCreateProject ? (
        <ProjectFormDialog open={createOpen} mode="create" onClose={() => setCreateOpen(false)} />
      ) : null}
    </div>
  )
}
