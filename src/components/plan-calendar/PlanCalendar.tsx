'use client'
// src/components/plan-calendar/PlanCalendar.tsx — the project month calendar of the แผนงาน tab (SPEC FR-810–812,
// FR-820, BR-103, §8.13; plan/m07.1 S4.2, M7.1-D19). Read-only: dates change in the panel / task page.
// Data: M3's useProjectTasks (same as the งาน tab), holidays from GET /api/calendar, qk.planMarkers — no new endpoint.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import { compareISO, isoWeekday } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { useProjectTasks } from '@/components/tasks/useProjectTasks'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { usePreferences } from '@/hooks/usePreferences'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import {
  addMonths,
  dayOfMonth,
  inMonth,
  monthGrid,
  monthTitle,
  moveFocus,
  yearMonthOf,
  type YearMonth,
} from '@/lib/calendar/month-grid'
import type { CalendarResponse } from '@/lib/contracts/calendar'
import type { PersonOption } from '@/lib/contracts/people'
import type { PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import { formatThaiDate } from '@/lib/format'
import { matchesHotkey, type Hotkey } from '@/lib/keys'
import { taskPageHref } from '@/lib/nav/task-href'
import { monthBars, noDateTasks, taskOrder, taskSpan } from '@/lib/plan-calendar/bars'
import { qk } from '@/lib/query-keys'
import { taskPreference } from '@/lib/schemas/preferences'
import { taskCertainty } from '@/lib/tasks/certainty'
import { assigneeIdsByTask, assigneeText, type BarInfo } from './labels'
import { MarkerFlags } from './MarkerFlags'
import { NoDateList } from './NoDateList'
import { PlanAgenda, type CalendarViewProps } from './PlanAgenda'
import { TaskBar } from './TaskBar'
import { usePlanMarkers } from './usePlanMarkers'
import styles from './PlanCalendar.module.css'

export interface PlanCalendarProps {
  projectId: string
  /** projects.color — bar background tint + edge */
  projectColor: string
  /** the [แผนงาน | ปฏิทิน] switch, rendered first in the toolbar (FR-810) */
  toolbarStart?: ReactNode
  onOpenTask: (taskId: string) => void
  /** tests start on a month; the app starts on today's month */
  initialMonth?: YearMonth
}

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const
type Arrow = (typeof ARROWS)[number]
const OPEN_KEYS: readonly Hotkey[] = [
  { code: 'Enter', key: 'Enter' },
  { code: 'NumpadEnter' },
  { code: 'Space', key: ' ' },
]
const PAGE_UP: Hotkey = { code: 'PageUp', key: 'PageUp' }
const PAGE_DOWN: Hotkey = { code: 'PageDown', key: 'PageDown' }

/** The same day number in `ym`, clamped to the month's last day. */
function sameDayIn(d: ISODate, ym: YearMonth): ISODate {
  const last = monthGrid(ym)
    .weeks.flat()
    .filter((x) => inMonth(x, ym))
    .at(-1)!
  const day = Math.min(dayOfMonth(d), dayOfMonth(last))
  return `${ym}-${String(day).padStart(2, '0')}`
}

/** Everything the calendar views need, derived once per data change. */
export function useCalendarModel(projectId: string, month: YearMonth) {
  const tasksQ = useProjectTasks(projectId)
  const peopleQ = usePeopleOptions()
  const markersQ = usePlanMarkers(projectId)
  const { from, to } = monthGrid(month)
  const calQ = useQuery({
    queryKey: qk.calendar(from, to),
    queryFn: ({ signal }) => getJson<CalendarResponse>(`/api/calendar?from=${from}&to=${to}`, { signal }),
    placeholderData: keepPreviousData,
  })
  const { prefs, setPreference } = usePreferences()
  const showCompleted = taskPreference(prefs, 'tasks.showCompleted')
  const data = tasksQ.data

  const people = useMemo(
    () => new Map<string, PersonOption>((peopleQ.data ?? []).map((p) => [p.id, p])),
    [peopleQ.data],
  )
  const infos = useMemo(() => {
    const out = new Map<string, BarInfo>()
    if (!data) return out
    const byId = new Map(data.tasks.map((t) => [t.id, t]))
    const assignees = assigneeIdsByTask(data.tasks)
    for (const t of data.tasks)
      out.set(t.id, {
        task: t,
        assignees: assigneeText(assignees.get(t.id) ?? [], people),
        certainty: taskCertainty(byId, t.id, data.project.certainty).value,
      })
    return out
  }, [data, people])
  const holidays = useMemo(
    () => new Map((calQ.data?.holidays ?? []).map((h) => [h.date, h.name])),
    [calQ.data?.holidays],
  )
  const markersByDate = useMemo(() => {
    const out = new Map<ISODate, PlanMarkerDTO[]>()
    for (const m of markersQ.data?.markers ?? []) {
      const list = out.get(m.date)
      if (list) list.push(m)
      else out.set(m.date, [m])
    }
    return out
  }, [markersQ.data])
  const noDates = useMemo(() => (data ? noDateTasks(data.tasks, { showCompleted }) : []), [data, showCompleted])

  return {
    tasksQ,
    tasks: data?.tasks,
    infos,
    holidays,
    markersByDate,
    noDates,
    showCompleted,
    setShowCompleted: (on: boolean) => setPreference('tasks.showCompleted', on),
  }
}

/**
 * Month grid (FR-811): 6 Monday-first week rows (`role="grid"`, roving focus like M5's MonthGrid — arrows ±1/±7 days,
 * PageUp/PageDown = month, Enter/Space = the day's task list), BR-103 bars in ≤ 3 lanes per week row, "+N" → popover.
 * Bars covering the focused day are in the tab order; Enter = panel, Shift+Space = task page.
 */
export function PlanCalendar({ projectId, projectColor, toolbarStart, onOpenTask, initialMonth }: PlanCalendarProps) {
  const today = useToday()
  const router = useRouter()
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('sm'))
  const [month, setMonth] = useState<YearMonth>(initialMonth ?? yearMonthOf(today))
  const model = useCalendarModel(projectId, month)
  const title = monthTitle(month)
  const openPage = (id: string) => router.push(taskPageHref(id))
  const rootStyle = { '--bar-color': projectColor } as CSSProperties

  const toolbar = (
    <div className={styles.toolbar} role="toolbar" aria-label={th.planCalendar.toolbar}>
      {toolbarStart}
      <Tooltip title={th.planCalendar.prev}>
        <IconButton size="small" aria-label={th.planCalendar.prev} onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft />
        </IconButton>
      </Tooltip>
      <Box component="span" aria-live="polite" data-testid="plan-calendar-month" className={styles.monthTitle}>
        {title}
      </Box>
      <Tooltip title={th.planCalendar.next}>
        <IconButton size="small" aria-label={th.planCalendar.next} onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight />
        </IconButton>
      </Tooltip>
      <Button size="small" onClick={() => setMonth(yearMonthOf(today))}>
        {th.planCalendar.today}
      </Button>
      <FormControlLabel
        className={styles.toolbarCheck}
        control={
          <Checkbox
            size="small"
            checked={model.showCompleted}
            onChange={(_e, on) => model.setShowCompleted(on)}
          />
        }
        label={th.grid.toolbar.showCompleted}
        slotProps={{ typography: { sx: { fontSize: 'var(--font-sm)' } } }}
      />
    </div>
  )

  let body: ReactNode
  if (model.tasks) {
    const tasks = model.tasks
    const side = <NoDateList tasks={model.noDates} infos={model.infos} onOpen={onOpenTask} />
    body = phone ? (
      <>
        <PlanAgenda
          month={month}
          tasks={tasks}
          infos={model.infos}
          holidays={model.holidays}
          markersByDate={model.markersByDate}
          showCompleted={model.showCompleted}
          today={today}
          onOpen={onOpenTask}
          onOpenPage={openPage}
        />
        {side}
      </>
    ) : (
      <div className={styles.layout}>
        <CalendarGrid
          month={month}
          tasks={tasks}
          infos={model.infos}
          holidays={model.holidays}
          markersByDate={model.markersByDate}
          showCompleted={model.showCompleted}
          today={today}
          onOpen={onOpenTask}
          onOpenPage={openPage}
          onMonthChange={setMonth}
        />
        {side}
      </div>
    )
  } else if (model.tasksQ.isError) {
    body = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void model.tasksQ.refetch()}>
            {th.planCalendar.retry}
          </Button>
        }
      >
        {th.planCalendar.loadError}
      </Alert>
    )
  } else {
    body = (
      <Box aria-busy="true">
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          {th.planCalendar.loading}
        </Typography>
        <Skeleton variant="rounded" height={480} />
      </Box>
    )
  }

  return (
    <div className={styles.root} style={rootStyle} data-testid="plan-calendar">
      {toolbar}
      {body}
    </div>
  )
}

function CalendarGrid(p: CalendarViewProps & { onMonthChange: (m: YearMonth) => void }) {
  const { month, today } = p
  const { from, to, weeks } = useMemo(() => monthGrid(month), [month])
  const rows = useMemo(
    () => monthBars(p.tasks, month, { showCompleted: p.showCompleted }),
    [p.tasks, month, p.showCompleted],
  )
  /** shown tasks with a span inside the 6-week range, in task order (BR-105) — the "+N" / Enter popover */
  const spans = useMemo(() => {
    const ord = taskOrder(p.tasks)
    return p.tasks
      .filter((t) => p.showCompleted || t.completedOn === null)
      .flatMap((t) => {
        const sp = taskSpan(t)
        return sp && compareISO(sp.end, from) >= 0 && compareISO(sp.start, to) < 0 ? [{ id: t.id, ...sp }] : []
      })
      .sort((a, b) => ord.get(a.id)! - ord.get(b.id)!)
  }, [p.tasks, p.showCompleted, from, to])
  const tasksOn = (d: ISODate) =>
    spans.filter((x) => compareISO(x.start, d) <= 0 && compareISO(d, x.end) <= 0).map((x) => x.id)

  const defaultFocus = inMonth(today, month) ? today : `${month}-01`
  const [focusState, setFocus] = useState<ISODate>(defaultFocus)
  const focused = focusState >= from && focusState < to ? focusState : defaultFocus
  const focusDom = useRef(false)
  const cells = useRef(new Map<ISODate, HTMLDivElement>())
  const [pop, setPop] = useState<{ date: ISODate; anchor: HTMLElement } | null>(null)

  useEffect(() => {
    if (!focusDom.current) return
    focusDom.current = false
    cells.current.get(focused)?.focus()
  }, [focused, month])

  const moveTo = (next: ISODate, monthOf?: YearMonth) => {
    focusDom.current = true
    setFocus(next)
    if (monthOf !== undefined && monthOf !== month) p.onMonthChange(monthOf)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, iso: ISODate) => {
    if (e.target !== e.currentTarget) return // keys on a bar / "+N" belong to that control
    const native = e.nativeEvent
    const dir = ARROWS.find((a: Arrow) => matchesHotkey(native, { code: a, key: a }))
    if (dir) {
      e.preventDefault()
      const next = moveFocus(iso, dir)
      moveTo(next, next < from || next >= to ? yearMonthOf(next) : undefined)
      return
    }
    if (matchesHotkey(native, PAGE_UP) || matchesHotkey(native, PAGE_DOWN)) {
      e.preventDefault()
      const ym = addMonths(month, matchesHotkey(native, PAGE_UP) ? -1 : 1)
      moveTo(sameDayIn(iso, ym), ym)
      return
    }
    if (OPEN_KEYS.some((hk) => matchesHotkey(native, hk)) && tasksOn(iso).length > 0) {
      e.preventDefault()
      setPop({ date: iso, anchor: e.currentTarget })
    }
  }

  const popTasks = pop ? tasksOn(pop.date) : []

  return (
    <>
      <div role="grid" aria-label={th.planCalendar.gridLabel(monthTitle(month))} className={styles.grid}>
        <div role="row" className={styles.row}>
          {th.calendar.weekdays.map((d, i) => (
            <div key={d} role="columnheader" title={th.calendar.weekdaysLong[i]} className={styles.columnheader}>
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, w) => {
          const row = rows[w]!
          return (
            <div key={week[0]} role="row" className={styles.row} data-week={week[0]}>
              {week.map((iso, col) => {
                const holiday = p.holidays.get(iso)
                const isFocused = iso === focused
                const dayTasks = tasksOn(iso)
                const hidden = row.overflow.get(iso)?.length ?? 0
                const date = formatThaiDate(iso)
                const label = th.planCalendar.dayLabel(
                  holiday === undefined ? date : `${date} ${th.planCalendar.holiday(holiday)}`,
                  dayTasks.length,
                )
                return (
                  <div
                    key={iso}
                    ref={(el) => {
                      if (el) cells.current.set(iso, el)
                      else cells.current.delete(iso)
                    }}
                    role="gridcell"
                    data-testid={`plan-day-${iso}`}
                    data-date={iso}
                    data-outside={inMonth(iso, month) ? undefined : true}
                    data-weekend={isoWeekday(iso) >= 6 ? true : undefined}
                    data-holiday={holiday === undefined ? undefined : true}
                    aria-current={iso === today ? 'date' : undefined}
                    aria-label={label}
                    title={holiday === undefined ? undefined : th.planCalendar.holiday(holiday)}
                    tabIndex={isFocused ? 0 : -1}
                    className={styles.cell}
                    onFocus={(e) => {
                      if (e.target === e.currentTarget && !isFocused) setFocus(iso)
                    }}
                    onKeyDown={(e) => onKeyDown(e, iso)}
                  >
                    <div className={styles.dayHead}>
                      <span className={styles.dayNum} aria-hidden="true">
                        {dayOfMonth(iso)}
                      </span>
                      {iso === today ? (
                        <span className={styles.todayTag} aria-hidden="true">
                          {th.calendar.today}
                        </span>
                      ) : null}
                      {holiday !== undefined ? (
                        <span className={styles.holidayGlyph} aria-hidden="true">
                          {th.calendar.holidayPrefix}
                        </span>
                      ) : null}
                      <MarkerFlags markers={p.markersByDate.get(iso)} />
                    </div>
                    {row.segments
                      .filter((s) => s.startCol === col)
                      .map((s) => {
                        const info = p.infos.get(s.taskId)
                        if (!info) return null
                        const covers = focused >= week[s.startCol]! && focused <= week[s.endCol]!
                        return (
                          <TaskBar
                            key={s.taskId}
                            info={info}
                            className={styles.bar}
                            style={{ '--lane': s.lane, '--span': s.endCol - s.startCol + 1 } as CSSProperties}
                            cutLeft={s.continuesLeft}
                            cutRight={s.continuesRight}
                            tabIndex={covers ? 0 : -1}
                            onOpen={p.onOpen}
                            onOpenPage={p.onOpenPage}
                          />
                        )
                      })}
                    {hidden > 0 ? (
                      <button
                        type="button"
                        className={styles.more}
                        aria-label={th.planCalendar.moreLabel(hidden)}
                        aria-haspopup="dialog"
                        tabIndex={isFocused ? 0 : -1}
                        onClick={(e) => setPop({ date: iso, anchor: e.currentTarget })}
                      >
                        {th.planCalendar.more(hidden)}
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <Popover
        open={pop !== null}
        anchorEl={pop?.anchor ?? null}
        onClose={() => setPop(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': pop ? th.planCalendar.dayTasks(formatThaiDate(pop.date)) : undefined,
            sx: { p: 1.5 },
          },
        }}
      >
        {pop ? (
          <>
            <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
              {th.planCalendar.dayTasks(formatThaiDate(pop.date))}
            </Typography>
            <ul className={styles.popoverList}>
              {popTasks.map((id) => {
                const info = p.infos.get(id)
                if (!info) return null
                return (
                  <li key={id}>
                    <TaskBar
                      info={info}
                      className={styles.listItem}
                      tabIndex={0}
                      linkTabIndex={0}
                      onOpen={(tid) => {
                        setPop(null)
                        p.onOpen(tid)
                      }}
                      onOpenPage={p.onOpenPage}
                    />
                  </li>
                )
              })}
            </ul>
          </>
        ) : null}
      </Popover>
    </>
  )
}
