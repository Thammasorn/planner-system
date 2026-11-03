'use client'
// src/components/tasks/team/TeamCalendar.tsx — /tasks ปฏิทิน (M11.4, FR-669): the filtered team cards on the project
// calendar's month grid (CalendarGrid, PlanAgenda < 600 px, NoDateList), Monday-first, Thai month + พ.ศ. Bars take the
// project colour + dot; BR-103a plan sides come from GET /api/tasks/plan-spans (qk.teamPlanSpans) — a failed spans
// read falls back to the explicit dates with a note. Holidays, leave and milestones are not drawn (kept simple).
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import { CalendarGrid } from '@/components/plan-calendar/PlanCalendar'
import { assigneeText, type BarInfo } from '@/components/plan-calendar/labels'
import { NoDateList } from '@/components/plan-calendar/NoDateList'
import { PlanAgenda } from '@/components/plan-calendar/PlanAgenda'
import styles from '@/components/plan-calendar/PlanCalendar.module.css'
import type { ISODate } from '@/domain/types'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import { addMonths, monthGrid, monthTitle, yearMonthOf, type YearMonth } from '@/lib/calendar/month-grid'
import type { MilestoneDTO } from '@/lib/contracts/milestones'
import type { PersonOption } from '@/lib/contracts/people'
import type { TeamPlanSpansResponse } from '@/lib/contracts/plan-spans'
import type { TeamTaskCard } from '@/lib/contracts/tasks'
import { taskPageHref } from '@/lib/nav/task-href'
import { noDateTasks } from '@/lib/plan-calendar/bars'
import { qk } from '@/lib/query-keys'
import { teamCalendarTasks } from '@/lib/tasks/team-calendar'

const NO_HOLIDAYS: ReadonlyMap<ISODate, string> = new Map()
const NO_MILESTONES: ReadonlyMap<ISODate, MilestoneDTO[]> = new Map()

export interface TeamCalendarProps {
  cards: readonly TeamTaskCard[]
  projectOf: (projectId: string) => { name: string; color: string }
  people: ReadonlyMap<string, PersonOption>
  /** the project filter (narrows the spans request) */
  projectId: string | undefined
  onOpen: (card: TeamTaskCard) => void
  /** tests start on a month; the app starts on today's month */
  initialMonth?: YearMonth
}

export function TeamCalendar({ cards, projectOf, people, projectId, onOpen, initialMonth }: TeamCalendarProps) {
  const today = useToday()
  const router = useRouter()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [month, setMonth] = useState<YearMonth>(initialMonth ?? yearMonthOf(today))
  const { from, to } = monthGrid(month)
  const spansQ = useQuery({
    queryKey: qk.teamPlanSpans(from, to, projectId ?? null),
    queryFn: ({ signal }) => {
      const sp = new URLSearchParams({ from, to })
      if (projectId) sp.set('projectId', projectId)
      return getJson<TeamPlanSpansResponse>(`/api/tasks/plan-spans?${sp.toString()}`, { signal })
    },
    placeholderData: keepPreviousData,
  })
  const spans = spansQ.data?.spans
  const tasks = useMemo(() => teamCalendarTasks(cards, spans), [cards, spans])
  const infos = useMemo(() => {
    const out = new Map<string, BarInfo>()
    for (const t of tasks) {
      const p = projectOf(t.card.projectId)
      out.set(t.id, {
        task: t,
        assignees: assigneeText(t.card.assigneeIds, people),
        certainty: t.card.certainty,
        project: { name: p.name, color: p.color },
      })
    }
    return out
  }, [tasks, projectOf, people])
  const noDates = useMemo(() => noDateTasks(tasks), [tasks])
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const open = (id: string) => {
    const c = byId.get(id)
    if (c) onOpen(c)
  }
  const openPage = (id: string) => router.push(taskPageHref(id))

  const view = {
    month,
    tasks,
    infos,
    holidays: NO_HOLIDAYS,
    milestonesByDate: NO_MILESTONES,
    showCompleted: true, // the "แสดงงานที่เสร็จแล้ว" filter already decided which cards are here
    today,
    onOpen: open,
    onOpenPage: openPage,
  }
  const side = <NoDateList tasks={noDates} infos={infos} onOpen={open} />

  return (
    <div className={styles.root} data-testid="team-calendar">
      <div className={styles.toolbar} role="toolbar" aria-label={th.planCalendar.toolbar}>
        <Tooltip title={th.planCalendar.prev}>
          <IconButton size="small" aria-label={th.planCalendar.prev} onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft />
          </IconButton>
        </Tooltip>
        <Box component="span" aria-live="polite" data-testid="plan-calendar-month" className={styles.monthTitle}>
          {monthTitle(month)}
        </Box>
        <Tooltip title={th.planCalendar.next}>
          <IconButton size="small" aria-label={th.planCalendar.next} onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight />
          </IconButton>
        </Tooltip>
        <Button size="small" onClick={() => setMonth(yearMonthOf(today))}>
          {th.planCalendar.today}
        </Button>
      </div>
      {spansQ.isError ? (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {th.teamTasks.calendar.spansError}
        </Alert>
      ) : null}
      {phone ? (
        <>
          <PlanAgenda {...view} />
          {side}
        </>
      ) : (
        <div className={styles.layout}>
          <CalendarGrid {...view} onMonthChange={setMonth} />
          {side}
        </div>
      )}
    </div>
  )
}
