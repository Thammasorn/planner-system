'use client'
// Phone layout of the project calendar (< 600 px, FR-812, M7.1-D19): the month's days with tasks (agendaDays), each a
// heading + bar-like rows (starting first, then ◂ running ones) + the day's marker flags — the /calendar AgendaList look.
import { useMemo } from 'react'
import { isoWeekday } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { inMonth, monthGrid, monthTitle, type YearMonth } from '@/lib/calendar/month-grid'
import { formatThaiDate } from '@/lib/format'
import { agendaDays } from '@/lib/plan-calendar/agenda'
import type { PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import type { TaskDTO } from '@/lib/contracts/tasks'
import type { BarInfo } from './labels'
import { MarkerFlags } from './MarkerFlags'
import { TaskBar } from './TaskBar'
import styles from './PlanCalendar.module.css'

export interface CalendarViewProps {
  month: YearMonth
  tasks: readonly TaskDTO[]
  infos: ReadonlyMap<string, BarInfo>
  holidays: ReadonlyMap<ISODate, string>
  markersByDate: ReadonlyMap<ISODate, PlanMarkerDTO[]>
  showCompleted: boolean
  today: ISODate
  onOpen: (taskId: string) => void
  onOpenPage: (taskId: string) => void
}

export function PlanAgenda(p: CalendarViewProps) {
  const { month, today } = p
  const days = useMemo(() => {
    const withTasks = new Map(
      agendaDays(p.tasks, month, { showCompleted: p.showCompleted }).map((d) => [d.date, d]),
    )
    // days with a task, plus days with only a marker flag (so a flag is never lost on the phone)
    return monthGrid(month)
      .weeks.flat()
      .filter((d) => inMonth(d, month) && (withTasks.has(d) || p.markersByDate.has(d)))
      .map((date) => ({ date, starting: withTasks.get(date)?.starting ?? [], active: withTasks.get(date)?.active ?? [] }))
  }, [p.tasks, month, p.showCompleted, p.markersByDate])

  if (days.length === 0) {
    return (
      <p className={styles.sideHint} data-testid="plan-agenda-empty">
        {th.planCalendar.agendaEmpty}
      </p>
    )
  }
  return (
    <ol className={styles.agenda} aria-label={th.planCalendar.agendaLabel(monthTitle(month))} data-testid="plan-agenda">
      {days.map(({ date, starting, active }) => {
        const holiday = p.holidays.get(date)
        return (
          <li
            key={date}
            className={styles.agendaDay}
            data-testid={`plan-agenda-${date}`}
            data-holiday={holiday === undefined ? undefined : true}
            aria-current={date === today ? 'date' : undefined}
          >
            <h2 className={styles.agendaHeading}>
              {`${th.calendar.weekdaysLong[isoWeekday(date) - 1]} ${formatThaiDate(date)}`}
              {date === today ? ` · ${th.calendar.today}` : null}
            </h2>
            {holiday !== undefined || p.markersByDate.has(date) ? (
              <div className={styles.agendaMeta}>
                {holiday !== undefined ? <span>{`${th.calendar.holidayPrefix} ${holiday}`}</span> : null}
                <MarkerFlags markers={p.markersByDate.get(date)} />
              </div>
            ) : null}
            {[...starting.map((t) => ({ t, cut: false })), ...active.map((t) => ({ t, cut: true }))].map(({ t, cut }) => {
              const info = p.infos.get(t.id)
              if (!info) return null
              return (
                <TaskBar
                  key={t.id}
                  info={info}
                  className={styles.agendaItem}
                  cutLeft={cut}
                  tabIndex={0}
                  linkTabIndex={0}
                  onOpen={p.onOpen}
                  onOpenPage={p.onOpenPage}
                />
              )
            })}
          </li>
        )
      })}
    </ol>
  )
}
