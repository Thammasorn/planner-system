'use client'
import { useId, useLayoutEffect, useRef, useState, type SubmitEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ColorSwatchPicker } from '@/components/common/ColorSwatchPicker'
import { helperText, zodFieldErrors, type FieldErrors } from '@/components/forms/field-errors'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type { ClientRef } from '@/lib/contracts/clients'
import { invalidateProjects } from '@/lib/invalidate'
import {
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type UpdateClientInput,
} from '@/lib/schemas/clients'
import { createClient, updateClient } from '@/server/actions/clients'

/** `note` undefined = not loaded (list rows): the note field is left out so an existing note is never overwritten. */
export type EditableClient = ClientRef & { note?: string | null }

export interface ClientFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  /** required in edit mode */
  client?: EditableClient
  onClose: () => void
}

/**
 * Create / edit a client (FR-301, M2-D07, M2-D15; manager only — the action re-checks). Only the name is required;
 * a taken name (archived ones included) shows the server's CONFLICT message under the name field.
 */
export function ClientFormDialog(props: ClientFormDialogProps) {
  const { open, onClose } = props
  const titleId = useId()
  const [prevOpen, setPrevOpen] = useState(open)
  const [session, setSession] = useState(0)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setSession((s) => s + 1)
  }
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
    >
      <ClientForm key={session} {...props} titleId={titleId} onBusyChange={setBusy} />
    </Dialog>
  )
}

interface Values {
  name: string
  code: string
  color: string | null
  note: string
}

const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

function updateInput(c: EditableClient, v: Values, withNote: boolean): UpdateClientInput {
  const input: UpdateClientInput = { clientId: c.id }
  if (v.name.trim() !== c.name) input.name = v.name
  if (orNull(v.code) !== c.code) input.code = v.code
  if ((v.color?.toUpperCase() ?? null) !== (c.color?.toUpperCase() ?? null)) input.color = v.color
  if (withNote && orNull(v.note) !== (c.note ?? null)) input.note = v.note
  return input
}

function ClientForm({
  mode,
  client,
  onClose,
  titleId,
  onBusyChange,
}: ClientFormDialogProps & { titleId: string; onBusyChange: (busy: boolean) => void }) {
  const qc = useQueryClient()
  const withNote = mode === 'create' || client?.note !== undefined
  const [values, setValues] = useState<Values>({
    name: client?.name ?? '',
    code: client?.code ?? '',
    color: client?.color ?? null,
    note: client?.note ?? '',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((p) => ({ ...p, [k]: v }))

  const formRef = useRef<HTMLFormElement>(null)
  // KEY-03 / a11y: a failed save leaves focus on <body> (the submit button was disabled while pending). Move it to
  // the first invalid field in the same commit that shows the error, so Esc closes the dialog at once.
  useLayoutEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [fieldErrors])

  const fail = (err: unknown) => {
    onBusyChange(false) // in the same render as the error (onSettled runs a tick later)
    if (err instanceof ActionFailure) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) return setFieldErrors(err.fieldErrors)
      if (err.code === 'CONFLICT') return setFieldErrors({ name: [err.message] }) // th.clients.errors.nameTaken
    }
    toast.error(err instanceof Error ? err.message : th.errors.INTERNAL)
    // toast-only failure (INTERNAL, network, FORBIDDEN): no field is invalid → the name field (never <body>)
    formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus()
  }
  const settle = {
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onError: fail,
  }
  const create = useMutation({
    mutationFn: (input: CreateClientInput) => unwrap(createClient(input)),
    ...settle,
    onSuccess: async (_r, input) => {
      toast.success(th.clients.toasts.created(input.name))
      await invalidateProjects(qc)
      onClose()
    },
  })
  const update = useMutation({
    mutationFn: (input: UpdateClientInput) => unwrap(updateClient(input)),
    ...settle,
    onSuccess: async () => {
      toast.success(th.clients.toasts.saved)
      await invalidateProjects(qc)
      onClose()
    },
  })
  const pending = create.isPending || update.isPending

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending) return
    if (mode === 'create') {
      const parsed = createClientSchema.safeParse({
        name: values.name,
        ...(values.code.trim() ? { code: values.code } : {}),
        ...(values.color ? { color: values.color } : {}),
        ...(values.note.trim() ? { note: values.note } : {}),
      })
      if (!parsed.success) return setFieldErrors(zodFieldErrors(parsed.error))
      setFieldErrors({})
      create.mutate(parsed.data)
    } else {
      if (!client) return
      const input = updateInput(client, values, withNote)
      if (Object.keys(input).length === 1) return onClose()
      const parsed = updateClientSchema.safeParse(input)
      if (!parsed.success) return setFieldErrors(zodFieldErrors(parsed.error))
      setFieldErrors({})
      update.mutate(parsed.data)
    }
  }

  const err = (k: string) => fieldErrors[k]
  return (
    <Box
      component="form"
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <DialogTitle id={titleId}>
        {mode === 'create' ? th.clients.createTitle : th.clients.editTitle}
      </DialogTitle>
      <DialogContent dividers data-light-form="">
        <Stack spacing={2.5}>
          <TextField
            label={th.clients.fields.name}
            name="name"
            required
            fullWidth
            autoFocus
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            error={Boolean(err('name')?.length)}
            helperText={helperText(err('name'))}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            label={th.clients.fields.code}
            name="code"
            value={values.code}
            onChange={(e) => set('code', e.target.value)}
            error={Boolean(err('code')?.length)}
            helperText={helperText(err('code'))}
            slotProps={{ htmlInput: { maxLength: 20 } }}
            sx={{ maxWidth: 240 }}
          />
          <ColorSwatchPicker
            label={th.clients.fields.color}
            value={values.color}
            onChange={(c) => set('color', c)}
            allowNone
          />
          {withNote ? (
            <TextField
              label={th.clients.fields.note}
              name="note"
              fullWidth
              multiline
              minRows={3}
              value={values.note}
              onChange={(e) => set('note', e.target.value)}
              error={Boolean(err('note')?.length)}
              helperText={helperText(err('note'))}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          {th.projects.cancel}
        </Button>
        <Button type="submit" variant="contained" disabled={pending}>
          {pending ? th.common.saving : th.projects.save}
        </Button>
      </DialogActions>
    </Box>
  )
}
