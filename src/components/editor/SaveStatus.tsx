'use client'
// src/components/editor/SaveStatus.tsx — "กำลังบันทึก… / บันทึกแล้ว / บันทึกไม่สำเร็จ" (FR-531, M4-D26).
// `data-save-state` + `data-dirty` give e2e a deterministic wait: "saved" with `data-dirty="false"` means the latest
// edit is on the server (a change waiting out its debounce keeps the previous "saved"); `idle` renders nothing.
import Typography from '@mui/material/Typography'
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import type { SaveState } from './useAutosave'

export function SaveStatus({ state, pending = false }: { state: SaveState; pending?: boolean }): JSX.Element {
  const t = th.editor.saveStatus
  const text = state === 'saving' ? t.saving : state === 'saved' ? t.saved : state === 'error' ? t.error : ''
  return (
    <Typography
      role="status"
      aria-live="polite"
      data-save-state={state}
      data-dirty={pending ? 'true' : 'false'}
      data-testid="save-status"
      variant="caption"
      color={state === 'error' ? 'error' : 'text.secondary'}
      sx={{ display: 'block', minHeight: '1.5em', textAlign: 'right', whiteSpace: 'nowrap' }}
    >
      {text}
    </Typography>
  )
}
