'use client'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import { isoWeekday } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import {
  dayOfMonth,
  entriesOnDay,
  inMonth,
  monthGrid,
  monthTitle,
  moveFocus,
  orderRange,
  splitVisible,
  yearMonthOf,
  type YearMonth,
} from '@/lib/calendar/month-grid'
import type {
  CalendarPerson,
  CalendarResponse,
  CalendarTimeOff,
  CalendarTimeOffFull,
} from '@/lib/contracts/calendar'
import type { CalendarMilestone } from '@/lib/contracts/milestones'
import { formatThaiDate } from '@/lib/format'
import { matchesHotkey, type Hotkey } from '@/lib/keys'
import { LeaveChip, chipText } from './LeaveChip'
import { MilestoneChip, milestoneChipLabel } from './MilestoneChip'
import styles from './MonthGrid.module.css'

export interface DayRange {
  startDate: ISODate
  endDate: ISODate
}

export interface MonthGridProps {
  month: YearMonth
  data: CalendarResponse
  today: ISODate
  onSelectRange: (r: DayRange) => void
  /** `returnFocus` gives the chip's day cell: focus goes there after the entry is deleted (its chip unmounts). */
  onOpenEntry: (e: CalendarTimeOffFull, returnFocus: () => HTMLElement | undefined) => void
  /** Keyboard focus crossed the 6-week grid edge: the parent shows the month of that day (focus follows). */
  onMonthChange?: (month: YearMonth) => void
}

// Calendar keys (X49: e.code first, so the Thai layout works); listed in the `?` help (src/lib/shortcuts.ts).
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const
type Arrow = (typeof ARROWS)[number]
const OPEN_KEYS: readonly Hotkey[] = [
  { code: 'Enter', key: 'Enter' },
  { code: 'NumpadEnter' },
  { code: 'Space', key: ' ' },
]
const ESCAPE: Hotkey = { code: 'Escape', key: 'Escape' }

function arrowOf(e: globalThis.KeyboardEvent): { dir: Arrow; extend: boolean } | null {
  for (const dir of ARROWS) {
    if (matchesHotkey(e, { code: dir, key: dir })) return { dir, extend: false }
    if (matchesHotkey(e, { code: dir, key: dir, shift: true })) return { dir, extend: true }
  }
  return null
}

/** Pointer-downs on chips, "+N" and other controls never start a day selection (R12). */
function isControl(target: EventTarget): boolean {
  return target instanceof Element && target.closest('[data-chip], button, a') !== null
}

function chipKey(e: CalendarTimeOff, i: number): string {
  return e.kind === 'full' ? e.id : `m:${e.userId}:${e.startDate}:${i}`
}

/** One chip of a day: ◆ milestones first (M8-D16), then leave entries; both count toward the "+N" limit. */
type DayItem = { kind: 'milestone'; m: CalendarMilestone } | { kind: 'leave'; entry: CalendarTimeOff }

const itemKey = (item: DayItem, i: number): string =>
  item.kind === 'milestone' ? `ms:${item.m.id}` : chipKey(item.entry, i)

function DayChip({
  item,
  person,
  onOpen,
  tabIndex,
}: {
  item: DayItem
  person: (userId: string) => CalendarPerson | undefined
  onOpen: (e: CalendarTimeOffFull) => void
  tabIndex?: number
}) {
  if (item.kind === 'milestone')
    return <MilestoneChip m={item.m} {...(tabIndex !== undefined ? { tabIndex } : {})} />
  return (
    <LeaveChip
      entry={item.entry}
      person={person(item.entry.userId)}
      onOpen={onOpen}
      {...(tabIndex !== undefined ? { tabIndex } : {})}
    />
  )
}

function dayItems(data: CalendarResponse, iso: ISODate): DayItem[] {
  return [
    ...data.milestones.filter((m) => m.date === iso).map((m): DayItem => ({ kind: 'milestone', m })),
    ...entriesOnDay(data.timeOff, iso).map((entry): DayItem => ({ kind: 'leave', entry })),
  ]
}

/**
 * Team calendar month view (FR-907/908, M5-D13, A11Y-1): a custom CSS grid of 6 Monday-first weeks (`role="grid"`).
 * Days carry holidays (grey + 🎌 + name), weekends (`--nonworking`), ◆ milestone chips then leave chips (≤ 3 in all,
 * then "+N" → popover; M8-D16) and "วันนี้". Select a range by pointer (down on a day → move → up) or keyboard (roving focus: arrows ±1/±7 days,
 * Shift+arrows extend, Enter/Space open, Escape clears); either calls `onSelectRange`.
 */
export function MonthGrid({ month, data, today, onSelectRange, onOpenEntry, onMonthChange }: MonthGridProps) {
  const { from, to, weeks } = useMemo(() => monthGrid(month), [month])
  const holidays = useMemo(() => new Map(data.holidays.map((h) => [h.date, h.name])), [data.holidays])
  const defaultFocus = inMonth(today, month) ? today : `${month}-01`
  const [focusState, setFocus] = useState<ISODate>(defaultFocus)
  const focused = focusState >= from && focusState < to ? focusState : defaultFocus
  const [sel, setSel] = useState<{ anchor: ISODate; head: ISODate } | null>(null)
  const [more, setMore] = useState<{ date: ISODate; anchor: HTMLElement } | null>(null)
  const dragAnchor = useRef<ISODate | null>(null)
  const focusDom = useRef(false)
  const cells = useRef(new Map<ISODate, HTMLDivElement>())
  const range = sel ? orderRange(sel.anchor, sel.head) : null
  const maskedHintId = useId()

  // Keyboard moves focus the new day after it renders (also after a month change through onMonthChange).
  useEffect(() => {
    if (!focusDom.current) return
    focusDom.current = false
    cells.current.get(focused)?.focus()
  }, [focused, month])

  // A drag released outside the grid is cancelled (the cell's pointerup runs first when released on a day).
  useEffect(() => {
    const cancel = () => {
      if (dragAnchor.current === null) return
      dragAnchor.current = null
      setSel(null)
    }
    window.addEventListener('pointerup', cancel)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', cancel)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [])

  const select = (r: DayRange) => {
    setSel(null)
    onSelectRange(r)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, iso: ISODate) => {
    if (e.button !== 0 || isControl(e.target)) return
    dragAnchor.current = iso
    setSel({ anchor: iso, head: iso })
    setFocus(iso)
  }
  const onPointerEnter = (iso: ISODate) => {
    const anchor = dragAnchor.current
    if (anchor !== null) setSel({ anchor, head: iso })
  }
  const onPointerUp = (iso: ISODate) => {
    const anchor = dragAnchor.current
    if (anchor === null) return
    dragAnchor.current = null
    select(orderRange(anchor, iso))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return // keys on a chip / "+N" belong to that control
    const native = e.nativeEvent
    const arrow = arrowOf(native)
    if (arrow) {
      e.preventDefault()
      const next = moveFocus(focused, arrow.dir)
      setSel(arrow.extend ? { anchor: sel?.anchor ?? focused, head: next } : null)
      focusDom.current = true
      setFocus(next)
      if (next < from || next >= to) onMonthChange?.(yearMonthOf(next))
      return
    }
    if (OPEN_KEYS.some((hk) => matchesHotkey(native, hk))) {
      e.preventDefault()
      select(range ?? { startDate: focused, endDate: focused })
      return
    }
    if (matchesHotkey(native, ESCAPE) && sel) {
      e.preventDefault()
      setSel(null)
    }
  }

  const person = (userId: string) => data.people[userId]
  const cellOf = (iso: ISODate) => () => cells.current.get(iso)
  const openFromPopover = (entry: CalendarTimeOffFull) => {
    const date = more?.date
    setMore(null)
    onOpenEntry(entry, date === undefined ? () => undefined : cellOf(date))
  }
  const moreItems = more ? dayItems(data, more.date) : []

  return (
    <>
      {/* The cell label carries every chip's text; masked chips are not focusable, so their tooltip is the
          cell's description (A11Y-1, M4 fix-r3 lesson: a label must not hide what is inside). */}
      <span id={maskedHintId} className={styles.srOnly}>
        {th.calendar.maskedHint}
      </span>
      <div
        role="grid"
        aria-label={th.calendar.gridLabel(monthTitle(month))}
        aria-multiselectable="true"
        className={styles.grid}
      >
        <div role="row" className={styles.row}>
          {th.calendar.weekdays.map((d, i) => (
            <div
              key={d}
              role="columnheader"
              title={th.calendar.weekdaysLong[i]}
              className={styles.columnheader}
            >
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className={styles.row}>
            {week.map((iso) => {
              const entries = entriesOnDay(data.timeOff, iso)
              const items = dayItems(data, iso)
              const { shown, more: hidden } = splitVisible(items)
              const holiday = holidays.get(iso)
              const holidayText = holiday === undefined ? null : `${th.calendar.holidayPrefix} ${holiday}`
              const isFocused = iso === focused
              const selected = range !== null && range.startDate <= iso && iso <= range.endDate
              const date = formatThaiDate(iso)
              return (
                <div
                  key={iso}
                  ref={(el) => {
                    if (el) cells.current.set(iso, el)
                    else cells.current.delete(iso)
                  }}
                  role="gridcell"
                  data-testid={`day-${iso}`}
                  data-date={iso}
                  data-outside={inMonth(iso, month) ? undefined : true}
                  data-weekend={isoWeekday(iso) >= 6 ? true : undefined}
                  data-holiday={holiday === undefined ? undefined : true}
                  aria-selected={selected}
                  aria-current={iso === today ? 'date' : undefined}
                  aria-label={th.calendar.dayLabel(
                    holidayText ? `${date} ${holidayText}` : date,
                    ...items.map((it) =>
                      it.kind === 'milestone'
                        ? milestoneChipLabel(it.m)
                        : chipText(it.entry, person(it.entry.userId)),
                    ),
                  )}
                  aria-describedby={entries.some((e) => e.kind === 'masked') ? maskedHintId : undefined}
                  tabIndex={isFocused ? 0 : -1}
                  className={styles.cell}
                  onPointerDown={(e) => onPointerDown(e, iso)}
                  onPointerEnter={() => onPointerEnter(iso)}
                  onPointerUp={() => onPointerUp(iso)}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget && !isFocused) setFocus(iso)
                  }}
                  onKeyDown={onKeyDown}
                >
                  <div className={styles.dayHead}>
                    <span className={styles.dayNum}>{dayOfMonth(iso)}</span>
                    {iso === today ? <span className={styles.todayTag}>{th.calendar.today}</span> : null}
                  </div>
                  {holidayText ? <div className={styles.holiday}>{holidayText}</div> : null}
                  <div className={styles.chips}>
                    {shown.map((item, i) => (
                      <DayChip
                        key={itemKey(item, i)}
                        item={item}
                        person={person}
                        onOpen={(e) => onOpenEntry(e, cellOf(iso))}
                        tabIndex={isFocused ? 0 : -1}
                      />
                    ))}
                    {hidden > 0 ? (
                      <button
                        type="button"
                        className={styles.more}
                        aria-label={th.calendar.moreLabel(hidden)}
                        aria-haspopup="dialog"
                        tabIndex={isFocused ? 0 : -1}
                        onClick={(e) => setMore({ date: iso, anchor: e.currentTarget })}
                      >
                        {th.calendar.more(hidden)}
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <Popover
        open={more !== null}
        anchorEl={more?.anchor ?? null}
        onClose={() => setMore(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': more ? th.calendar.dayEntries(formatThaiDate(more.date)) : undefined,
            sx: { p: 1.5 },
          },
        }}
      >
        {more ? (
          <>
            <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
              {th.calendar.dayEntries(formatThaiDate(more.date))}
            </Typography>
            <ul className={styles.popoverList}>
              {moreItems.map((item, i) => (
                <li key={itemKey(item, i)}>
                  <DayChip item={item} person={person} onOpen={openFromPopover} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Popover>
    </>
  )
}
