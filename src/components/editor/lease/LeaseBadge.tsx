'use client'
// src/components/editor/lease/LeaseBadge.tsx — compact holder chip for the page header bar (FR-540/688, M6.1-D26):
// "Cindy กำลังแก้" + "แก้ต่อจากนี้" (takeover, only for someone who may edit). Icon + text, never colour only (§8.9).
// Rendered only while someone else holds the lease; the bigger states (lost / displaced) stay inline banners.
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import type { LeaseState } from '@/lib/contracts/pages'
import type { LeaseMode } from './useEditLease'

export function LeaseBadge(props: {
  mode: LeaseMode
  lease: LeaseState | null
  onTakeover: () => void
}): JSX.Element | null {
  const { mode, lease } = props
  const holder = lease && !lease.mine ? lease.holder : null
  if (!holder || (mode !== 'held' && mode !== 'viewOnly')) return null
  return (
    <Box
      data-testid="lease-badge"
      data-lease-mode={mode}
      role="status"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.5,
        borderRadius: 'var(--radius-md)',
        bgcolor: 'var(--hover-bg)',
        color: 'var(--text-secondary)',
        fontSize: 'var(--font-sm)',
        lineHeight: 'var(--leading-ui)',
        whiteSpace: 'nowrap',
      }}
    >
      <EditNoteOutlined fontSize="small" aria-hidden />
      <span>{th.editor.lease.badge(holder.name)}</span>
      {mode === 'held' ? (
        <Button
          size="small"
          variant="text"
          onClick={props.onTakeover}
          sx={{ minWidth: 0, px: 1, py: 0, fontSize: 'var(--font-sm)' }}
        >
          {th.editor.lease.takeover}
        </Button>
      ) : null}
    </Box>
  )
}
