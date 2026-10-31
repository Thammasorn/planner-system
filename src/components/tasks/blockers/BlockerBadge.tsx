'use client'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import BlockOutlined from '@mui/icons-material/BlockOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import { blockerBadge } from '@/domain/blockers'
import { th } from '@/i18n/th'

/**
 * ⛔ "รอ N งาน" / ✓ "ตัวขวางเสร็จแล้ว" (FR-643/644, BR-86): icon + text. `names` (project views only) feed the
 * tooltip; /tasks shows counts only (§7.8).
 */
export function BlockerBadge({
  open,
  total,
  names,
  focusable = true,
}: {
  open: number
  total: number
  names?: readonly string[] | undefined
  /** false inside a roving-focus row: the names stay in the tooltip (hover) and in the panel's blocker list. */
  focusable?: boolean
}) {
  const badge = blockerBadge({ open, total })
  if (badge === null) return null
  const waiting = badge.kind === 'WAITING'
  const text = waiting ? th.tasks.blockers.badgeWaiting(badge.open) : th.tasks.blockers.badgeCleared
  const el = (
    <Box
      component="span"
      tabIndex={names && names.length > 0 ? (focusable ? 0 : -1) : undefined}
      data-blocker-badge={badge.kind}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        px: 0.75,
        height: 22,
        borderRadius: 11,
        border: '1px solid',
        borderColor: waiting ? 'error.main' : 'divider',
        color: 'text.primary',
        fontSize: '0.75rem',
        whiteSpace: 'nowrap',
        flex: 'none',
      }}
    >
      {waiting ? (
        <BlockOutlined aria-hidden="true" sx={{ fontSize: 14, color: 'error.main' }} />
      ) : (
        <CheckOutlined aria-hidden="true" sx={{ fontSize: 14, color: 'success.main' }} />
      )}
      <span>{text}</span>
    </Box>
  )
  if (!names || names.length === 0) return el
  return (
    <Tooltip title={th.tasks.blockers.badgeTooltip(names.join(', '))} describeChild>
      {el}
    </Tooltip>
  )
}
