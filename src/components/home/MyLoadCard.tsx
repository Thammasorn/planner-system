'use client'
// src/components/home/MyLoadCard.tsx — "ภาระของฉัน 8 สัปดาห์" (FR-1101b, BR-40/BR-45, M10-D14, X67): one bar per Monday
// coloured by M9's viewTone (view "ทั้งหมด"), the number above (M9 workloadCellText), the week under it and the BR-40
// glyph for OVER/RISK — never colour alone. Plain elements + a CSS Module (PLAN §3.9).
import type { CSSProperties } from 'react'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { viewTone } from '@/domain/overload'
import { th } from '@/i18n/th'
import type { HomeLoadWeek } from '@/lib/contracts/home'
import { formatWeekHeader } from '@/lib/format'
import { compactDays, workloadCellText } from '@/lib/workload/format'
import { HomeCard } from './HomeCard'
import styles from './MyLoadCard.module.css'

/** Bar height in % of the track: the track holds 2 × capacity (an OVER week still fits). */
function barPercent(total: number, capacity: number): number {
  if (capacity <= 0) return total > 0 ? 100 : 0
  const max = 2 * capacity
  return Math.round((100 * Math.min(total, max)) / max)
}

export function MyLoadCard({ weeks }: { weeks: HomeLoadWeek[] }) {
  return (
    <HomeCard id="my-load" title={th.home.myLoad.title}>
      <ul className={styles.bars}>
        {weeks.map(({ week, cell }) => {
          const v = viewTone({ total: cell.total, committed: cell.committed }, cell.capacity, 'ALL')
          const weekLabel = formatWeekHeader(week)
          const noCapacity = cell.capacity === 0
          return (
            <li key={week} className={styles.week} data-week={week}>
              <span className={styles.value}>
                <span aria-hidden="true">{workloadCellText(cell.total, cell.capacity)}</span>
                {cell.level === 'OVER' ? (
                  <StatusGlyph kind="over" label={th.home.myLoad.over} />
                ) : cell.level === 'RISK' ? (
                  <StatusGlyph kind="risk" label={th.home.myLoad.risk} />
                ) : null}
              </span>
              <div
                className={styles.track}
                role="img"
                aria-label={th.home.myLoad.barLabel(
                  weekLabel,
                  compactDays(cell.total),
                  compactDays(cell.capacity),
                )}
                data-no-capacity={noCapacity ? 'true' : undefined}
                title={noCapacity ? th.home.myLoad.noCapacity : undefined}
              >
                <div
                  className={styles.bar}
                  data-tone={v.tone}
                  data-level={cell.level}
                  style={{ '--bar-height': `${barPercent(cell.total, cell.capacity)}%` } as CSSProperties}
                />
              </div>
              <span className={styles.label} aria-hidden="true">
                {weekLabel}
              </span>
            </li>
          )
        })}
      </ul>
      <p className={styles.legend}>{th.home.myLoad.legend}</p>
    </HomeCard>
  )
}
