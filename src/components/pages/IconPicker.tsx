'use client'
import { useId, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { PageSpace } from '@/lib/contracts/pages'
import { invalidatePage, invalidatePages } from '@/lib/invalidate'
import { PAGE_ICONS } from '@/lib/pages/icons'
import { setPageIcon } from '@/server/actions/pages'
import { errorMessage } from './usePageActions'

type PageIcon = (typeof PAGE_ICONS)[number]

export const DEFAULT_PAGE_ICON = '📄'

export interface IconPickerProps {
  pageId: string
  icon: string | null
  canEdit: boolean
  scope: { space: PageSpace; projectId: string | null }
  /** Optimistic local state of the page header; called again with the previous icon on failure. */
  onChange: (icon: string | null) => void
}

/** Curated emoji grid (FR-504, X63 — no emoji-mart); readers see the icon only. */
export function IconPicker({ pageId, icon, canEdit, scope, onChange }: IconPickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const titleId = useId()
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (next: PageIcon | null) => unwrap(setPageIcon({ pageId, icon: next })),
  })
  const shown = icon ?? DEFAULT_PAGE_ICON

  if (!canEdit) {
    return (
      <Box component="span" aria-hidden="true" sx={{ fontSize: 40, lineHeight: 1 }}>
        {shown}
      </Box>
    )
  }

  const pick = async (next: PageIcon | null) => {
    setAnchor(null)
    const prev = icon
    if (next === prev) return
    onChange(next)
    try {
      await m.mutateAsync(next)
      void invalidatePages(qc, scope)
      void invalidatePage(qc, pageId)
    } catch (e) {
      onChange(prev)
      toast.error(errorMessage(e, th.pages.toasts.actionFailed))
    }
  }

  return (
    <>
      <IconButton
        aria-label={th.pages.icon.button}
        aria-haspopup="dialog"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ fontSize: 40, lineHeight: 1, width: 64, height: 64, borderRadius: 2 }}
      >
        <span aria-hidden="true">{shown}</span>
      </IconButton>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-labelledby': titleId,
            sx: { p: 1.5, maxWidth: 'calc(100vw - 32px)' },
          },
        }}
      >
        <Typography id={titleId} variant="subtitle2" component="h2" sx={{ mb: 1 }}>
          {th.pages.icon.dialogTitle}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(10, 36px)',
            gap: 0.5,
            maxWidth: '100%',
            overflowX: 'auto',
          }}
        >
          {PAGE_ICONS.map((e) => (
            <IconButton
              key={e}
              aria-label={e}
              aria-pressed={e === icon}
              onClick={() => void pick(e)}
              sx={{ fontSize: 22, width: 36, height: 36, borderRadius: 1 }}
            >
              <span aria-hidden="true">{e}</span>
            </IconButton>
          ))}
        </Box>
        {icon !== null ? (
          <Button size="small" onClick={() => void pick(null)} sx={{ mt: 1 }}>
            {th.pages.icon.remove}
          </Button>
        ) : null}
      </Popover>
    </>
  )
}
