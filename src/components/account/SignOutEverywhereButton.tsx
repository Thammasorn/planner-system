'use client'
import { useTransition } from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { signOutEverywhere } from '@/server/actions/auth'
import { hardNavigate } from './hard-navigate'

/** FR-107: deletes every session of this user, this one included. No confirm — logging in again is the undo. */
export function SignOutEverywhereButton() {
  const queryClient = useQueryClient()
  const [pending, startTransition] = useTransition()
  const onClick = () =>
    startTransition(async () => {
      const r = await signOutEverywhere({})
      if (!r.ok && r.code !== 'UNAUTHENTICATED') {
        toast.error(r.message)
        return
      }
      queryClient.clear()
      hardNavigate(r.ok ? r.redirectTo : '/login')
    })
  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Button variant="outlined" onClick={onClick} disabled={pending}>
        {th.account.signOutEverywhere}
      </Button>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {th.account.signOutEverywhereHint}
      </Typography>
    </Stack>
  )
}
