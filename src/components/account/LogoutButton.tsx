'use client'
import Button from '@mui/material/Button'
import { th } from '@/i18n/th'
import { useLogout } from './useLogout'

/** Always available on the account page, also while a password change is due (M1-D6). */
export function LogoutButton() {
  const { logout, pending } = useLogout()
  return (
    <Button onClick={logout} disabled={pending}>
      {th.nav.logout}
    </Button>
  )
}
