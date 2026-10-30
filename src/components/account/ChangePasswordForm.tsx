'use client'
import { useState, useTransition, type SubmitEvent } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { toast } from 'sonner'
import { helperText, mergeFieldErrors, zodFieldErrors, type FieldErrors } from '@/components/forms/field-errors'
import { th } from '@/i18n/th'
import { changePasswordInput, passwordPolicy } from '@/lib/schemas/account'
import { changeOwnPassword } from '@/server/actions/auth'
import { hardNavigate } from './hard-navigate'

/**
 * FR-105 / X60: current password required; the new one is 8–128 characters, differs from the email (and its local
 * part) and from the current one; confirmation must match. The same rules run in the action. Success → full
 * navigation to `next` or /home (X32, M1-D7).
 */
export function ChangePasswordForm({ email, next }: { email: string; next: string }) {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [navigating, setNavigating] = useState(false)
  const [pending, startTransition] = useTransition()
  const busy = pending || navigating

  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    const input = { ...values, next }
    const parsed = changePasswordInput.safeParse(input)
    const policy = passwordPolicy(values.newPassword, { email, currentPassword: values.currentPassword })
    const errors = mergeFieldErrors(parsed.success ? undefined : zodFieldErrors(parsed.error), {
      newPassword: policy.map((i) => th.account.policy[i]),
    })
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError(null)
      return
    }
    setFieldErrors({})
    startTransition(async () => {
      const r = await changeOwnPassword(input)
      if (!r.ok) {
        if (r.code === 'INVALID_PASSWORD') {
          setFieldErrors({ currentPassword: r.fieldErrors?.currentPassword ?? [r.message] })
          setError(null)
        } else if (r.fieldErrors && Object.keys(r.fieldErrors).length > 0) {
          setFieldErrors(r.fieldErrors)
          setError(null)
        } else {
          setError(r.message)
        }
        return
      }
      toast.success(th.account.changed)
      setNavigating(true)
      hardNavigate(r.redirectTo)
    })
  }

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={onSubmit}>
      <Typography variant="h6" component="h2">
        {th.account.changePasswordTitle}
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {/* hidden username field so password managers pair the new password with the right account */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <TextField
        label={th.account.currentPassword}
        type="password"
        name="currentPassword"
        autoComplete="current-password"
        required
        fullWidth
        value={values.currentPassword}
        onChange={set('currentPassword')}
        error={Boolean(fieldErrors.currentPassword?.length)}
        helperText={helperText(fieldErrors.currentPassword)}
      />
      <TextField
        label={th.account.newPassword}
        type="password"
        name="newPassword"
        autoComplete="new-password"
        required
        fullWidth
        value={values.newPassword}
        onChange={set('newPassword')}
        error={Boolean(fieldErrors.newPassword?.length)}
        helperText={helperText(fieldErrors.newPassword, th.account.policyHint)}
      />
      <TextField
        label={th.account.confirmPassword}
        type="password"
        name="confirmPassword"
        autoComplete="new-password"
        required
        fullWidth
        value={values.confirmPassword}
        onChange={set('confirmPassword')}
        error={Boolean(fieldErrors.confirmPassword?.length)}
        helperText={helperText(fieldErrors.confirmPassword)}
      />
      <Button type="submit" variant="contained" size="medium" disabled={busy}>
        {busy ? th.common.saving : th.account.submit}
      </Button>
    </Stack>
  )
}
