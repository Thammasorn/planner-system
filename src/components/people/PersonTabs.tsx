'use client'
import { useSelectedLayoutSegment } from 'next/navigation'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Link from '@/components/Link'
import { th } from '@/i18n/th'
import { PEOPLE_TABS, personTabHref } from './people-tabs'

/** Person page tabs แผนงาน · งาน · วันลา (FR-1008, M9-D14): link-tabs, value from the selected layout segment. */
export function PersonTabs({ userId }: { userId: string }) {
  const segment = useSelectedLayoutSegment()
  const tabs = [...PEOPLE_TABS].sort((a, b) => a.order - b.order)
  const value = tabs.some((t) => t.id === segment) ? segment : false
  return (
    <Tabs value={value} aria-label={th.people.tabs.label} sx={{ mb: 2 }}>
      {tabs.map((t) => (
        <Tab key={t.id} value={t.id} label={t.label} component={Link} href={personTabHref(userId, t.id)} />
      ))}
    </Tabs>
  )
}
