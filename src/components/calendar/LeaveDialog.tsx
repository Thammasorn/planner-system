'use client'
import { useId, useMemo, useState, type KeyboardEvent, type SubmitEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DateField } from '@/components/common/DateField'
import { PersonPicker } from '@/components/common/PersonPicker'
import { helperText, zodFieldErrors, type FieldErrors } from '@/components/forms/field-errors'
import { useUndo } from '@/components/undo/useUndo'
import type { HalfDay, ISODate } from '@/domain/types'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { LeaveTypesResponse } from '@/lib/contracts/leave-types'
import type { TimeOffImpact } from '@/lib/contracts/time-off'
import { displayName } from '@/lib/display-name'
import { formatLeaveRange } from '@/lib/format'
import { invalidateCalendar, invalidateLoad } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import {
  createTimeOffSchema,
  TIME_OFF_NOTE_MAX,
  updateTimeOffSchema,
  type CreateTimeOffInput,
  type UpdateTimeOffInput,
} from '@/lib/schemas/time-off'
import { createTimeOff, deleteTimeOff, restoreTimeOff, updateTimeOff } from '@/server/actions/time-off'
import { ImpactPanel } from './ImpactPanel'
import type { LeaveDialogArgs } from './LeaveDialogProvider'

export interface LeaveDialogProps {
  args: LeaveDialogArgs
  open: boolean
  onClose: () => void
  /** Closes after a delete; the provider then moves focus to `args.returnFocus` (the chip is gone). Default: onClose. */
  onDeleted?: () => void
}

type Duration = 'full' | HalfDay

/**
 * The focus trap starts on the dialog surface (MUI's focus target), outside the form: Enter there submits it, so
 * Shift+arrows → Enter on the calendar → Enter records the pre-filled range (P1, FR-908). Keys from inside the form
 * bubble here too and are left to the form's own handler.
 */
function onPaperKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  if (e.target !== e.currentTarget || e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
  const form = e.currentTarget.querySelector('form')
  if (!form) return
  e.preventDefault()
  form.requestSubmit()
}

/**
 * Record / edit own leave (FR-903…906, FR-909, M5-D6/D14). Full-screen below `sm` (NFR-07b). Two date pickers (X50);
 * half days only for a single day; type defaults to the first active one; managers pick the employee (fixed when
 * editing). Effective on save (FR-904): the body switches to the capacity impact. Overlaps show the server's message
 * in an alert and keep the dialog open (FR-905). Delete has no confirm: undo toast + Cmd/Ctrl+Z (FR-909).
 */
export function LeaveDialog({ args, open, onClose, onDeleted }: LeaveDialogProps) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
      slotProps={{ paper: { onKeyDown: onPaperKeyDown } }}
    >
      <LeaveForm
        args={args}
        onClose={onClose}
        onDeleted={onDeleted ?? onClose}
        titleId={titleId}
        onBusyChange={setBusy}
      />
    </Dialog>
  )
}

function LeaveForm({
  args,
  onClose,
  onDeleted,
  titleId,
  onBusyChange,
}: {
  args: LeaveDialogArgs
  onClose: () => void
  onDeleted: () => void
  titleId: string
  onBusyChange: (busy: boolean) => void
}) {
  const qc = useQueryClient()
  const undo = useUndo()
  const today = useToday()
  const me = useCurrentUser()
  const isManager = me?.role === 'manager'
  const edit = args.mode === 'edit' ? args.entry : null
  const create = args.mode === 'create' ? args : null

  const [userId, setUserId] = useState<string | null>(edit?.userId ?? create?.userId ?? me?.id ?? null)
  const [startDate, setStartDate] = useState<ISODate | null>(edit?.startDate ?? create?.startDate ?? today)
  const [endDate, setEndDate] = useState<ISODate | null>(
    edit?.endDate ?? create?.endDate ?? create?.startDate ?? today,
  )
  const [duration, setDuration] = useState<Duration>(edit?.half ?? 'full')
  const [typeId, setTypeId] = useState<string | null>(edit?.leaveTypeId ?? null)
  const [note, setNote] = useState(edit?.note ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [impact, setImpact] = useState<TimeOffImpact | null>(null)
  const [deleting, setDeleting] = useState(false)

  const typesQ = useQuery({
    queryKey: qk.leaveTypes(),
    queryFn: ({ signal }) => getJson<LeaveTypesResponse>('/api/leave-types', { signal }),
  })
  const people = usePeopleOptions({ enabled: isManager })

  const typeOptions = useMemo(() => {
    const active = (typesQ.data?.leaveTypes ?? []).map((t) => ({ id: t.id, label: t.name }))
    // Editing an entry whose type is archived (or otherwise not offered): keep it selectable (M5-D6).
    if (edit && !active.some((t) => t.id === edit.leaveTypeId)) {
      const label = edit.leaveTypeArchived
        ? th.timeOff.dialog.archivedType(edit.leaveTypeName)
        : edit.leaveTypeName
      return [...active, { id: edit.leaveTypeId, label }]
    }
    return active
  }, [typesQ.data, edit])
  const leaveTypeId = typeId ?? typeOptions[0]?.id ?? ''
  // Recording needs the type list (P5); an edit can always keep its own type.
  const typesReady = typesQ.data !== undefined || edit !== null

  const singleDay = startDate !== null && startDate === endDate
  const isMultiDay = (s: ISODate | null, e: ISODate | null) => s !== null && e !== null && s !== e
  const clearError = (...fields: string[]) => {
    if (fields.some((f) => errors[f]))
      setErrors((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !fields.includes(k))))
  }
  const onStart = (v: ISODate | null) => {
    setStartDate(v)
    const end = v !== null && endDate !== null && v > endDate ? v : endDate // start past end moves end along
    if (end !== endDate) setEndDate(end)
    if (isMultiDay(v, end)) setDuration('full')
    clearError('startDate', 'endDate', 'half')
  }
  const onEnd = (v: ISODate | null) => {
    setEndDate(v)
    if (isMultiDay(startDate, v)) setDuration('full')
    clearError('endDate', 'half')
  }

  const refreshViews = () => Promise.all([invalidateCalendar(qc), invalidateLoad(qc)]).then(() => {})

  const save = useMutation({
    mutationFn: (
      input: { kind: 'create'; v: CreateTimeOffInput } | { kind: 'update'; v: UpdateTimeOffInput },
    ) => (input.kind === 'create' ? unwrap(createTimeOff(input.v)) : unwrap(updateTimeOff(input.v))),
    onMutate: () => {
      setFormError(null)
      onBusyChange(true)
    },
    onSettled: () => onBusyChange(false),
    onSuccess: (r) => {
      setImpact(r.impact)
      void refreshViews()
    },
    onError: (err) => {
      if (err instanceof ActionFailure && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setErrors(err.fieldErrors)
        return
      }
      // OVERLAP names the conflicting entry (FR-905); every other failure is shown the same way.
      setFormError(err instanceof Error ? err.message : th.errors.INTERNAL)
    },
  })

  const submit = () => {
    if (save.isPending || deleting || !typesReady) return
    const half = duration === 'full' ? null : duration
    const base = { leaveTypeId, startDate: startDate ?? '', endDate: endDate ?? '', half, note }
    if (edit) {
      const v: UpdateTimeOffInput = { id: edit.id, ...base }
      const parsed = updateTimeOffSchema.safeParse(v)
      if (!parsed.success) return setErrors(zodFieldErrors(parsed.error))
      setErrors({})
      save.mutate({ kind: 'update', v })
      return
    }
    if (userId === null) return setErrors({ userId: [th.timeOff.dialog.employeeRequired] })
    const v: CreateTimeOffInput = { ...(userId !== me?.id ? { userId } : {}), ...base }
    const parsed = createTimeOffSchema.safeParse(v)
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error))
    setErrors({})
    save.mutate({ kind: 'create', v })
  }

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    submit()
  }
  // Enter submits from any field (the date pickers' sections are not native inputs); not from the note, buttons
  // or comboboxes, which use Enter themselves.
  const onFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented || e.nativeEvent.isComposing) return
    const t = e.target
    if (!(t instanceof Element) || t.closest('textarea, button, [role="combobox"], [role="listbox"]')) return
    e.preventDefault()
    submit()
  }

  const remove = async () => {
    if (!edit || deleting) return
    const id = edit.id
    setDeleting(true)
    onBusyChange(true)
    setFormError(null)
    try {
      const r = await unwrap(deleteTimeOff({ id }))
      onBusyChange(false)
      onDeleted()
      const range = formatLeaveRange(r.startDate, r.endDate, r.half)
      let batch = r.batch // redo re-deletes; the entry keeps the newest batch (M5-D16)
      undo.push(
        {
          label: th.timeOff.undoLabel(range),
          undo: async () => {
            await unwrap(restoreTimeOff({ batch }))
            await refreshViews()
          },
          redo: async () => {
            batch = (await unwrap(deleteTimeOff({ id }))).batch
            await refreshViews()
          },
        },
        { toast: th.timeOff.deleted(range) },
      )
      void refreshViews()
    } catch (err) {
      onBusyChange(false)
      setFormError(err instanceof Error ? err.message : th.errors.INTERNAL)
    } finally {
      setDeleting(false)
    }
  }

  const title = edit ? th.timeOff.dialog.titleEdit : th.timeOff.dialog.titleCreate

  if (impact) {
    return (
      <>
        <DialogTitle id={titleId}>{title}</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            {th.timeOff.dialog.saved}
          </Alert>
          <ImpactPanel impact={impact} />
        </DialogContent>
        <DialogActions>
          <Button variant="contained" autoFocus onClick={onClose}>
            {th.timeOff.dialog.close}
          </Button>
        </DialogActions>
      </>
    )
  }

  const peopleList = people.data ?? []
  const selectedPerson = peopleList.find((p) => p.id === userId) ?? null
  const editPersonName = edit ? (selectedPerson ? displayName(selectedPerson) : '') : ''
  const pending = save.isPending || deleting
  const typesLoading = typesQ.isPending && !typesReady
  const typesFailed = typesQ.isError && !typesReady
  const err = (f: string) => errors[f]?.[0]

  return (
    <Box component="form" noValidate onSubmit={onSubmit} onKeyDown={onFormKeyDown}>
      <DialogTitle id={titleId}>{title}</DialogTitle>
      {/* light inputs (FR-1604, M6.1 S4.6): no frame until hover / focus */}
      <DialogContent data-light-form="">
        <Stack spacing={2} sx={{ pt: 1 }}>
          {formError ? (
            <Alert severity="error" role="alert">
              {formError}
            </Alert>
          ) : null}
          {isManager ? (
            edit ? (
              <TextField
                label={th.timeOff.dialog.employee}
                value={editPersonName}
                disabled
                size="small"
                fullWidth
              />
            ) : (
              <PersonPicker
                label={th.timeOff.dialog.employee}
                options={peopleList}
                value={selectedPerson}
                onSelect={(p) => {
                  setUserId(p.id)
                  clearError('userId')
                }}
                onClear={() => setUserId(null)}
                loading={people.isPending}
                loadError={people.isError}
                onRetry={() => void people.refetch()}
                error={Boolean(err('userId'))}
                helperText={helperText(errors.userId)}
              />
            )
          ) : null}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <DateField
              label={th.timeOff.dialog.startDate}
              value={startDate}
              onChange={onStart}
              error={err('startDate')}
            />
            <DateField
              label={th.timeOff.dialog.endDate}
              value={endDate}
              onChange={onEnd}
              minDate={startDate ?? undefined}
              error={err('endDate')}
            />
          </Stack>
          <Box>
            <FormLabel component="div" id={`${titleId}-duration`} sx={{ mb: 0.5, fontSize: 'var(--font-md)' }}>
              {th.timeOff.dialog.duration}
            </FormLabel>
            <ToggleButtonGroup
              exclusive
              size="small"
              color="primary"
              value={duration}
              onChange={(_e, v: Duration | null) => {
                if (v) setDuration(v)
                clearError('half')
              }}
              aria-labelledby={`${titleId}-duration`}
            >
              <ToggleButton value="full">{th.timeOff.dialog.full}</ToggleButton>
              <ToggleButton value="AM" disabled={!singleDay}>
                {th.timeOff.dialog.am}
              </ToggleButton>
              <ToggleButton value="PM" disabled={!singleDay}>
                {th.timeOff.dialog.pm}
              </ToggleButton>
            </ToggleButtonGroup>
            {err('half') ? (
              <FormHelperText error>{err('half')}</FormHelperText>
            ) : !singleDay ? (
              <FormHelperText>{th.timeOff.dialog.halfOnlySingleDay}</FormHelperText>
            ) : null}
          </Box>
          {typesFailed ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => void typesQ.refetch()}>
                  {th.common.retry}
                </Button>
              }
            >
              {th.timeOff.dialog.typesLoadError}
            </Alert>
          ) : null}
          <TextField
            select
            size="small"
            fullWidth
            label={th.timeOff.dialog.type}
            value={typeOptions.some((t) => t.id === leaveTypeId) ? leaveTypeId : ''}
            onChange={(e) => {
              setTypeId(e.target.value)
              clearError('leaveTypeId')
            }}
            disabled={typesLoading || typesFailed}
            error={Boolean(err('leaveTypeId'))}
            helperText={typesLoading ? th.timeOff.dialog.typesLoading : helperText(errors.leaveTypeId)}
          >
            {typeOptions.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={th.timeOff.dialog.note}
            placeholder={th.timeOff.dialog.notePlaceholder}
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              clearError('note')
            }}
            multiline
            minRows={2}
            size="small"
            fullWidth
            error={Boolean(err('note'))}
            helperText={helperText(errors.note)}
            slotProps={{ htmlInput: { maxLength: TIME_OFF_NOTE_MAX } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {edit ? (
          <Button
            color="error"
            startIcon={<DeleteOutlined />}
            onClick={() => void remove()}
            disabled={pending}
            sx={{ mr: 'auto' }}
          >
            {th.timeOff.dialog.delete}
          </Button>
        ) : null}
        <Button onClick={onClose} disabled={pending}>
          {th.timeOff.dialog.cancel}
        </Button>
        <Button type="submit" variant="contained" disabled={pending || !typesReady}>
          {th.timeOff.dialog.save}
        </Button>
      </DialogActions>
    </Box>
  )
}
