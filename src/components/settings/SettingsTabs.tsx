'use client'
import { usePathname } from 'next/navigation'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Link from '@/components/Link'
import { th } from '@/i18n/th'

const TABS = [
  { href: '/settings/employees', label: th.nav.employees },
  { href: '/settings/positions', label: th.nav.positions },
] as const

/** Link tabs of /settings (M1-D21); the current one carries aria-current + the MUI indicator. */
export function SettingsTabs() {
  const pathname = usePathname()
  const current = TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? false
  return (
    <Tabs value={current} aria-label={th.nav.settings} sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
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
