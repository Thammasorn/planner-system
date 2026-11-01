'use client'
import { useSelectedLayoutSegment } from 'next/navigation'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Link from '@/components/Link'
import { th } from '@/i18n/th'
import { projectTabHref, sortedProjectTabs } from './project-tabs'

/** Project tab bar (FR-408): one link-tab per PROJECT_TABS entry, in `order`; only built tabs exist (X15). */
export function ProjectTabs({ projectId }: { projectId: string }) {
  const segment = useSelectedLayoutSegment()
  const tabs = sortedProjectTabs()
  const value = tabs.some((t) => t.id === segment) ? segment : false
  return (
    <Tabs
      value={value}
      aria-label={th.projects.tabsLabel}
      sx={{ mb: 3 }}
    >
      {tabs.map((t) => (
        <Tab
          key={t.id}
          value={t.id}
          label={t.label}
          component={Link}
          href={projectTabHref(projectId, t.id)}
        />
      ))}
    </Tabs>
  )
}
