'use client'
// src/components/editor/EditorBanners.tsx — the editor's banners: lease (FR-540/542) and blocked saves
// (FR-543 "มีการแก้ไขใหม่กว่า" + reload, deleted page, edit permission lost — M4-D21). Icon + text, never colour only.
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import type { LeaseState } from '@/lib/contracts/pages'
import { LeaseBanner } from './lease/LeaseBanner'
import type { LeaseMode } from './lease/useEditLease'
import type { SaveBlock } from './useAutosave'

export interface EditorBannersProps {
  lease: {
    mode: LeaseMode
    lease: LeaseState | null
    takeover: () => Promise<void>
    retry: () => Promise<void>
    unsaved: boolean
    retrySave: () => Promise<void>
  }
  blocked: SaveBlock
  onReload: () => void
  /** M6.1-D26: the held / view-only holder notice is the header's LeaseBadge instead of an inline banner. */
  leaseInHeader?: boolean
}

export function EditorBanners({
  lease,
  blocked,
  onReload,
  leaseInHeader = false,
}: EditorBannersProps): JSX.Element {
  const headerHasIt = leaseInHeader && (lease.mode === 'held' || lease.mode === 'viewOnly')
  return (
    <Stack spacing={1} sx={{ mb: 1, '&:empty': { display: 'none' } }}>
      {blocked === 'conflict' && (
        <Alert
          severity="warning"
          data-testid="conflict-banner"
          action={
            <Button color="inherit" size="small" onClick={onReload}>
              {th.editor.conflict.reload}
            </Button>
          }
        >
          {th.editor.conflict.banner}
        </Alert>
      )}
      {blocked === 'deleted' && (
        <Alert severity="error" data-testid="deleted-banner">
          {th.editor.deletedBanner}
        </Alert>
      )}
      {blocked === 'forbidden' && (
        <Alert severity="error" data-testid="forbidden-banner">
          {th.editor.forbiddenBanner}
        </Alert>
      )}
      {blocked === false && !headerHasIt && (
        <LeaseBanner
          mode={lease.mode}
          lease={lease.lease}
          onTakeover={() => void lease.takeover()}
          onRetry={() => void lease.retry()}
          unsaved={lease.unsaved}
          onRetrySave={() => void lease.retrySave()}
        />
      )}
    </Stack>
  )
}
