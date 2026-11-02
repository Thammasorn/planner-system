'use client'
import { useLayoutEffect, useMemo, useRef } from 'react'
import Typography from '@mui/material/Typography'
import { isoWeekday } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { entriesOnDay, inMonth, monthGrid, monthTitle, type YearMonth } from '@/lib/calendar/month-grid'
import type { CalendarResponse, CalendarTimeOff, CalendarTimeOffFull } from '@/lib/contracts/calendar'
import { formatThaiDate } from '@/lib/format'
import { LeaveChip } from './LeaveChip'
import { MilestoneChip } from './MilestoneChip'
import styles from './MonthGrid.module.css'

function chipKey(e: CalendarTimeOff, i: number): string {
  return e.kind === 'full' ? e.id : `m:${e.userId}:${e.startDate}:${i}`
}

/**
 * Phone layout of the team calendar (< 600 px, NFR-07b, M5-D13): the month's days that have a holiday, a ◆ milestone
 * (M8-D16) or leave, in order, each with its date + weekday heading and the same chips as the grid (◆ first).
 *
 * Focus (SPEC §8.9): opening a chip hands `returnFocus` (the chip's day `<li>`, tabIndex -1) to the caller, the same
 * contract as MonthGrid. A deleted entry can take its whole day with it (the refetch drops days without leave or a
 * holiday), so when the focused day unmounts focus moves to the next remaining day, else the previous one, else the
 * list's empty state — never `<body>`.
 */
export function AgendaList({
  month,
  data,
  today,
  onOpenEntry,
}: {
  month: YearMonth
  data: CalendarResponse
  today: ISODate
  onOpenEntry: (e: CalendarTimeOffFull, returnFocus: () => HTMLElement | undefined) => void
}) {
  const root = useRef<HTMLElement | null>(null)
  const rootRef = (el: HTMLElement | null) => {
    root.current = el
  }
  const items = useRef(new Map<ISODate, HTMLLIElement>())
  /** The day whose focused `<li>` unmounted in the last commit; the layout effect moves focus to a neighbour. */
  const lostFocus = useRef<ISODate | null>(null)
  const itemRef = (date: ISODate) => (el: HTMLLIElement | null) => {
    if (!el) return
    items.current.set(date, el)
    return () => {
      // Ref cleanup runs before React removes the node, so it still holds focus here.
      if (el.ownerDocument.activeElement === el) lostFocus.current = date
      if (items.current.get(date) === el) items.current.delete(date)
    }
  }

  const days = useMemo(() => {
    const holidays = new Map(data.holidays.map((h) => [h.date, h.name]))
    return monthGrid(month)
      .weeks.flat()
      .filter((d) => inMonth(d, month))
      .map((date) => ({
        date,
        holiday: holidays.get(date),
        milestones: data.milestones.filter((m) => m.date === date),
        entries: entriesOnDay(data.timeOff, date),
      }))
      .filter((d) => d.holiday !== undefined || d.milestones.length > 0 || d.entries.length > 0)
  }, [month, data])

  useLayoutEffect(() => {
    const lost = lostFocus.current
    if (lost === null) return
    lostFocus.current = null
    const active = document.activeElement
    if (active !== null && active !== document.body) return // focus already went somewhere real
    const remaining = [...items.current.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    const target = remaining.find(([d]) => d > lost)?.[1] ?? remaining.at(-1)?.[1] ?? root.current
    target?.focus()
  })

  const dayOf = (date: ISODate) => () => items.current.get(date)

  if (days.length === 0) {
    return (
      <Typography ref={rootRef} tabIndex={-1} sx={{ color: 'text.secondary', py: 2 }}>
        {th.calendar.agendaEmpty}
      </Typography>
    )
  }
  return (
    <ol
      ref={rootRef}
      className={styles.agenda}
      aria-label={th.calendar.gridLabel(monthTitle(month))}
      data-testid="calendar-agenda"
    >
      {days.map(({ date, holiday, milestones, entries }) => (
        <li
          key={date}
          ref={itemRef(date)}
          tabIndex={-1}
          className={styles.agendaDay}
          data-testid={`agenda-${date}`}
          data-holiday={holiday === undefined ? undefined : true}
          aria-current={date === today ? 'date' : undefined}
        >
          <h2 className={styles.agendaHeading}>
            {`${th.calendar.weekdaysLong[isoWeekday(date) - 1]} ${formatThaiDate(date)}`}
            {date === today ? ` · ${th.calendar.today}` : null}
          </h2>
          {holiday !== undefined ? (
            <div className={styles.holiday}>{`${th.calendar.holidayPrefix} ${holiday}`}</div>
          ) : null}
          {milestones.length > 0 || entries.length > 0 ? (
            <div className={styles.chips}>
              {milestones.map((m) => (
                <MilestoneChip key={`ms:${m.id}`} m={m} />
              ))}
              {entries.map((entry, i) => (
                <LeaveChip
                  key={chipKey(entry, i)}
                  entry={entry}
                  person={data.people[entry.userId]}
                  onOpen={(e) => onOpenEntry(e, dayOf(date))}
                />
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
