'use client'
// src/components/milestones/MilestoneDialog.tsx — "สร้าง milestone" from Cmd+K (plan/m08 S4.1/S4.10, FR-702, M8-D18):
// MilestoneForm with the project picker over GET /api/milestones/targets. Success → close (the hook toasts "created").
import { useId, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { th } from '@/i18n/th'
import { MilestoneForm } from './MilestoneForm'
import { useMilestoneMutations } from './useMilestoneMutations'
import { useMilestoneTargets } from './useProjectMilestones'

export interface MilestoneDialogProps {
  open: boolean
  /** Pre-selected only when it is among the targets. */
  projectId?: string | undefined
  onClose: () => void
}

export function MilestoneDialog({ open, projectId, onClose }: MilestoneDialogProps) {
  const titleId = useId()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const targets = useMilestoneTargets(open)
  const ms = useMilestoneMutations()
  const [busy, setBusy] = useState(false)
  const projects = targets.data?.projects.map((p) => ({ id: p.id, name: p.name })) ?? []
  const preselect =
    projectId !== undefined && projects.some((p) => p.id === projectId) ? projectId : undefined
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      fullScreen={fullScreen}
      slotProps={{ paper: { 'aria-labelledby': titleId } }}
    >
      <DialogTitle id={titleId}>{th.milestones.form.createTitle}</DialogTitle>
      <DialogContent>
        {targets.isPending ? (
          <Typography role="status" variant="body2" sx={{ color: 'text.secondary' }}>
            {th.common.loading}
          </Typography>
        ) : null}
        {targets.isError && !targets.data ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void targets.refetch()}>
                {th.common.retry}
              </Button>
            }
          >
            {th.milestones.form.targetsError}
          </Alert>
        ) : null}
        {targets.data && projects.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="milestone-dialog-no-targets">
            {th.milestones.form.noTargets}
          </Typography>
        ) : null}
        {targets.data && projects.length > 0 ? (
          <MilestoneForm
            // a fresh form per opening / target list (pre-selection is its initial state)
            key={`${String(open)}:${preselect ?? ''}`}
            projects={projects}
            {...(preselect !== undefined ? { projectId: preselect } : {})}
            initial={{ name: '', date: null, description: '' }}
            submitLabel={th.milestones.form.create}
            onCancel={onClose}
            onSubmit={(v) => {
              if (v.projectId === undefined) return
              setBusy(true)
              void ms
                .create({
                  projectId: v.projectId,
                  name: v.name,
                  date: v.date,
                  description: v.description,
                  color: v.color,
                })
                .then((m) => {
                  setBusy(false)
                  if (m) onClose()
                })
            }}
          />
        ) : null}
      </DialogContent>
      {/* the form brings its own cancel; every other state still needs a visible way out (Esc also closes) */}
      {!targets.data || projects.length === 0 ? (
        <DialogActions>
          <Button onClick={onClose}>{th.milestones.form.cancel}</Button>
        </DialogActions>
      ) : null}
    </Dialog>
  )
}
