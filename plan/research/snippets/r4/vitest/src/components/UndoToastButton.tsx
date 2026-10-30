'use client'
import Button from '@mui/material/Button'
import { useState } from 'react'
import { th } from '@/i18n/th'

export function UndoToastButton({ onUndo }: { onUndo: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="contained"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await onUndo()
        setBusy(false)
      }}
    >
      {th.common.undo}
    </Button>
  )
}
