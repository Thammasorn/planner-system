import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderCalendarUi } from './render.test.helper'
import { IDS, VACATION, calendarData, full, masked } from './test-data.test.helper'
import { TeamCalendar } from './TeamCalendar'

const api = vi.hoisted(() => ({ getJson: vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>() }))
vi.mock('@/lib/api', () => api)
const actions = vi.hoisted(() => ({
  createTimeOff: vi.fn<(i: unknown) => Promise<unknown>>(),
  updateTimeOff: vi.fn<(i: unknown) => Promise<unknown>>(),
  deleteTimeOff: vi.fn<(i: unknown) => Promise<unknown>>(),
  restoreTimeOff: vi.fn<(i: unknown) => Promise<unknown>>(),
}))
vi.mock('@/server/actions/time-off', () => actions)

/** false once the test deleted Peter's 10-05..10-06 leave: the refetch no longer returns it. */
let peterLeave = true

function respond(url: string) {
  const u = new URL(url, 'http://localhost')
  if (u.pathname === '/api/calendar') {
    const from = u.searchParams.get('from') ?? ''
    const to = u.searchParams.get('to') ?? ''
    return Promise.resolve(
      calendarData(
        from,
        to,
        [
          ...(peterLeave ? [full(IDS.peter, '2026-10-05', '2026-10-06')] : []),
          masked(IDS.ivy, '2026-10-20', '2026-10-20', 'AM'),
        ],
        [{ date: '2026-10-23', name: 'วันปิยมหาราช' }],
      ),
    )
  }
  return new Promise<never>(() => {})
}

const originalMatchMedia = window.matchMedia
function stubNarrowViewport() {
  window.matchMedia = vi.fn((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }))
}

beforeEach(() => {
  peterLeave = true
  for (const f of Object.values(actions)) f.mockReset()
  api.getJson.mockReset()
  api.getJson.mockImplementation(respond)
  window.history.replaceState(null, '', '/calendar')
})
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('TeamCalendar (FR-907, M5-D8/D13)', () => {
  it('shows the month title "กันยายน 2569" and fetches the 6-week range', async () => {
    renderCalendarUi(<TeamCalendar initialMonth="2026-09" />)
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('กันยายน 2569')
    // M6.1 header bar: ปฏิทินทีม is the screen's one <h1>; month navigation and แจ้งลา sit on the right
    const bar = screen.getByTestId('page-header')
    expect(within(bar).getByRole('heading', { level: 1, name: th.calendar.title })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: th.calendar.reportLeave })).toBeInTheDocument()
    expect(await screen.findByRole('grid')).toBeInTheDocument()
    expect(api.getJson).toHaveBeenCalledWith('/api/calendar?from=2026-08-31&to=2026-10-12', expect.anything())
    expect(screen.getByText(th.calendar.selectHint)).toBeInTheDocument()
  })

  it('next fetches from=2026-09-28&to=2026-11-09 and writes ?month= to the URL; เดือนนี้ goes back', async () => {
    const user = userEvent.setup()
    renderCalendarUi(<TeamCalendar initialMonth="2026-09" />)
    await screen.findByRole('grid')
    await user.click(screen.getByRole('button', { name: th.calendar.nextMonth }))
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('ตุลาคม 2569')
    expect(api.getJson).toHaveBeenCalledWith('/api/calendar?from=2026-09-28&to=2026-11-09', expect.anything())
    expect(window.location.search).toBe('?month=2026-10')
    expect(await screen.findByText(`${th.calendar.holidayPrefix} วันปิยมหาราช`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.calendar.thisMonth }))
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('กันยายน 2569')
    await user.click(screen.getByRole('button', { name: th.calendar.prevMonth }))
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('สิงหาคม 2569')
    expect(window.location.search).toBe('?month=2026-08')
  })

  it('changing month marks the stale grid busy with a labelled progress bar until the new range arrives', async () => {
    const user = userEvent.setup()
    renderCalendarUi(<TeamCalendar initialMonth="2026-09" />)
    await screen.findByRole('grid')
    expect(screen.getByTestId('calendar-view')).not.toHaveAttribute('aria-busy')
    expect(screen.queryByRole('progressbar')).toBeNull()
    let release = () => {}
    api.getJson.mockImplementationOnce(
      (url) => new Promise((resolve) => (release = () => resolve(respond(url)))),
    )
    await user.click(screen.getByRole('button', { name: th.calendar.nextMonth }))
    // The October grid is drawn over September's response (keepPreviousData), so the view must say it is loading.
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('ตุลาคม 2569')
    expect(screen.getByTestId('calendar-view')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('progressbar', { name: th.calendar.loading })).toBeInTheDocument()
    release()
    await waitFor(() => expect(screen.getByTestId('calendar-view')).not.toHaveAttribute('aria-busy'))
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('selecting days opens the leave dialog pre-filled with the range', async () => {
    renderCalendarUi(<TeamCalendar initialMonth="2026-10" />)
    await screen.findByRole('grid')
    fireEvent.pointerDown(screen.getByTestId('day-2026-10-12'), { button: 0 })
    fireEvent.pointerEnter(screen.getByTestId('day-2026-10-13'))
    fireEvent.pointerUp(screen.getByTestId('day-2026-10-13'))
    const dialog = await screen.findByRole('dialog', { name: th.timeOff.dialog.titleCreate })
    const values = [...dialog.querySelectorAll<HTMLInputElement>('.MuiPickersTextField-root input')].map(
      (i) => i.value,
    )
    expect(values).toEqual(['12/10/2569', '13/10/2569'])
  })

  it('an own chip opens the edit dialog; "แจ้งลา" opens an empty create dialog', async () => {
    const user = userEvent.setup()
    renderCalendarUi(<TeamCalendar initialMonth="2026-10" />)
    const cell = await screen.findByTestId('day-2026-10-05')
    await user.click(within(cell).getByRole('button', { name: th.calendar.leaveOf('Peter', 'ลาพักร้อน') }))
    expect(await screen.findByRole('dialog', { name: th.timeOff.dialog.titleEdit })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: th.calendar.reportLeave }))
    expect(await screen.findByRole('dialog', { name: th.timeOff.dialog.titleCreate })).toBeInTheDocument()
  })

  it('a narrow viewport renders the agenda list, not role="grid"', async () => {
    stubNarrowViewport()
    renderCalendarUi(<TeamCalendar initialMonth="2026-10" />)
    const agenda = await screen.findByTestId('calendar-agenda')
    expect(screen.queryByRole('grid')).toBeNull()
    expect(
      within(agenda)
        .getAllByRole('listitem')
        .map((li) => li.dataset.testid),
    ).toEqual(['agenda-2026-10-05', 'agenda-2026-10-06', 'agenda-2026-10-20', 'agenda-2026-10-23'])
    expect(
      within(screen.getByTestId('agenda-2026-10-20')).getByText(
        `${th.calendar.leaveOf('Ivy', th.masking.leave)} (${th.calendar.half.AM})`,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(th.calendar.selectHint)).toBeNull()
  })

  it('a failed load shows the error with a retry', async () => {
    const user = userEvent.setup()
    api.getJson.mockRejectedValueOnce(new Error('boom'))
    renderCalendarUi(<TeamCalendar initialMonth="2026-10" />)
    expect(await screen.findByText(th.calendar.loadError)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.calendar.retry }))
    expect(await screen.findByRole('grid')).toBeInTheDocument()
  })

  it('deleting leave from the edit dialog returns focus to the chip’s day cell, not <body> (SPEC §8.9)', async () => {
    const user = userEvent.setup()
    actions.deleteTimeOff.mockImplementation(() => {
      peterLeave = false
      return Promise.resolve({
        ok: true,
        batch: '5b1c2c38-5a8e-4a6c-9a0e-00000000b001',
        userId: IDS.peter,
        startDate: '2026-10-05',
        endDate: '2026-10-06',
        half: null,
      })
    })
    renderCalendarUi(<TeamCalendar initialMonth="2026-10" />)
    const cell = await screen.findByTestId('day-2026-10-05')
    const chipName = th.calendar.leaveOf('Peter', 'ลาพักร้อน')
    await user.click(within(cell).getByRole('button', { name: chipName }))
    const dialog = await screen.findByRole('dialog', { name: th.timeOff.dialog.titleEdit })
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.delete }))
    expect(actions.deleteTimeOff).toHaveBeenCalledTimes(1)
    // The refetch drops the entry: its chip (the element the dialog opened from) unmounts.
    await waitFor(() => expect(within(screen.getByTestId('day-2026-10-05')).queryByRole('button')).toBeNull())
    expect(screen.getByTestId('day-2026-10-05')).toHaveFocus()
  })

  it('agenda (phone): deleting leave whose days vanish moves focus to the next remaining day, not <body>', async () => {
    stubNarrowViewport()
    const user = userEvent.setup()
    actions.deleteTimeOff.mockImplementation(() => {
      peterLeave = false
      return Promise.resolve({
        ok: true,
        batch: '5b1c2c38-5a8e-4a6c-9a0e-00000000b002',
        userId: IDS.peter,
        startDate: '2026-10-05',
        endDate: '2026-10-06',
        half: null,
      })
    })
    renderCalendarUi(<TeamCalendar initialMonth="2026-10" />)
    const day = await screen.findByTestId('agenda-2026-10-05')
    await user.click(within(day).getByRole('button', { name: th.calendar.leaveOf('Peter', 'ลาพักร้อน') }))
    const dialog = await screen.findByRole('dialog', { name: th.timeOff.dialog.titleEdit })
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.delete }))
    expect(actions.deleteTimeOff).toHaveBeenCalledTimes(1)
    // The refetch drops 10-05 and 10-06 (no leave, no holiday left): the day the dialog returned focus to is gone.
    await waitFor(() => expect(screen.queryByTestId('agenda-2026-10-05')).toBeNull())
    expect(screen.queryByTestId('agenda-2026-10-06')).toBeNull()
    expect(screen.getByTestId('agenda-2026-10-20')).toHaveFocus()
  })

  it('agenda (phone): after the delete, focus lands on the chip’s day while that day is still listed', async () => {
    stubNarrowViewport()
    const user = userEvent.setup()
    actions.deleteTimeOff.mockResolvedValue({
      ok: true,
      batch: '5b1c2c38-5a8e-4a6c-9a0e-00000000b003',
      userId: IDS.peter,
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      half: null,
    })
    renderCalendarUi(<TeamCalendar initialMonth="2026-10" />)
    const day = await screen.findByTestId('agenda-2026-10-05')
    await user.click(within(day).getByRole('button', { name: th.calendar.leaveOf('Peter', 'ลาพักร้อน') }))
    const dialog = await screen.findByRole('dialog', { name: th.timeOff.dialog.titleEdit })
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.delete }))
    // The server still returns the entry here (peterLeave stays true), so the day survives the refetch.
    await waitFor(() => expect(screen.getByTestId('agenda-2026-10-05')).toHaveFocus())
  })

  it('keyboard quick path: Shift+ArrowRight, Enter on the grid, then Enter again records the range', async () => {
    const user = userEvent.setup()
    actions.createTimeOff.mockResolvedValue({
      ok: true,
      id: '7a1c2c38-5a8e-4a6c-9a0e-0000000000ac',
      impact: { userId: IDS.peter, userName: 'Peter', weeks: [], overloads: [], onTimeOffDays: [] },
    })
    renderCalendarUi(<TeamCalendar initialMonth="2026-10" />)
    ;(await screen.findByTestId('day-2026-10-12')).focus()
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}{Enter}')
    const dialog = await screen.findByRole('dialog', { name: th.timeOff.dialog.titleCreate })
    await waitFor(() => expect(dialog).toHaveFocus())
    await user.keyboard('{Enter}')
    expect(actions.createTimeOff).toHaveBeenCalledWith({
      leaveTypeId: VACATION.id,
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      half: null,
      note: '',
    })
    expect(await within(dialog).findByText(th.timeOff.dialog.saved)).toBeInTheDocument()
  })
})
