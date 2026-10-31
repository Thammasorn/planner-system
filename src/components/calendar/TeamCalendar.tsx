'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import { addMonths, monthGrid, monthTitle, yearMonthOf, type YearMonth } from '@/lib/calendar/month-grid'
import type { CalendarResponse } from '@/lib/contracts/calendar'
import { qk } from '@/lib/query-keys'
import { AgendaList } from './AgendaList'
import { useLeaveDialog } from './LeaveDialogProvider'
import { MonthGrid } from './MonthGrid'

/**
 * /calendar (FR-907/908, M5-D8/D13): month header with ‹ เดือนนี้ › and "แจ้งลา", the month grid (or the agenda list
 * under 600 px) fed by GET /api/calendar for the month's 6-week range. The month lives in the URL (`?month=`,
 * replaceState — no localStorage, X53). Selecting days or an own chip opens the shared leave dialog.
 */
export function TeamCalendar({ initialMonth }: { initialMonth: YearMonth }) {
  const today = useToday()
  const theme = useTheme()
  const narrow = useMediaQuery(theme.breakpoints.down('sm'))
  const dialog = useLeaveDialog()
  const [month, setMonthState] = useState(initialMonth)
  const { from, to } = monthGrid(month)
  const q = useQuery({
    queryKey: qk.calendar(from, to),
    queryFn: ({ signal }) => getJson<CalendarResponse>(`/api/calendar?from=${from}&to=${to}`, { signal }),
    placeholderData: keepPreviousData,
  })

  const setMonth = (m: YearMonth) => {
    if (m === month) return
    setMonthState(m)
    window.history.replaceState(null, '', `?month=${m}`)
  }
  const title = monthTitle(month)
  // keepPreviousData shows the last month's response while the new range loads: days outside that range would look
  // empty (no leave, no 🎌), so the view is marked busy with a labelled progress bar until the right data arrives.
  const stale = q.isPlaceholderData

  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h4" component="h1" sx={{ mr: 1 }}>
          {title}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Tooltip title={th.calendar.prevMonth}>
            <IconButton aria-label={th.calendar.prevMonth} onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft />
            </IconButton>
          </Tooltip>
          <Button variant="outlined" size="small" onClick={() => setMonth(yearMonthOf(today))}>
            {th.calendar.thisMonth}
          </Button>
          <Tooltip title={th.calendar.nextMonth}>
            <IconButton aria-label={th.calendar.nextMonth} onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight />
            </IconButton>
          </Tooltip>
        </Stack>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<EventBusyOutlined />}
          onClick={() => dialog.open({ mode: 'create' })}
        >
          {th.calendar.reportLeave}
        </Button>
      </Stack>

      {q.data ? (
        <Stack
          spacing={2}
          data-testid="calendar-view"
          aria-busy={stale ? true : undefined}
          sx={{ minWidth: 0 }}
        >
          {/* Fixed 4 px slot so the bar appearing never shifts the grid. */}
          <Box sx={{ height: 4 }}>{stale ? <LinearProgress aria-label={th.calendar.loading} /> : null}</Box>
          {narrow ? (
            <AgendaList
              month={month}
              data={q.data}
              today={today}
              onOpenEntry={(entry, returnFocus) => dialog.open({ mode: 'edit', entry, returnFocus })}
            />
          ) : (
            <>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {th.calendar.selectHint}
              </Typography>
              <MonthGrid
                month={month}
                data={q.data}
                today={today}
                onSelectRange={(r) => dialog.open({ mode: 'create', ...r })}
                onOpenEntry={(entry, returnFocus) => dialog.open({ mode: 'edit', entry, returnFocus })}
                onMonthChange={setMonth}
              />
            </>
          )}
        </Stack>
      ) : q.isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void q.refetch()}>
              {th.calendar.retry}
            </Button>
          }
        >
          {th.calendar.loadError}
        </Alert>
      ) : (
        <Box aria-busy="true">
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
            {th.calendar.loading}
          </Typography>
          <Skeleton variant="rounded" height={480} />
        </Box>
      )}
    </Stack>
  )
}
