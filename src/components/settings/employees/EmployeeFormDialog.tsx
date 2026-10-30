'use client'
import { useEffect, useId, useState, useTransition, type SubmitEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { toast } from 'sonner'
import { helperText, mergeFieldErrors, zodFieldErrors, type FieldErrors } from '@/components/forms/field-errors'
import { th } from '@/i18n/th'
import type { EmployeeRow, PositionRow, SystemRoleDTO } from '@/lib/contracts/users'
import { displayName } from '@/lib/display-name'
import { passwordPolicy } from '@/lib/schemas/account'
import { createEmployeeInput, DEFAULT_SCHEDULE, updateEmployeeInput } from '@/lib/schemas/employees'
import { USER_COLORS, type UserColor } from '@/lib/user-colors'
import { createEmployee, updateEmployee } from '@/server/actions/employees'
import { ColorPicker } from './ColorPicker'
import { PasswordField } from './PasswordField'
import { PasswordReveal } from './PasswordReveal'
import { ScheduleEditor, scheduleState, scheduleValue, type ScheduleRowState } from './ScheduleEditor'

export interface EmployeeFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  /** required in edit mode */
  employee?: EmployeeRow
  positions: readonly PositionRow[]
  onClose: () => void
}

/**
 * Create / edit an employee (FR-201…FR-203, FR-207). Every open mounts a fresh form (keyed session), so a
 * generated password never survives a close (AC-202). Esc, the backdrop and "ยกเลิก" close it — except while the
 * action is in flight, so a create cannot finish behind a closed dialog and lose the one-time password (AC-201).
 */
export function EmployeeFormDialog(props: EmployeeFormDialogProps) {
  const { open, onClose } = props
  const titleId = useId()
  // A new form state per opening ("store previous prop" pattern) — also when reopened mid-exit-transition.
  const [prevOpen, setPrevOpen] = useState(open)
  const [session, setSession] = useState(0)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setSession((s) => s + 1)
  }
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <EmployeeForm key={session} {...props} titleId={titleId} onBusyChange={setBusy} />
    </Dialog>
  )
}

interface Values {
  name: string
  nickname: string
  email: string
  positionId: string
  role: SystemRoleDTO
  color: UserColor | null
  password: string
  mustChangePassword: boolean
  schedule: ScheduleRowState[]
}

function initialValues(employee: EmployeeRow | undefined): Values {
  return {
    name: employee?.name ?? '',
    nickname: employee?.nickname ?? '',
    email: employee?.email ?? '',
    positionId: employee?.positionId ?? '',
    role: employee?.role ?? 'worker',
    color: USER_COLORS.find((c) => c === employee?.color?.toUpperCase()) ?? null,
    password: '',
    mustChangePassword: true,
    schedule: scheduleState(employee?.schedule ?? DEFAULT_SCHEDULE),
  }
}

function EmployeeForm({
  mode,
  employee,
  positions,
  onClose,
  titleId,
  onBusyChange,
}: EmployeeFormDialogProps & { titleId: string; onBusyChange: (busy: boolean) => void }) {
  const [values, setValues] = useState(() => initialValues(employee))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const [pending, startTransition] = useTransition()
  useEffect(() => onBusyChange(pending), [pending, onBusyChange])

  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((p) => ({ ...p, [k]: v }))

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending) return
    const profile = {
      name: values.name,
      nickname: values.nickname,
      email: values.email,
      positionId: values.positionId === '' ? null : values.positionId,
      role: values.role,
      schedule: scheduleValue(values.schedule),
    }
    const name = displayName({ name: values.name.trim(), nickname: values.nickname })
    if (mode === 'create') {
      const input = {
        ...profile,
        color: values.color,
        password: values.password,
        mustChangePassword: values.mustChangePassword,
      }
      const parsed = createEmployeeInput.safeParse(input)
      const policy = passwordPolicy(values.password, { email: values.email.trim().toLowerCase() })
      const errors = mergeFieldErrors(parsed.success ? undefined : zodFieldErrors(parsed.error), {
        password: policy.map((i) => th.account.policy[i]),
      })
      if (!show(errors)) return
      startTransition(async () => {
        const r = await createEmployee(input)
        if (!r.ok) return fail(r)
        toast(th.employees.created(name))
        setCreated({ email: values.email.trim().toLowerCase(), password: values.password })
      })
    } else {
      if (!employee) return
      const input = { userId: employee.id, ...profile, ...(values.color ? { color: values.color } : {}) }
      const parsed = updateEmployeeInput.safeParse(input)
      if (!show(parsed.success ? {} : zodFieldErrors(parsed.error))) return
      startTransition(async () => {
        const r = await updateEmployee(input)
        if (!r.ok) return fail(r)
        toast(th.employees.updated)
        onClose()
      })
    }
  }

  /** Shows client errors; true when there are none. */
  function show(errors: FieldErrors): boolean {
    const any = Object.values(errors).some((m) => m?.length)
    setFieldErrors(any ? errors : {})
    setError(null)
    return !any
  }

  function fail(r: { message: string; fieldErrors?: Record<string, string[]> }) {
    if (r.fieldErrors && Object.keys(r.fieldErrors).length > 0) {
      setFieldErrors(r.fieldErrors)
      setError(null)
    } else {
      setFieldErrors({})
      setError(r.message) // LAST_MANAGER, FORBIDDEN, INTERNAL …
    }
  }

  if (created) {
    return (
      <>
        <DialogTitle id={titleId}>{th.employees.createdTitle}</DialogTitle>
        <DialogContent>
          <PasswordReveal email={created.email} password={created.password} />
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onClose}>
            {th.common.close}
          </Button>
        </DialogActions>
      </>
    )
  }

  const err = (k: string) => fieldErrors[k]
  return (
    <Box component="form" noValidate onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <DialogTitle id={titleId}>{mode === 'create' ? th.employees.createTitle : th.employees.editTitle}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 7 }}>
              <TextField
                label={th.employees.fields.name}
                name="name"
                required
                fullWidth
                autoFocus
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                error={Boolean(err('name')?.length)}
                helperText={helperText(err('name'))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField
                label={th.employees.fields.nickname}
                name="nickname"
                fullWidth
                value={values.nickname}
                onChange={(e) => set('nickname', e.target.value)}
                error={Boolean(err('nickname')?.length)}
                helperText={helperText(err('nickname'))}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label={th.employees.fields.email}
                name="email"
                type="email"
                required
                fullWidth
                autoComplete="off"
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
                error={Boolean(err('email')?.length)}
                helperText={helperText(err('email'))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label={th.employees.fields.position}
                name="positionId"
                fullWidth
                value={values.positionId}
                onChange={(e) => set('positionId', e.target.value)}
                error={Boolean(err('positionId')?.length)}
                helperText={helperText(err('positionId'))}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              >
                <option value="">{th.users.noPosition}</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label={th.employees.fields.role}
                name="role"
                fullWidth
                value={values.role}
                onChange={(e) => set('role', e.target.value === 'manager' ? 'manager' : 'worker')}
                error={Boolean(err('role')?.length)}
                helperText={helperText(err('role'))}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              >
                <option value="worker">{th.employees.roles.worker}</option>
                <option value="manager">{th.employees.roles.manager}</option>
              </TextField>
            </Grid>
          </Grid>
          <ColorPicker value={values.color} onChange={(c) => set('color', c)} allowAuto={mode === 'create'} />
          <ScheduleEditor
            value={values.schedule}
            onChange={(s) => set('schedule', s)}
            errors={err('schedule')}
          />
          {mode === 'create' ? (
            <>
              <PasswordField
                label={th.employees.fields.initialPassword}
                value={values.password}
                onChange={(v) => set('password', v)}
                errors={err('password')}
              />
              <FormControlLabel
                label={th.employees.fields.mustChange}
                control={
                  <Checkbox
                    checked={values.mustChangePassword}
                    onChange={(e) => set('mustChangePassword', e.target.checked)}
                  />
                }
              />
            </>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          {th.common.cancel}
        </Button>
        <Button type="submit" variant="contained" disabled={pending}>
          {pending ? th.common.saving : th.common.save}
        </Button>
      </DialogActions>
    </Box>
  )
}
