'use client'
// src/components/editor/lease/LeaseBanner.tsx — "Cindy กำลังแก้หน้านี้" + takeover (FR-540/542, AC-505). Icon + text,
// never colour only (SPEC §8.9). Displaced with unsaved work: says so (never "saved") + a retry-save button (SPEC P4).
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import type { LeaseState } from '@/lib/contracts/pages'
import type { LeaseMode } from './useEditLease'

export function LeaseBanner(props: {
  mode: LeaseMode
  lease: LeaseState | null
  onTakeover: () => void
  onRetry: () => void
  /** Displaced while the last edits are not saved yet (see useEditLease `unsaved`). */
  unsaved?: boolean
  onRetrySave?: () => void
}): JSX.Element | null {
  const { mode, lease } = props
  const holder = lease && !lease.mine ? lease.holder : null
  const t = th.editor.lease
  if (mode === 'lost') {
    return (
      <Alert
        severity="warning"
        data-testid="lease-banner"
        data-lease-mode={mode}
        action={
          <Button color="inherit" size="small" onClick={props.onRetry}>
            {t.reacquire}
          </Button>
        }
      >
        {t.lost} — {t.readOnlyHint}
      </Alert>
    )
  }
  if (mode === 'displaced' && props.unsaved) {
    return (
      <Alert
        severity="error"
        data-testid="lease-banner"
        data-lease-mode={mode}
        data-unsaved="true"
        action={
          <Button color="inherit" size="small" onClick={props.onRetrySave}>
            {t.retrySave}
          </Button>
        }
      >
        {t.takenOverUnsaved(holder?.name ?? '')}
      </Alert>
    )
  }
  if (mode === 'displaced') {
    return (
      <Alert severity="warning" data-testid="lease-banner" data-lease-mode={mode}>
        {t.takenOverBy(holder?.name ?? '')}
      </Alert>
    )
  }
  if (!holder) return null
  if (mode === 'held') {
    return (
      <Alert
        severity="info"
        data-testid="lease-banner"
        data-lease-mode={mode}
        action={
          <Button color="inherit" size="small" onClick={props.onTakeover}>
            {t.takeover}
          </Button>
        }
      >
        {t.heldBy(holder.name)}
      </Alert>
    )
  }
  if (mode === 'viewOnly') {
    return (
      <Alert severity="info" data-testid="lease-banner" data-lease-mode={mode}>
        {t.heldBy(holder.name)}
      </Alert>
    )
  }
  return null
}
