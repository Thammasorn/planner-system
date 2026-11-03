'use client'
// src/components/milestones/MilestoneStatusChip.tsx — BR-70 status chip and the BR-71 "เลย milestone" badge
// (plan/m08 S4.1, FR-704/706, SPEC §8.9): an icon per state plus the Thai text, never colour alone.
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined'
import EventOutlined from '@mui/icons-material/EventOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import type { MilestoneStatus } from '@/domain/types'
import { milestoneColorVar } from '@/lib/theme/tokens'
import { th } from '@/i18n/th'

export const MILESTONE_STATUS_ICONS: Record<MilestoneStatus, typeof CheckCircleOutlined> = {
  DONE: CheckCircleOutlined,
  OVERDUE: ErrorOutline,
  DUE_SOON: ScheduleOutlined,
  UPCOMING: EventOutlined,
}

/**
 * Compact chip: the label box is one `--leading-ui` line of `--font-xs` (+ the 1 px outline) so the chip is no taller
 * than a body2 text line and shares its centre line inside `alignItems: center` rows (home card, project overview).
 */
const COMPACT_SX = {
  height: 'auto',
  verticalAlign: 'middle',
  '& .MuiChip-label': { py: 0, lineHeight: 'var(--leading-ui)' },
  '& .MuiChip-icon': { fontSize: 'var(--font-sm)' },
} as const

/** ◆ glyph box: line-height 1 inline-flex so the glyph sits on the row's centre line, not low on a text baseline. */
export function diamondSx(color: Parameters<typeof milestoneColorVar>[0]) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    fontSize: 'var(--font-sm)',
    flexShrink: 0,
    color: milestoneColorVar(color),
  } as const
}

const STATUS_COLOR = {
  DONE: 'success',
  OVERDUE: 'error',
  DUE_SOON: 'warning',
  UPCOMING: 'default',
} as const

export function MilestoneStatusChip({ status }: { status: MilestoneStatus }) {
  const Icon = MILESTONE_STATUS_ICONS[status]
  return (
    <Chip
      size="small"
      variant="outlined"
      color={STATUS_COLOR[status]}
      icon={<Icon aria-hidden="true" />}
      label={th.milestones.status[status]}
      data-status={status}
      sx={COMPACT_SX}
    />
  )
}

/** "เลย milestone" (or "เลย milestone N งาน" with `count`); `hint` explains why (Tooltip). */
export function MilestoneLateBadge({ count, hint }: { count?: number; hint?: string }) {
  const chip = (
    <Chip
      size="small"
      variant="outlined"
      color="warning"
      icon={<WarningAmberOutlined aria-hidden="true" />}
      label={count !== undefined ? th.milestones.lateTasks(count) : th.milestones.late}
      data-late="true"
      sx={COMPACT_SX}
    />
  )
  return hint ? <Tooltip title={hint}>{chip}</Tooltip> : chip
}
