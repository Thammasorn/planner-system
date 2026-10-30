'use client'
import { useState, useTransition, type SubmitEvent } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { helperText, zodFieldErrors, type FieldErrors } from '@/components/forms/field-errors'
import { th } from '@/i18n/th'
import { loginInput } from '@/lib/schemas/account'
import { login } from '@/server/actions/auth'
import { hardNavigate } from './hard-navigate'

/**
 * FR-101: email + password. Errors (wrong credentials, deactivated, locked out — FR-106) come back as one Thai
 * message in an alert. Success does a full navigation to `redirectTo` (`next` or /home, X32, M1-D7).
 */
export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [navigating, setNavigating] = useState(false)
  const [pending, startTransition] = useTransition()
  const busy = pending || navigating

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    const parsed = loginInput.safeParse({ email, password, next })
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error))
      setError(null)
      return
    }
    setFieldErrors({})
    startTransition(async () => {
      const r = await login({ email, password, next })
      if (!r.ok) {
        setError(r.message)
        setFieldErrors(r.fieldErrors ?? {})
        return
      }
      setNavigating(true)
      hardNavigate(r.redirectTo)
    })
  }

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={onSubmit}>
      <Typography variant="h5" component="h1">
        {th.auth.loginTitle}
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <TextField
        label={th.auth.email}
        type="email"
        name="email"
        autoComplete="username"
        autoFocus
        required
        fullWidth
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={Boolean(fieldErrors.email?.length)}
        helperText={helperText(fieldErrors.email)}
      />
      <TextField
        label={th.auth.password}
        type="password"
        name="password"
        autoComplete="current-password"
        required
        fullWidth
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={Boolean(fieldErrors.password?.length)}
        helperText={helperText(fieldErrors.password)}
      />
      <Button type="submit" variant="contained" size="medium" disabled={busy}>
        {busy ? th.auth.submitting : th.auth.submit}
      </Button>
      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
        {th.auth.noSignUp}
      </Typography>
    </Stack>
  )
}
