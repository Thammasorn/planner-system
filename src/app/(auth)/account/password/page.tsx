import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm'
import { LogoutButton } from '@/components/account/LogoutButton'
import { SignOutEverywhereButton } from '@/components/account/SignOutEverywhereButton'
import Link from '@/components/Link'
import { th } from '@/i18n/th'
import { firstParam, safeNext } from '@/lib/safe-next'
import { getSessionUser } from '@/server/session'

export const metadata: Metadata = { title: th.account.title }

/**
 * The account page (M1-D21): change own password (FR-105), sign out everywhere (FR-107), logout. While
 * `mustChangePassword` is set this is the only reachable page (FR-104, AC-103 — the proxy redirects here).
 */
export default async function AccountPasswordPage(props: PageProps<'/account/password'>) {
  const { next } = await props.searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        {th.account.title}
      </Typography>
      {user.mustChangePassword ? <Alert severity="warning">{th.account.mustChangeBanner}</Alert> : null}
      <ChangePasswordForm email={user.email} next={safeNext(firstParam(next))} />
      <Divider />
      <SignOutEverywhereButton />
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        {user.mustChangePassword ? (
          <span />
        ) : (
          <Button component={Link} href="/home">
            {th.common.backHome}
          </Button>
        )}
        <LogoutButton />
      </Stack>
    </Stack>
  )
}
