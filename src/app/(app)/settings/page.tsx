import { redirect } from 'next/navigation'
import { requireManagerPage } from '@/server/session'

/** `/settings` → the first tab (M1-D21). */
export default async function SettingsPage(): Promise<never> {
  await requireManagerPage()
  redirect('/settings/employees')
}
