'use client'
import { useId, useLayoutEffect, useRef, useState, type SubmitEvent } from 'react'
import { useRouter } from 'next/navigation'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ColorSwatchPicker } from '@/components/common/ColorSwatchPicker'
import { PersonPicker } from '@/components/common/PersonPicker'
import { helperText, zodFieldErrors, type FieldErrors } from '@/components/forms/field-errors'
import type { Certainty } from '@/domain/types'
import { useClientOptions } from '@/hooks/useClientOptions'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type { ClientOption } from '@/lib/contracts/clients'
import type { PersonOption } from '@/lib/contracts/people'
import type { ProjectHeader } from '@/lib/contracts/projects'
import { invalidateLoad, invalidateProjects } from '@/lib/invalidate'
import { DEFAULT_PROJECT_COLOR } from '@/lib/project-colors'
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '@/lib/schemas/projects'
import { createProject, updateProject } from '@/server/actions/projects'
import { projectTabHref } from './project-tabs'

export interface ProjectFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  /** required in edit mode */
  project?: ProjectHeader
  onClose: () => void
}

/**
 * Create (manager) / edit (manager, LEAD) a project (FR-401, FR-405, M2-D15). Only the name is required (P1);
 * colour defaults to #2F5597 and certainty to CONFIRMED (P5); the LEAD is optional (X61, create only). Edit sends
 * only the changed fields. Every opening mounts a fresh form.
 */
export function ProjectFormDialog(props: ProjectFormDialogProps) {
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
      <ProjectForm key={session} {...props} titleId={titleId} onBusyChange={setBusy} />
    </Dialog>
  )
}

interface Values {
  name: string
  client: ClientOption | null
  code: string
  color: string
  certainty: Certainty
  certaintyNote: string
  lead: PersonOption | null
}

function initialValues(p: ProjectHeader | undefined): Values {
  return {
    name: p?.name ?? '',
    client: p?.client ?? null,
    code: p?.code ?? '',
    color: p?.color ?? DEFAULT_PROJECT_COLOR,
    certainty: p?.certainty ?? 'CONFIRMED',
    certaintyNote: p?.certaintyNote ?? '',
    lead: null,
  }
}

/**
 * KEY-03 / SPEC §8.9: a failed save must not leave focus on <body> (the submit button was disabled while pending,
 * so Esc would do nothing). Focus the first invalid field, else the name field.
 */
function focusAfterFailure(form: HTMLFormElement | null): void {
  const target =
    form?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
    form?.querySelector<HTMLElement>('input[name="name"]')
  target?.focus()
}

const clientLabel = (c: ClientOption): string => (c.code ? `${c.name} (${c.code})` : c.name)
const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

function createInput(v: Values): CreateProjectInput {
  return {
    name: v.name,
    clientId: v.client?.id ?? null,
    ...(v.code.trim() ? { code: v.code } : {}),
    color: v.color,
    certainty: v.certainty,
    ...(v.certainty === 'TENTATIVE' && v.certaintyNote.trim() ? { certaintyNote: v.certaintyNote } : {}),
    leadUserId: v.lead?.id ?? null,
  }
}

/** Only what differs from the header (undefined = unchanged; null = clear). The note is kept when switching back. */
function updateInput(p: ProjectHeader, v: Values): UpdateProjectInput {
  const input: UpdateProjectInput = { projectId: p.id }
  if (v.name.trim() !== p.name) input.name = v.name
  if ((v.client?.id ?? null) !== (p.client?.id ?? null)) input.clientId = v.client?.id ?? null
  if (orNull(v.code) !== p.code) input.code = v.code
  if (v.color.toUpperCase() !== p.color.toUpperCase()) input.color = v.color
  if (v.certainty !== p.certainty) input.certainty = v.certainty
  if (orNull(v.certaintyNote) !== (p.certaintyNote ?? null)) input.certaintyNote = v.certaintyNote
  return input
}

function ProjectForm({
  mode,
  project,
  onClose,
  titleId,
  onBusyChange,
}: ProjectFormDialogProps & { titleId: string; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [values, setValues] = useState(() => initialValues(project))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const clients = useClientOptions(mode === 'edit' ? (project?.id ?? null) : null, true)
  const people = usePeopleOptions({ enabled: mode === 'create' })
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((p) => ({ ...p, [k]: v }))

  const formRef = useRef<HTMLFormElement>(null)
  // Field errors: move focus in the same commit that shows them (ClientFormDialog does the same).
  useLayoutEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return
    focusAfterFailure(formRef.current)
  }, [fieldErrors])

  const fail = (err: unknown) => {
    onBusyChange(false) // in the same render as the error (onSettled runs a tick later)
    if (err instanceof ActionFailure && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
      setFieldErrors(err.fieldErrors)
      return
    }
    toast.error(err instanceof Error ? err.message : th.errors.INTERNAL)
    focusAfterFailure(formRef.current) // toast-only failure: no field is invalid → the name field
  }

  const create = useMutation({
    mutationFn: (input: CreateProjectInput) => unwrap(createProject(input)),
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onError: fail,
    onSuccess: async (r, input) => {
      toast.success(th.projects.toasts.created(input.name))
      await invalidateProjects(qc)
      onClose()
      router.push(projectTabHref(r.projectId, 'overview'))
    },
  })
  const update = useMutation({
    mutationFn: (input: UpdateProjectInput) => unwrap(updateProject(input)),
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onError: fail,
    onSuccess: async (r) => {
      await Promise.all([invalidateProjects(qc), r.certaintyChanged ? invalidateLoad(qc) : undefined])
      toast.success(th.projects.toasts.saved)
      onClose()
    },
  })
  const pending = create.isPending || update.isPending

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending) return
    if (mode === 'create') {
      const parsed = createProjectSchema.safeParse(createInput(values))
      if (!parsed.success) return setFieldErrors(zodFieldErrors(parsed.error))
      setFieldErrors({})
      create.mutate(parsed.data)
    } else {
      if (!project) return
      const input = updateInput(project, values)
      if (Object.keys(input).length === 1) return onClose() // nothing changed
      const parsed = updateProjectSchema.safeParse(input)
      if (!parsed.success) return setFieldErrors(zodFieldErrors(parsed.error))
      setFieldErrors({})
      update.mutate(parsed.data)
    }
  }

  // The current (possibly archived) client stays selectable before and after the options load (M2-D04).
  const clientOptions = [...(clients.data ?? [])]
  if (values.client && !clientOptions.some((c) => c.id === values.client?.id))
    clientOptions.push(values.client)

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
        {mode === 'create' ? th.projects.createTitle : th.projects.editTitle}
      </DialogTitle>
      <DialogContent dividers data-light-form="">
        <Stack spacing={2.5}>
          <TextField
            label={th.projects.fields.name}
            name="name"
            required
            fullWidth
            autoFocus
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            error={Boolean(err('name')?.length)}
            helperText={helperText(err('name'))}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <Autocomplete<ClientOption, false, false, false>
            options={clientOptions}
            value={values.client}
            onChange={(_e, c) => set('client', c)}
            loading={clients.isLoading}
            loadingText={th.common.loading}
            // P4: a failed options fetch must not read as "no clients" (PersonPicker does the same).
            noOptionsText={clients.isError ? th.projects.errors.clientOptionsLoadError : undefined}
            getOptionLabel={clientLabel}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderOption={(props, option) => {
              const { key, ...rest } = props
              return (
                <Box
                  component="li"
                  key={key}
                  {...rest}
                  sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
                >
                  <span>{clientLabel(option)}</span>
                  {option.archived ? (
                    <Chip size="small" label={th.clients.archivedChip} sx={{ height: 20 }} />
                  ) : null}
                </Box>
              )
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={th.projects.fields.client}
                placeholder={th.projects.fields.noClient}
                error={Boolean(err('clientId')?.length)}
                helperText={
                  clients.isError ? (
                    <>
                      {helperText(err('clientId'))}
                      {th.projects.errors.clientOptionsLoadError}
                      <Button
                        size="small"
                        onClick={() => void clients.refetch()}
                        sx={{ ml: 1, py: 0, minWidth: 0 }}
                      >
                        {th.common.retry}
                      </Button>
                    </>
                  ) : (
                    helperText(err('clientId'))
                  )
                }
                slotProps={{
                  ...params.slotProps,
                  inputLabel: { ...params.slotProps.inputLabel, shrink: true },
                  input: {
                    ...params.slotProps.input,
                    startAdornment: values.client?.archived ? (
                      <Chip size="small" label={th.clients.archivedChip} sx={{ height: 20, mr: 0.5 }} />
                    ) : (
                      params.slotProps.input.startAdornment
                    ),
                  },
                }}
              />
            )}
          />
          <TextField
            label={th.projects.fields.code}
            name="code"
            value={values.code}
            onChange={(e) => set('code', e.target.value)}
            error={Boolean(err('code')?.length)}
            helperText={helperText(err('code'))}
            slotProps={{ htmlInput: { maxLength: 20 } }}
            sx={{ maxWidth: 240 }}
          />
          <ColorSwatchPicker
            label={th.projects.fields.color}
            value={values.color}
            onChange={(c) => {
              if (c) set('color', c)
            }}
          />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }} id={`${titleId}-certainty`}>
              {th.projects.fields.certainty}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={values.certainty}
              onChange={(_e, v: Certainty | null) => {
                if (v) set('certainty', v)
              }}
              aria-labelledby={`${titleId}-certainty`}
            >
              <ToggleButton value="CONFIRMED">{th.projects.certainty.CONFIRMED}</ToggleButton>
              <ToggleButton value="TENTATIVE" aria-label={th.projects.certainty.TENTATIVE}>
                <Box component="span" aria-hidden="true" sx={{ mr: 0.5 }}>
                  {th.projects.tentativeGlyph}
                </Box>
                {th.projects.certainty.TENTATIVE}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {values.certainty === 'TENTATIVE' ? (
            <TextField
              label={th.projects.fields.certaintyNote}
              name="certaintyNote"
              fullWidth
              multiline
              minRows={2}
              value={values.certaintyNote}
              onChange={(e) => set('certaintyNote', e.target.value)}
              error={Boolean(err('certaintyNote')?.length)}
              helperText={helperText(err('certaintyNote'))}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          ) : null}
          {mode === 'create' ? (
            <PersonPicker
              label={th.projects.fields.lead}
              options={people.data ?? []}
              loading={people.isLoading}
              loadError={people.isError}
              onRetry={() => void people.refetch()}
              error={Boolean(err('leadUserId')?.length)}
              value={values.lead}
              onSelect={(p) => set('lead', p)}
              onClear={() => set('lead', null)}
              helperText={helperText(err('leadUserId'), th.projects.fields.leadHint)}
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
