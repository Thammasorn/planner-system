'use client'
import { useEffect, useId, useState, useTransition, type SubmitEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import type { EmployeeRow } from '@/lib/contracts/users'
import { passwordPolicy } from '@/lib/schemas/account'
import { resetEmployeePassword } from '@/server/actions/employees'
import { PasswordField } from './PasswordField'
import { PasswordReveal } from './PasswordReveal'

/**
 * FR-204: set a new password for someone else → all their sessions drop and they must change it at next login.
 * The new password is shown once with a copy button, like after create. A fresh form per opening. Esc, the
 * backdrop and "ยกเลิก" are ignored while the reset is in flight, so the one-time password step cannot be lost.
 */
export function ResetPasswordDialog({ employee, onClose }: { employee: EmployeeRow | null; onClose: () => void }) {
  const titleId = useId()
  const open = employee !== null
  const [prevOpen, setPrevOpen] = useState(open)
  const [session, setSession] = useState(0)
  // Keep the last employee during the exit transition so the title does not flash.
  const [shown, setShown] = useState(employee)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setSession((s) => s + 1)
  }
  if (employee && employee !== shown) setShown(employee)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      {shown ? (
        <ResetForm key={session} employee={shown} titleId={titleId} onClose={onClose} onBusyChange={setBusy} />
      ) : null}
    </Dialog>
  )
}

function ResetForm({
  employee,
  titleId,
  onClose,
  onBusyChange,
}: {
  employee: EmployeeRow
  titleId: string
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  useEffect(() => onBusyChange(pending), [pending, onBusyChange])

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending) return
    const issues = passwordPolicy(password, { email: employee.email })
    if (issues.length > 0) {
      setErrors(issues.map((i) => th.account.policy[i]))
      return
    }
    setErrors([])
    startTransition(async () => {
      const r = await resetEmployeePassword({ userId: employee.id, password })
      if (!r.ok) {
        const fieldMsgs = r.fieldErrors?.password
        if (fieldMsgs?.length) setErrors(fieldMsgs)
        else setError(r.message)
        return
      }
      toast(th.employees.passwordReset(employee.displayName))
      setDone(true)
    })
  }

  const title = <DialogTitle id={titleId}>{th.employees.resetTitle(employee.displayName)}</DialogTitle>
  if (done) {
    return (
      <>
        {title}
        <DialogContent>
          <PasswordReveal email={employee.email} password={password} />
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onClose}>
            {th.common.close}
          </Button>
        </DialogActions>
      </>
    )
  }
  return (
    <Box component="form" noValidate onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {title}
      <DialogContent>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {th.employees.resetHint}
          </Typography>
          <PasswordField label={th.account.newPassword} value={password} onChange={setPassword} errors={errors} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          {th.common.cancel}
        </Button>
        <Button type="submit" variant="contained" disabled={pending}>
          {pending ? th.common.saving : th.employees.actions.resetPassword}
        </Button>
      </DialogActions>
    </Box>
  )
}
