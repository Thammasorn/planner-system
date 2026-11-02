'use client'
// src/components/milestones/MilestoneTaskTag.tsx — "◆ name" on a task row / board card plus the "เลย milestone" badge
// when the task is late for it (plan/m08 S4.4/S4.7, FR-661/706, BR-71). Text, never colour alone.
import rowStyles from '@/components/tasks/TaskRow.module.css'
import { th } from '@/i18n/th'
import { formatThaiDate } from '@/lib/format'
import { MilestoneLateBadge } from './MilestoneStatusChip'

export function MilestoneTaskTag({
  name,
  date,
  late,
}: {
  name: string
  /** Shown in the late hint; omitted on /tasks (no lateness there). */
  date?: string | undefined
  late: boolean
}) {
  return (
    <>
      <span className={rowStyles.milestoneTag} data-milestone-tag="">
        {th.milestones.tasks.cardLabel(name)}
      </span>
      {late ? (
        <MilestoneLateBadge {...(date ? { hint: th.milestones.lateHint(formatThaiDate(date)) } : {})} />
      ) : null}
    </>
  )
}
