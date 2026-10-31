'use client'
import { useId, useLayoutEffect, useRef, useState, type SubmitEvent } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { th } from '@/i18n/th'

export interface DeleteProjectDialogProps {
  open: boolean
  projectName: string
  onClose: () => void
  /** Rejects on failure (the caller shows the error toast); the dialog then stays open. */
  onConfirm: (typedName: string) => Promise<void>
}

/**
 * FR-407 — the product's ONLY confirm dialog (SPEC §1.3 P2): permanent project delete. The confirm button stays
 * disabled until the typed name equals the project name (trimmed); Enter submits only when enabled; Esc closes;
 * focus is trapped by MUI; both buttons are disabled while the delete runs.
 */
export function DeleteProjectDialog({ open, projectName, onClose, onConfirm }: DeleteProjectDialogProps) {
  const titleId = useId()
  // A fresh form per opening ("store previous prop" pattern), so a reopened dialog starts empty.
  const [prevOpen, setPrevOpen] = useState(open)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setTyped('')
  }
  const matches = typed.trim() === projectName.trim()

  // KEY-03 / SPEC §8.9: the field and both buttons are disabled while pending, so focus falls to <body>. After a
  // failure, return focus to the name field in the commit that re-enables it (it is still disabled in `catch`), so
  // Esc closes at once and the user can retype.
  const inputRef = useRef<HTMLInputElement>(null)
  const refocusAfterFailure = useRef(false)
  useLayoutEffect(() => {
    if (pending || !refocusAfterFailure.current) return
    refocusAfterFailure.current = false
    if (open) inputRef.current?.focus()
  }, [pending, open])

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!matches || pending) return
    setPending(true)
    try {
      await onConfirm(typed)
    } catch {
      // the caller reported the error; keep the dialog open for another try
      refocusAfterFailure.current = true
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <DialogTitle id={titleId}>{th.projects.deleteDialog.title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>{th.projects.deleteDialog.body(projectName)}</DialogContentText>
          <DialogContentText sx={{ mb: 2, color: 'text.primary' }}>
            {th.projects.deleteDialog.prompt(projectName)}
          </DialogContentText>
          <TextField
            label={th.projects.deleteDialog.inputLabel}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            fullWidth
            autoComplete="off"
            disabled={pending}
            inputRef={inputRef}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            {th.projects.cancel}
          </Button>
          <Button type="submit" color="error" variant="contained" disabled={!matches || pending}>
            {th.projects.deleteDialog.confirm}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
