'use client'
import { usePathname } from 'next/navigation'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Link from '@/components/Link'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { th } from '@/i18n/th'

const TABS = [
  { href: '/settings/employees', label: th.nav.employees },
  { href: '/settings/positions', label: th.nav.positions },
  // M5 (M5-D15)
  { href: '/settings/holidays', label: th.nav.holidays },
  { href: '/settings/leave-types', label: th.nav.leaveTypes },
] as const

const currentTab = (pathname: string) =>
  TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))

/** The /settings header bar (FR-1603): ตั้งค่า › <current tab> (the <h1>); each list portals its one primary action
 *  ("เพิ่ม…") into the bar through `HeaderActions` (M6.1-D23). */
export function SettingsHeader() {
  const tab = currentTab(usePathname())
  return (
    <PageHeaderBar
      flush
      crumbs={
        tab
          ? [
              { label: th.nav.settings, href: TABS[0].href },
              { label: tab.label, asHeading: true },
            ]
          : [{ label: th.nav.settings, asHeading: true }]
      }
    />
  )
}

/** Link tabs of /settings (M1-D21); the current one carries aria-current + the MUI indicator. */
export function SettingsTabs() {
  const current = currentTab(usePathname())?.href ?? false
  return (
    <Tabs value={current} aria-label={th.nav.settings} sx={{ mb: 3 }}>
      {TABS.map((t) => (
        <Tab
          key={t.href}
          value={t.href}
          label={t.label}
          component={Link}
          href={t.href}
          aria-current={current === t.href ? 'page' : undefined}
        />
      ))}
    </Tabs>
  )
}
