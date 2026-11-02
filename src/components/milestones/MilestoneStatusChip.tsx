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
import { th } from '@/i18n/th'

export const MILESTONE_STATUS_ICONS: Record<MilestoneStatus, typeof CheckCircleOutlined> = {
  DONE: CheckCircleOutlined,
  OVERDUE: ErrorOutline,
  DUE_SOON: ScheduleOutlined,
  UPCOMING: EventOutlined,
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
    />
  )
  return hint ? <Tooltip title={hint}>{chip}</Tooltip> : chip
}
