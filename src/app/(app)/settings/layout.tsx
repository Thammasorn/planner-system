import type { ReactNode } from 'react'
import { SettingsHeader, SettingsTabs } from '@/components/settings/SettingsTabs'
import { requireManagerPage } from '@/server/session'

/** Manager-only area: workers get a 404 (X41), decided before anything renders. Pages repeat the check, because
 *  layouts do not re-run on client navigation. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireManagerPage()
  return (
    <>
      <SettingsHeader />
      <SettingsTabs />
      {children}
    </>
  )
}
