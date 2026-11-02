// src/components/load-chart/LoadTable.tsx — "ดูเป็นตาราง" (FR-813): the chart's data as a person × week table for the
// keyboard and screen readers. Same values as the chart (chart-model), OVER = 🔴, RISK = ⚠ with the text hidden for AT.
import type { CellUnit } from '@/domain/types'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import { alertText, pointText, type ChartPerson } from './chart-model'
import { ShapeGlyph } from './ShapeGlyph'
import styles from './LoadChart.module.css'
import type { LoadSeries } from './types'

export function LoadTable({
  weeks,
  series,
  people,
  unit,
}: {
  weeks: readonly string[]
  series: readonly LoadSeries[]
  people: readonly ChartPerson[]
  unit: CellUnit
}) {
  return (
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={th.loadChart.table}>
      <table className={styles.table} data-testid="load-table">
        <caption>
          {th.loadChart.tableCaption(unit === 'DAYS' ? th.loadChart.unitDays : th.loadChart.unitFraction)}
        </caption>
        <thead>
          <tr>
            <th scope="col">{th.loadChart.personHeader}</th>
            {weeks.map((w) => (
              <th key={w} scope="col" aria-label={th.loadChart.week(formatWeekHeader(w))}>
                {formatWeekHeader(w)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((s, i) => {
            const person = people[i]!
            return (
              <tr key={s.userId} data-user={s.userId}>
                <th scope="row">
                  <span className={styles.rowName}>
                    <ShapeGlyph shape={person.shape} color={person.color} />
                    {s.name}
                  </span>
                </th>
                {s.points.map((p) => {
                  const alert = alertText(p)
                  return (
                    <td key={p.week} data-week={p.week} data-level={p.level ?? undefined}>
                      {pointText(p, unit)}
                      {alert ? (
                        <>
                          <span aria-hidden="true" className={styles.glyph} title={alert}>
                            {p.level === 'OVER' ? '🔴' : '⚠'}
                          </span>
                          <span className={styles.srOnly}>{alert}</span>
                        </>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
