'use client'
// src/components/milestones/MilestoneForm.tsx — the one milestone form (name, date, description; project picker when
// `projects` is given) used by the overview section, the grid ◆-row popover and the palette dialog (plan/m08 S4.1,
// FR-701/702, M8-D11). Light form (SPEC §4.16, §8.12 tokens): controlled MUI inputs, validated on submit with the
// action's own field schemas; Enter in the name submits, Esc cancels.
// M11.1 (FR-709, M11.1-D1): the line colour — a radio group of five options, each a swatch + its Thai name (never
// colour alone; arrow keys move the choice like any radio group); submitted as `color` (default PURPLE).
import { useId, useState, type JSX, type KeyboardEvent, type SubmitEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { DateField } from '@/components/common/DateField'
import { helperText, zodFieldErrors, type FieldErrors } from '@/components/forms/field-errors'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { DEFAULT_MILESTONE_COLOR, MILESTONE_COLORS, type MilestoneColor } from '@/lib/contracts/milestones'
import { formatThaiDate } from '@/lib/format'
import { milestoneColorVar } from '@/lib/theme/tokens'
import { createMilestoneSchema, MILESTONE_NAME_MAX } from '@/lib/schemas/milestones'

export interface MilestoneFormValue {
  name: string
  date: ISODate | null
  description: string
  /** M11.1: absent = PURPLE */
  color?: MilestoneColor
}

export interface MilestoneFormProps {
  initial: MilestoneFormValue
  /** Project picker (palette: the create targets). */
  projects?: { id: string; name: string }[]
  projectId?: string
  readOnly?: boolean
  dense?: boolean
  submitLabel: string
  onSubmit: (v: {
    projectId?: string
    name: string
    date: ISODate
    description: string | null
    color: MilestoneColor
  }) => void
  onCancel: () => void
}

const valuesSchema = createMilestoneSchema.omit({ projectId: true })

/** A small ◆ in the milestone colour (decorative: the name always sits next to it). */
function Swatch({ color }: { color: MilestoneColor }): JSX.Element {
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-swatch={color}
      sx={{ color: milestoneColorVar(color), fontSize: 'var(--font-sm)', lineHeight: 1 }}
    >
      {th.milestones.diamond}
    </Box>
  )
}

export function MilestoneForm(p: MilestoneFormProps): JSX.Element {
  const colorId = useId()
  const [name, setName] = useState(p.initial.name)
  const [date, setDate] = useState<ISODate | null>(p.initial.date)
  const [description, setDescription] = useState(p.initial.description)
  const [color, setColor] = useState<MilestoneColor>(p.initial.color ?? DEFAULT_MILESTONE_COLOR)
  const [projectId, setProjectId] = useState(
    p.projectId !== undefined && (!p.projects || p.projects.some((x) => x.id === p.projectId))
      ? p.projectId
      : '',
  )
  const [errors, setErrors] = useState<FieldErrors>({})

  if (p.readOnly) {
    return (
      <Stack spacing={0.5}>
        <Typography variant="subtitle2" component="p">
          {p.initial.name}
        </Typography>
        {p.initial.date ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {formatThaiDate(p.initial.date)}
          </Typography>
        ) : null}
        <Typography variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <Swatch color={p.initial.color ?? DEFAULT_MILESTONE_COLOR} />
          {th.milestones.color.named(th.milestones.color.name[p.initial.color ?? DEFAULT_MILESTONE_COLOR])}
        </Typography>
        {p.initial.description.trim() !== '' ? (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {p.initial.description}
          </Typography>
        ) : null}
      </Stack>
    )
  }

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Dense mode hides the description input; its state stays = initial, so the grid's diff sees no change (S3).
    const parsed = valuesSchema.safeParse({ name, date, description })
    const next: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error)
    if (p.projects && projectId === '') next.projectId = [th.milestones.form.projectRequired]
    setErrors(next)
    if (!parsed.success || Object.keys(next).length > 0) return
    const v = parsed.data
    p.onSubmit({
      ...(p.projects ? { projectId } : {}),
      name: v.name,
      date: v.date,
      description: v.description ?? null,
      color,
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.code === 'Escape' || e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      p.onCancel()
    }
  }

  return (
    <Stack
      component="form"
      noValidate
      spacing={p.dense ? 1 : 1.5}
      aria-label={th.milestones.form.createTitle}
      onSubmit={submit}
      onKeyDown={onKeyDown}
    >
      {p.projects ? (
        <TextField
          select
          size="small"
          label={th.milestones.fields.project}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          error={Boolean(errors.projectId?.length)}
          helperText={helperText(errors.projectId)}
        >
          {p.projects.map((x) => (
            <MenuItem key={x.id} value={x.id}>
              {x.name}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
      <TextField
        size="small"
        label={th.milestones.fields.name}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        error={Boolean(errors.name?.length)}
        helperText={helperText(errors.name)}
        slotProps={{ htmlInput: { maxLength: MILESTONE_NAME_MAX } }}
      />
      <DateField label={th.milestones.fields.date} value={date} onChange={setDate} error={errors.date?.[0]} />
      <Box>
        <FormLabel id={`${colorId}-label`} sx={{ fontSize: 'var(--font-sm)' }}>
          {th.milestones.color.label}
        </FormLabel>
        <RadioGroup
          row
          aria-labelledby={`${colorId}-label`}
          name={`${colorId}-color`}
          value={color}
          onChange={(_e, v) => setColor(v as MilestoneColor)}
          data-testid="milestone-color"
          sx={{ columnGap: 0.5 }}
        >
          {MILESTONE_COLORS.map((c) => (
            <FormControlLabel
              key={c}
              value={c}
              control={
                <Radio size="small" slotProps={{ input: { 'aria-label': th.milestones.color.name[c] } }} />
              }
              label={
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <Swatch color={c} />
                  <span aria-hidden="true">{th.milestones.color.name[c]}</span>
                </Box>
              }
              sx={{ mr: 0.5, '& .MuiFormControlLabel-label': { fontSize: 'var(--font-sm)' } }}
              data-color-option={c}
            />
          ))}
        </RadioGroup>
      </Box>
      {p.dense ? null : (
        <TextField
          size="small"
          label={th.milestones.fields.description}
          value={description}
          multiline
          minRows={2}
          onChange={(e) => setDescription(e.target.value)}
          error={Boolean(errors.description?.length)}
          helperText={helperText(errors.description)}
        />
      )}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button size="small" onClick={p.onCancel}>
          {th.milestones.form.cancel}
        </Button>
        <Button size="small" variant="contained" type="submit">
          {p.submitLabel}
        </Button>
      </Stack>
    </Stack>
  )
}
