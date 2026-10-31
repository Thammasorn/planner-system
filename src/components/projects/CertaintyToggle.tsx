'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Certainty } from '@/domain/types'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { invalidateLoad, invalidateProjects } from '@/lib/invalidate'
import { updateProject } from '@/server/actions/projects'
import { errorMessage } from './errors'

/**
 * FR-405 (part, M2-D03): switch certainty in place. Optimistic; the action's refresh() re-renders header/overview,
 * `invalidateProjects` updates the sidebar ◐ and `invalidateLoad` every load view — no reload. Reverts on error.
 */
export function CertaintyToggle({
  projectId,
  certainty,
  labelledBy,
}: {
  projectId: string
  certainty: Certainty
  labelledBy?: string
}) {
  const qc = useQueryClient()
  const [prev, setPrev] = useState(certainty)
  const [value, setValue] = useState(certainty)
  if (certainty !== prev) {
    setPrev(certainty)
    setValue(certainty)
  }
  const mutation = useMutation({
    mutationFn: (next: Certainty) => unwrap(updateProject({ projectId, certainty: next })),
    onMutate: (next) => setValue(next),
    onError: (err) => {
      setValue(certainty)
      toast.error(errorMessage(err))
    },
    onSuccess: async (_r, next) => {
      await Promise.all([invalidateLoad(qc), invalidateProjects(qc)])
      toast(th.projects.toasts.certaintyChanged(th.projects.certainty[next]))
    },
  })
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      // Not `disabled` while pending: disabling the button just pressed drops keyboard focus to <body> (SPEC §8.9,
      // KEY-03). The group stays focusable and ignores changes until the action settles.
      aria-disabled={mutation.isPending || undefined}
      onChange={(_e, next: Certainty | null) => {
        if (mutation.isPending) return
        if (next && next !== value) mutation.mutate(next)
      }}
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': th.projects.fields.certainty })}
    >
      <ToggleButton value="CONFIRMED">{th.projects.certainty.CONFIRMED}</ToggleButton>
      <ToggleButton value="TENTATIVE" aria-label={th.projects.certainty.TENTATIVE}>
        <Box component="span" aria-hidden="true" sx={{ mr: 0.75 }}>
          {th.projects.tentativeGlyph}
        </Box>
        {th.projects.certainty.TENTATIVE}
      </ToggleButton>
    </ToggleButtonGroup>
  )
}
