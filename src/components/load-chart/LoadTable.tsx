// src/components/load-chart/LoadTable.tsx — "ดูเป็นตาราง" (FR-813): the chart's data as a person × period table for the
// keyboard and screen readers, laid out on the grid's own columns (M7.1-D30): the header lists exactly the grid's
// rendered periods at the grid's x positions, a person's weekly value sits in the week's value column (a collapsed
// week, or the "รวม" column of an expanded week), day columns stay empty, and it scrolls with the grid. A cell shows a
// compact value; the full text (th.loadChart.daysValue …, OVER / RISK text) is its accessible text.
import { th } from '@/i18n/th'
import type { LoadDisplay } from '@/lib/load/display'
import { formatWeekHeader } from '@/lib/format'
import { periodColIndex, totalColIndex } from '@/lib/grid/columns'
import { valueSlots } from '@/lib/grid/chart-geometry'
import { AlignedScroller } from './AlignedScroller'
import { alertText, compactText, pointText, type ChartPerson } from './chart-model'
import { ShapeGlyph } from './ShapeGlyph'
import styles from './LoadChart.module.css'
import type { ChartLayout, LoadSeries } from './types'

export function LoadTable({
  layout,
  series,
  people,
  display,
}: {
  layout: ChartLayout
  series: readonly LoadSeries[]
  people: readonly ChartPerson[]
  display: LoadDisplay
}) {
  const values = valueSlots(layout.slots)
  const caption = th.loadChart.tableCaption(
    display === 'DAYS' ? th.loadChart.unitDays : th.loadChart.unitPercent,
  )
  const colCount = totalColIndex(Math.max(0, ...layout.slots.map((s) => s.index + 1)))
  return (
    <>
      <p className={styles.caption}>{caption}</p>
      <AlignedScroller layout={layout}>
        <div
          role="table"
          aria-label={caption}
          aria-colcount={colCount}
          className={styles.table}
          style={{ width: layout.contentWidth }}
          data-testid="load-table"
        >
          <div role="row" className={styles.trow} data-head="">
            <div role="columnheader" aria-colindex={1} className={styles.rowName}>
              {th.loadChart.personHeader}
            </div>
            {layout.slots.map((s) => {
              const label = s.role === 'day' ? String(Number(s.date.slice(8))) : formatWeekHeader(s.weekStart)
              return (
                <div
                  key={s.key}
                  role="columnheader"
                  aria-colindex={periodColIndex(s.index)}
                  aria-label={s.role === 'day' ? undefined : th.loadChart.week(label)}
                  className={styles.tcell}
                  style={{ left: s.left, width: s.width }}
                  data-col-key={s.key}
                  data-role={s.role}
                  data-month-start={layout.monthStarts.has(s.key) ? '' : undefined}
                >
                  {label}
                </div>
              )
            })}
            <div className={styles.cover} aria-hidden="true" />
          </div>
          {series.map((s, i) => {
            const person = people[i]!
            const byWeek = new Map(s.points.map((p) => [p.week, p]))
            return (
              <div role="row" key={s.userId} className={styles.trow} data-user={s.userId}>
                <div role="rowheader" aria-colindex={1} className={styles.rowName}>
                  <ShapeGlyph shape={person.shape} color={person.color} />
                  {s.name}
                </div>
                {values.map((slot) => {
                  const p = byWeek.get(slot.weekStart)
                  if (!p) return null
                  const alert = alertText(p)
                  return (
                    <div
                      key={slot.key}
                      role="cell"
                      aria-colindex={periodColIndex(slot.index)}
                      className={styles.tcell}
                      style={{ left: slot.left, width: slot.width }}
                      data-week={p.week}
                      data-level={p.level ?? undefined}
                      data-month-start={layout.monthStarts.has(slot.key) ? '' : undefined}
                      title={alert ? `${pointText(p, display)} · ${alert}` : pointText(p, display)}
                    >
                      <span className={styles.srOnly}>
                        {pointText(p, display)}
                        {alert ? ` · ${alert}` : ''}
                      </span>
                      <span aria-hidden="true">
                        {compactText(p, display)}
                        {alert ? (
                          <span className={styles.glyph}>{p.level === 'OVER' ? '🔴' : '⚠'}</span>
                        ) : null}
                      </span>
                    </div>
                  )
                })}
                <div className={styles.cover} aria-hidden="true" />
              </div>
            )
          })}
        </div>
      </AlignedScroller>
    </>
  )
}
