import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { CalendarResponse, CalendarTimeOffFull } from '@/lib/contracts/calendar'
import { renderWithProviders } from '../../../tests/helpers/render'
import { MonthGrid, type DayRange } from './MonthGrid'
import { IDS, calendarData, full, masked } from './test-data.test.helper'

const OCT_FROM = '2026-09-28'
const OCT_TO = '2026-11-09'

function setup(
  opts: { month?: string; data?: CalendarResponse; today?: string; onMonthChange?: (m: string) => void } = {},
) {
  const onSelectRange = vi.fn<(r: DayRange) => void>()
  const onOpenEntry = vi.fn<(e: CalendarTimeOffFull, returnFocus: () => HTMLElement | undefined) => void>()
  const month = opts.month ?? '2026-10'
  renderWithProviders(
    <MonthGrid
      month={month}
      data={opts.data ?? calendarData(OCT_FROM, OCT_TO)}
      today={opts.today ?? '2026-09-30'}
      onSelectRange={onSelectRange}
      onOpenEntry={onOpenEntry}
      {...(opts.onMonthChange ? { onMonthChange: opts.onMonthChange } : {})}
    />,
  )
  return { onSelectRange, onOpenEntry }
}

const day = (iso: string) => screen.getByTestId(`day-${iso}`)

describe('MonthGrid (FR-907, M5-D13)', () => {
  it('September 2026 renders a labelled grid of 6 Monday-first weeks (42 days)', () => {
    setup({ month: '2026-09', data: calendarData('2026-08-31', '2026-10-12') })
    const grid = screen.getByRole('grid', { name: th.calendar.gridLabel('กันยายน 2569') })
    const cells = within(grid).getAllByRole('gridcell')
    expect(cells).toHaveLength(42)
    expect(cells[0]).toHaveAttribute('data-testid', 'day-2026-08-31')
    expect(cells[0]).toHaveAttribute('data-outside')
    expect(cells[41]).toHaveAttribute('data-testid', 'day-2026-10-11')
    expect(day('2026-09-01')).not.toHaveAttribute('data-outside')
    expect(day('2026-09-05')).toHaveAttribute('data-weekend')
    const headers = within(grid).getAllByRole('columnheader')
    expect(headers.map((h) => h.textContent)).toEqual([...th.calendar.weekdays])
    expect(headers[0]).toHaveAttribute('title', th.calendar.weekdaysLong[0])
  })

  it('a holiday shows its name text (not colour alone)', () => {
    setup({ data: calendarData(OCT_FROM, OCT_TO, [], [{ date: '2026-10-23', name: 'วันปิยมหาราช' }]) })
    const cell = day('2026-10-23')
    expect(cell).toHaveAttribute('data-holiday')
    expect(within(cell).getByText(`${th.calendar.holidayPrefix} วันปิยมหาราช`)).toBeInTheDocument()
  })

  it('today has aria-current="date" and the visible text วันนี้', () => {
    setup()
    const cell = day('2026-09-30')
    expect(cell).toHaveAttribute('aria-current', 'date')
    expect(within(cell).getByText(th.calendar.today)).toBeInTheDocument()
    expect(day('2026-10-01')).not.toHaveAttribute('aria-current')
  })

  it('a masked chip shows "Ivy · ลา" and is not a button; a full chip is a button that opens the entry', async () => {
    const user = userEvent.setup()
    const mine = full(IDS.peter, '2026-10-05', '2026-10-06')
    const { onOpenEntry } = setup({
      data: calendarData(OCT_FROM, OCT_TO, [mine, masked(IDS.ivy, '2026-10-05')]),
    })
    const cell = day('2026-10-05')
    const ivyChip = within(cell).getByText(th.calendar.leaveOf('Ivy', th.masking.leave))
    expect(ivyChip.tagName).toBe('SPAN')
    expect(
      within(cell).queryByRole('button', { name: th.calendar.leaveOf('Ivy', th.masking.leave) }),
    ).toBeNull()
    const mineChip = within(cell).getByRole('button', { name: th.calendar.leaveOf('Peter', 'ลาพักร้อน') })
    expect(
      within(day('2026-10-06')).getByText(th.calendar.leaveOf('Peter', 'ลาพักร้อน')),
    ).toBeInTheDocument()
    await user.click(mineChip)
    expect(onOpenEntry).toHaveBeenCalledWith(mine, expect.any(Function))
  })

  it('a day cell’s accessible name lists every chip text (masked too) and masked days describe why (A11Y-1)', () => {
    const entries = [
      full(IDS.peter, '2026-10-05', '2026-10-06'),
      ...[IDS.ivy, IDS.cindy, IDS.jack].map((u) => masked(u, '2026-10-05')),
    ]
    setup({ data: calendarData(OCT_FROM, OCT_TO, entries, [{ date: '2026-10-23', name: 'วันปิยมหาราช' }]) })
    const label = day('2026-10-05').getAttribute('aria-label') ?? ''
    expect(label.startsWith('5 ต.ค. 2569 · ')).toBe(true)
    // all four people, including the one hidden behind "+1" — never just a count
    for (const name of ['Peter · ลาพักร้อน', 'Ivy · ลา', 'Cindy · ลา', 'Jack · ลา'])
      expect(label).toContain(name)
    expect(day('2026-10-05')).toHaveAccessibleDescription(th.calendar.maskedHint)
    // a day with only the owner's full entry has no masked hint; an empty holiday is date + name only
    expect(day('2026-10-06')).toHaveAccessibleName(
      `6 ต.ค. 2569 · ${th.calendar.leaveOf('Peter', 'ลาพักร้อน')}`,
    )
    expect(day('2026-10-06')).not.toHaveAttribute('aria-describedby')
    expect(day('2026-10-23')).toHaveAccessibleName(`23 ต.ค. 2569 ${th.calendar.holidayPrefix} วันปิยมหาราช`)
  })

  it('a half-day chip says เช้า / บ่าย; a deactivated person gets the suffix', () => {
    setup({
      data: calendarData(OCT_FROM, OCT_TO, [
        full(IDS.peter, '2026-10-20', '2026-10-20', { half: 'AM' }),
        masked(IDS.mint, '2026-10-20', '2026-10-20', 'PM'),
      ]),
    })
    const cell = day('2026-10-20')
    expect(
      within(cell).getByText(`${th.calendar.leaveOf('Peter', 'ลาพักร้อน')} (${th.calendar.half.AM})`),
    ).toBeInTheDocument()
    expect(
      within(cell).getByText(
        `${th.calendar.leaveOf(`Mint ${th.users.deactivatedSuffix}`, th.masking.leave)} (${th.calendar.half.PM})`,
      ),
    ).toBeInTheDocument()
  })

  it('5 entries on one day → 3 chips + "+2", which opens a popover listing all 5', async () => {
    const user = userEvent.setup()
    const entries = [IDS.peter, IDS.ivy, IDS.cindy, IDS.jack, IDS.mint].map((u) => masked(u, '2026-10-14'))
    setup({ data: calendarData(OCT_FROM, OCT_TO, entries) })
    const cell = day('2026-10-14')
    expect(within(cell).getAllByText((_, el) => el?.getAttribute('data-chip') === 'masked')).toHaveLength(3)
    const moreBtn = within(cell).getByRole('button', { name: th.calendar.moreLabel(2) })
    expect(moreBtn).toHaveTextContent(th.calendar.more(2))
    await user.click(moreBtn)
    const pop = await screen.findByRole('dialog')
    expect(within(pop).getAllByText((_, el) => el?.getAttribute('data-chip') === 'masked')).toHaveLength(5)
    expect(within(pop).getByText(th.calendar.leaveOf('Jack', th.masking.leave))).toBeInTheDocument()
  })

  it('never colour alone: every chip has visible text, every holiday cell has its name', () => {
    setup({
      data: calendarData(
        OCT_FROM,
        OCT_TO,
        [full(IDS.peter, '2026-10-07'), masked(IDS.ivy, '2026-10-08', '2026-10-09', 'AM')],
        [
          { date: '2026-10-13', name: 'วันคล้ายวันสวรรคต' },
          { date: '2026-10-23', name: 'วันปิยมหาราช' },
        ],
      ),
    })
    const chips = document.querySelectorAll('[data-chip]')
    expect(chips.length).toBeGreaterThan(0)
    for (const c of chips) expect(c.textContent?.trim()).not.toBe('')
    for (const c of document.querySelectorAll('[data-holiday]'))
      expect(c.textContent).toContain(th.calendar.holidayPrefix)
  })
})

describe('MonthGrid selection (FR-908)', () => {
  it('pointer down on 10-05, enter 10-06, up → onSelectRange(10-05..10-06); selected cells are aria-selected', () => {
    const { onSelectRange } = setup()
    fireEvent.pointerDown(day('2026-10-05'), { button: 0 })
    fireEvent.pointerEnter(day('2026-10-06'))
    expect(day('2026-10-05')).toHaveAttribute('aria-selected', 'true')
    expect(day('2026-10-06')).toHaveAttribute('aria-selected', 'true')
    expect(day('2026-10-07')).toHaveAttribute('aria-selected', 'false')
    fireEvent.pointerUp(day('2026-10-06'))
    expect(onSelectRange).toHaveBeenCalledExactlyOnceWith({ startDate: '2026-10-05', endDate: '2026-10-06' })
    expect(day('2026-10-05')).toHaveAttribute('aria-selected', 'false')
  })

  it('dragging backwards orders the range; a click selects one day', () => {
    const { onSelectRange } = setup()
    fireEvent.pointerDown(day('2026-10-09'), { button: 0 })
    fireEvent.pointerEnter(day('2026-10-07'))
    fireEvent.pointerUp(day('2026-10-07'))
    expect(onSelectRange).toHaveBeenLastCalledWith({ startDate: '2026-10-07', endDate: '2026-10-09' })
    fireEvent.pointerDown(day('2026-10-08'), { button: 0 })
    fireEvent.pointerUp(day('2026-10-08'))
    expect(onSelectRange).toHaveBeenLastCalledWith({ startDate: '2026-10-08', endDate: '2026-10-08' })
  })

  it('pointer down on a chip does not start a selection', () => {
    const { onSelectRange } = setup({
      data: calendarData(OCT_FROM, OCT_TO, [masked(IDS.ivy, '2026-10-05')]),
    })
    const chip = within(day('2026-10-05')).getByText(th.calendar.leaveOf('Ivy', th.masking.leave))
    fireEvent.pointerDown(chip, { button: 0 })
    fireEvent.pointerUp(chip)
    expect(onSelectRange).not.toHaveBeenCalled()
    expect(day('2026-10-05')).toHaveAttribute('aria-selected', 'false')
  })

  it('a drag released outside the grid is cancelled', () => {
    const { onSelectRange } = setup()
    fireEvent.pointerDown(day('2026-10-05'), { button: 0 })
    fireEvent.pointerUp(window)
    expect(onSelectRange).not.toHaveBeenCalled()
    expect(day('2026-10-05')).toHaveAttribute('aria-selected', 'false')
  })

  it('roving focus: one tab stop (today, else the 1st), arrows move ±1 / ±7 days', async () => {
    const user = userEvent.setup()
    setup({ today: '2026-10-07' })
    expect(day('2026-10-07')).toHaveAttribute('tabindex', '0')
    expect(day('2026-10-08')).toHaveAttribute('tabindex', '-1')
    await user.tab()
    expect(day('2026-10-07')).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(day('2026-10-08')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(day('2026-10-15')).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowLeft}')
    expect(day('2026-10-07')).toHaveFocus()
    expect(day('2026-10-07')).toHaveAttribute('tabindex', '0')
  })

  it('today outside the shown month: the 1st of the month is the tab stop', () => {
    setup({ today: '2026-09-30' })
    expect(day('2026-10-01')).toHaveAttribute('tabindex', '0')
    expect(day('2026-09-30')).toHaveAttribute('tabindex', '-1')
  })

  it('focus 10-26 + Shift+ArrowRight + Enter → { 10-26, 10-27 }; Escape clears a selection', async () => {
    const user = userEvent.setup()
    const { onSelectRange } = setup()
    day('2026-10-26').focus()
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(day('2026-10-27')).toHaveFocus()
    expect(day('2026-10-26')).toHaveAttribute('aria-selected', 'true')
    expect(day('2026-10-27')).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(onSelectRange).toHaveBeenCalledExactlyOnceWith({ startDate: '2026-10-26', endDate: '2026-10-27' })

    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(day('2026-10-26')).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Escape}')
    expect(day('2026-10-26')).toHaveAttribute('aria-selected', 'false')
    await user.keyboard(' ')
    expect(onSelectRange).toHaveBeenLastCalledWith({ startDate: '2026-10-26', endDate: '2026-10-26' })
  })

  it('keys are matched by e.code (Thai layout): Shift+ArrowRight then Enter by code', () => {
    const { onSelectRange } = setup()
    const start = day('2026-10-12')
    act(() => start.focus())
    fireEvent.keyDown(start, { code: 'ArrowRight', key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(day('2026-10-13'), { code: 'NumpadEnter', key: 'Enter' })
    expect(onSelectRange).toHaveBeenCalledWith({ startDate: '2026-10-12', endDate: '2026-10-13' })
  })

  it('moving past the grid edge asks for the next month', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn<(m: string) => void>()
    setup({ onMonthChange })
    day('2026-11-08').focus()
    await user.keyboard('{ArrowRight}')
    expect(onMonthChange).toHaveBeenCalledWith('2026-11')
  })

  it('Enter on a chip opens the entry, not a selection', async () => {
    const user = userEvent.setup()
    const mine = full(IDS.peter, '2026-10-07')
    const { onSelectRange, onOpenEntry } = setup({
      today: '2026-10-07',
      data: calendarData(OCT_FROM, OCT_TO, [mine, full(IDS.peter, '2026-10-08')]),
    })
    expect(within(day('2026-10-08')).getByRole('button')).toHaveAttribute('tabindex', '-1')
    await user.tab() // today's cell
    await user.tab() // its chip (tabbable only in the focused day)
    expect(within(day('2026-10-07')).getByRole('button')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onOpenEntry).toHaveBeenCalledWith(mine, expect.any(Function))
    expect(onSelectRange).not.toHaveBeenCalled()
    // The return-focus target is the chip's day cell, which survives the chip (SPEC §8.9).
    expect(onOpenEntry.mock.calls[0]![1]()).toBe(day('2026-10-07'))
  })

  it('a chip opened from the "+N" popover also returns focus to its day cell', async () => {
    const user = userEvent.setup()
    const entries = [IDS.peter, IDS.ivy, IDS.cindy, IDS.jack].map((u) => full(u, '2026-10-14'))
    const { onOpenEntry } = setup({ data: calendarData(OCT_FROM, OCT_TO, entries) })
    await user.click(within(day('2026-10-14')).getByRole('button', { name: th.calendar.moreLabel(1) }))
    const pop = await screen.findByRole('dialog')
    await user.click(within(pop).getAllByRole('button')[3]!)
    expect(onOpenEntry).toHaveBeenCalledWith(entries[3], expect.any(Function))
    expect(onOpenEntry.mock.calls[0]![1]()).toBe(day('2026-10-14'))
  })
})

describe('M8 ◆ on the calendar (FR-907, X24, M8-D16)', () => {
  const POS = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'
  const uat = {
    id: '00000000-0000-4000-8000-000000000702',
    projectId: POS,
    projectName: 'POS Upgrade',
    projectColor: '#2F5597',
    name: 'UAT sign-off',
    date: '2026-10-02',
    status: 'DUE_SOON' as const,
    late: false,
  }
  const withMilestones = (timeOff: CalendarResponse['timeOff'] = [], late = false) => ({
    ...calendarData(OCT_FROM, OCT_TO, timeOff),
    milestones: [{ ...uat, late }],
  })

  it('day-2026-10-02 shows "◆ UAT sign-off · POS Upgrade" as a link to the POS overview + hidden status text', () => {
    setup({ data: withMilestones() })
    const cell = within(day('2026-10-02'))
    expect(cell.getByText('◆ UAT sign-off · POS Upgrade')).toBeInTheDocument()
    const link = cell.getByRole('link', {
      name: th.milestones.calendar.chipLabel('UAT sign-off', 'POS Upgrade', th.milestones.status.DUE_SOON),
    })
    expect(link).toHaveAttribute('href', `/projects/${POS}/overview`)
    expect(cell.getByText(th.milestones.status.DUE_SOON)).toBeInTheDocument()
    expect(day('2026-10-02').getAttribute('aria-label')).toContain('UAT sign-off')
  })

  it('late → the ⚠ text เลย milestone', () => {
    setup({ data: withMilestones([], true) })
    expect(within(day('2026-10-02')).getByText(th.milestones.late)).toBeInTheDocument()
  })

  it('1 milestone + 3 leave entries → 3 chips + "+1"; the popover lists the milestone too', async () => {
    const user = userEvent.setup()
    const leave = [IDS.ivy, IDS.cindy, IDS.jack].map((u) => masked(u, '2026-10-02'))
    setup({ data: withMilestones(leave) })
    const cell = day('2026-10-02')
    expect(cell.querySelectorAll('[data-chip]')).toHaveLength(3)
    expect(cell.querySelector('[data-chip]')).toHaveAttribute('data-chip', 'milestone')
    await user.click(within(cell).getByRole('button', { name: th.calendar.moreLabel(1) }))
    const pop = screen.getByRole('dialog')
    expect(within(pop).getByText('◆ UAT sign-off · POS Upgrade')).toBeInTheDocument()
    expect(within(pop).getAllByText(/· ลา$/)).toHaveLength(3)
  })

  it('pointer-down on a milestone chip never starts a selection', () => {
    const { onSelectRange } = setup({ data: withMilestones() })
    const chip = within(day('2026-10-02')).getByRole('link')
    fireEvent.pointerDown(chip, { button: 0 })
    fireEvent.pointerEnter(day('2026-10-03'))
    fireEvent.pointerUp(day('2026-10-03'))
    expect(onSelectRange).not.toHaveBeenCalled()
  })
})
