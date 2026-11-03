'use client'
// ◆ milestone flags on their date in the project calendar (FR-705/FR-709, §8.13; M11.1: replace M7.1's ⚑ plan-marker
// flags) — glyph in the milestone colour + the name + (for AT) the colour name, date and status; never colour alone.
import { th } from '@/i18n/th'
import type { MilestoneDTO } from '@/lib/contracts/milestones'
import { formatThaiDate } from '@/lib/format'
import { milestoneColorVar } from '@/lib/theme/tokens'
import styles from './PlanCalendar.module.css'

export function MilestoneFlags({ milestones }: { milestones: readonly MilestoneDTO[] | undefined }) {
  if (!milestones || milestones.length === 0) return null
  return (
    <>
      {milestones.map((m) => {
        const colour = th.milestones.color.named(th.milestones.color.name[m.color])
        const title = `${m.name} · ${th.milestones.dateLine(formatThaiDate(m.date), th.milestones.status[m.status])} · ${colour}`
        return (
          <span
            key={m.id}
            className={styles.flag}
            title={title}
            data-milestone={m.id}
            data-color={m.color}
            data-status={m.status}
            style={{ color: milestoneColorVar(m.color) }}
          >
            <span aria-hidden="true" className={styles.flagGlyph}>
              {th.milestones.diamond}
            </span>
            <span className={styles.srOnly}>{title}</span>
            <span aria-hidden="true" className={styles.flagText}>
              {m.name}
            </span>
          </span>
        )
      })}
    </>
  )
}
