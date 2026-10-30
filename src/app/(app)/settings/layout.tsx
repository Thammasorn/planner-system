import type { ReactNode } from 'react'
import Typography from '@mui/material/Typography'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { th } from '@/i18n/th'
import { requireManagerPage } from '@/server/session'

/** Manager-only area: workers get a 404 (X41), decided before anything renders. Pages repeat the check, because
 *  layouts do not re-run on client navigation. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireManagerPage()
  return (
    <>
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
        {th.nav.settings}
      </Typography>
      <SettingsTabs />
      {children}
    </>
  )
}
