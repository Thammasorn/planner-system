'use client'
// src/components/calendar/MilestoneChip.tsx — ◆ on the team calendar (plan/m08 S4.9, FR-907, X24, M8-D16): a link to
// the project's overview, "◆ name · project" + status glyph with hidden status text, ⚠ "เลย milestone" text when late.
// Colour is decoration only (project colour border; M11.1: the milestone's line colour as the inline-end border).
import type { CSSProperties } from 'react'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Link from '@/components/Link'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { MILESTONE_STATUS_ICONS } from '@/components/milestones/MilestoneStatusChip'
import { th } from '@/i18n/th'
import { milestoneColorVar } from '@/lib/theme/tokens'
import type { CalendarMilestone } from '@/lib/contracts/milestones'
import styles from './MonthGrid.module.css'

/** Accessible name of the chip (also used in the day cell's label). */
export function milestoneChipLabel(m: CalendarMilestone): string {
  const base = th.milestones.calendar.chipLabel(m.name, m.projectName, th.milestones.status[m.status])
  return m.late ? `${base} ${th.milestones.late}` : base
}

export function MilestoneChip({ m, tabIndex }: { m: CalendarMilestone; tabIndex?: number }) {
  const Icon = MILESTONE_STATUS_ICONS[m.status]
  const style: CSSProperties = {
    borderInlineStartColor: m.projectColor,
    borderInlineEnd: `3px solid ${milestoneColorVar(m.color)}`,
  }
  return (
    <Link
      href={`/projects/${m.projectId}/overview`}
      className={styles.milestoneChip}
      data-chip="milestone"
      data-status={m.status}
      data-color={m.color}
      data-late={m.late ? 'true' : undefined}
      aria-label={milestoneChipLabel(m)}
      style={style}
      tabIndex={tabIndex}
    >
      <span className={styles.milestoneText}>{th.milestones.calendar.chip(m.name, m.projectName)}</span>
      <span className={styles.milestoneStatus}>
        <Icon aria-hidden="true" fontSize="inherit" />
        <VisuallyHidden>{th.milestones.status[m.status]}</VisuallyHidden>
      </span>
      {m.late ? (
        <span className={styles.milestoneStatus}>
          <WarningAmberOutlined aria-hidden="true" fontSize="inherit" />
          {th.milestones.late}
        </span>
      ) : null}
    </Link>
  )
}
