'use client'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

/** Centred empty-state block (PLAN.md §3.9; reused by every list/view that can be empty). */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  /** Omitted when the screen's header bar already names the state (e.g. a not-found screen's <h1>). */
  title?: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center', py: 6, px: 2 }}>
      {icon ? (
        <Box
          aria-hidden="true"
          sx={{ color: 'text.secondary', display: 'flex', fontSize: 'calc(var(--font-3xl) * 1.25)' }}
        >
          {icon}
        </Box>
      ) : null}
      {title ? (
        <Typography variant="h4" component="p">
          {title}
        </Typography>
      ) : null}
      {description ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 480 }}>
          {description}
        </Typography>
      ) : null}
      {action ? <Box sx={{ pt: 1 }}>{action}</Box> : null}
    </Stack>
  )
}
