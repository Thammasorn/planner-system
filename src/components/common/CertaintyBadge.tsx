'use client'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import type { Certainty } from '@/domain/types'
import { th } from '@/i18n/th'

/**
 * Project certainty (SPEC §5.5, §8.9): TENTATIVE is the ◐ glyph announced as "อาจไม่ทำ" — never colour alone.
 * CONFIRMED is the default and renders nothing unless `showConfirmed` (then a small text chip).
 */
export function CertaintyBadge({
  certainty,
  showConfirmed,
}: {
  certainty: Certainty
  showConfirmed?: boolean
}) {
  if (certainty === 'TENTATIVE') {
    const label = th.projects.certainty.TENTATIVE
    return (
      <Tooltip title={label}>
        <Box
          component="span"
          role="img"
          aria-label={label}
          data-certainty="TENTATIVE"
          sx={{ color: 'var(--tentative-fg)', fontWeight: 700, lineHeight: 1, flex: 'none' }}
        >
          {th.projects.tentativeGlyph}
        </Box>
      </Tooltip>
    )
  }
  if (!showConfirmed) return null
  return (
    <Chip
      size="small"
      variant="outlined"
      label={th.projects.certainty.CONFIRMED}
      data-certainty="CONFIRMED"
      sx={{ height: 20 }}
    />
  )
}
