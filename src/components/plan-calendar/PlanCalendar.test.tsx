import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PID, response, task } from '@/components/tasks/fixtures.test.data'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { th } from '@/i18n/th'
import { monthGrid } from '@/lib/calendar/month-grid'
import type { CalendarResponse } from '@/lib/contracts/calendar'
import type { MilestoneDTO, ProjectMilestonesResponse } from '@/lib/contracts/milestones'
import type { TaskDTO } from '@/lib/contracts/tasks'
import { formatThaiDate, formatThaiDateRange } from '@/lib/format'
import { qk } from '@/lib/query-keys'
import type { QueryClient } from '@tanstack/react-query'
import { PlanCalendar } from './PlanCalendar'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ROLL = id(101)
const POS = id(102)
const UAT = id(103)
const PARENT = id(104)
const CHILD = id(105)
const DONE = id(106)

/** AC-806 shape: "Rollout สาขา" 3–12 พ.ย. 2569 (tentative, Ivy); a no-date parent; UAT with 3 people + body + blocker. */
function tasks(extra: TaskDTO[] = []): TaskDTO[] {
  return [
    task({
      id: ROLL,
      name: 'Rollout สาขา',
      position: 'a0',
      startDate: '2026-11-03',
      dueDate: '2026-11-12',
      certaintyOverride: 'TENTATIVE',
      assignees: [{ assignmentId: id(901), userId: 'ivy' }],
    }),
    task({ id: POS, name: 'ปรับปรุงระบบ POS หน้าร้าน', position: 'a1' }),
    task({
      id: UAT,
      name: 'ทำ UAT + คู่มือหน้าร้าน',
      position: 'a2',
      dueDate: '2026-11-11',
      hasBody: true,
      blockers: { open: 1, total: 1 },
      assignees: [
        { assignmentId: id(902), userId: 'cindy' },
        { assignmentId: id(903), userId: 'ivy' },
        { assignmentId: id(904), userId: 'jack' },
      ],
    }),
    // a parent shows only with its own dates; its children's dates never create a bar for it (FR-812)
    task({ id: PARENT, name: 'งานแม่', position: 'a3', startDate: '2026-11-16', dueDate: '2026-11-17' }),
    task({
      id: CHILD,
      name: 'งานลูก',
      position: 'a0',
      parentId: PARENT,
      depth: 1,
      dueDate: '2026-11-20',
      assignees: [{ assignmentId: id(905), userId: 'jack' }],
    }),
    task({ id: DONE, name: 'งานที่เสร็จ', position: 'a4', dueDate: '2026-11-05', completedOn: '2026-11-05' }),
    ...extra,
  ]
}

function seed(o: { holidays?: CalendarResponse['holidays']; milestones?: MilestoneDTO[] } = {}) {
  return (qc: QueryClient) => {
    const { from, to } = monthGrid('2026-11')
    qc.setQueryData<CalendarResponse>(qk.calendar(from, to), {
      from,
      to,
      holidays: o.holidays ?? [],
      people: {},
      timeOff: [],
      milestones: [],
      viewer: { userId: 'cindy', canEditOthers: false },
    })
    qc.setQueryData<ProjectMilestonesResponse>(qk.projectMilestones(PID), {
      projectId: PID,
      today: '2026-11-04',
      canManage: true,
      milestones: o.milestones ?? [],
    })
  }
}

function renderCalendar(
  o: { extra?: TaskDTO[]; holidays?: CalendarResponse['holidays']; milestones?: MilestoneDTO[]; showCompleted?: boolean } = {},
) {
  const onOpenTask = vi.fn()
  const r = renderTasks(
    <PlanCalendar projectId={PID} projectColor="#2F5597" onOpenTask={onOpenTask} initialMonth="2026-11" />,
    {
      data: response({ tasks: tasks(o.extra) }),
      seed: seed(o),
      ...(o.showCompleted === undefined ? {} : { prefs: { 'tasks.showCompleted': o.showCompleted } }),
    },
  )
  return { ...r, onOpenTask }
}

const barsOf = (taskId: string) => [...document.querySelectorAll<HTMLElement>(`[data-task-bar="${taskId}"]`)]

beforeEach(() => nav.push.mockReset())

describe('PlanCalendar (FR-811/812, BR-103, AC-806)', () => {
  it('Thai month + พ.ศ., Monday first, 6 week rows', () => {
    renderCalendar()
    expect(screen.getByTestId('plan-calendar-month')).toHaveTextContent('พฤศจิกายน 2569')
    const grid = screen.getByRole('grid', { name: th.planCalendar.gridLabel('พฤศจิกายน 2569') })
    const headers = within(grid).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(th.calendar.weekdays)
    expect(within(grid).getAllByRole('row')).toHaveLength(7)
    // first column of the first week = Monday 26 ต.ค. 2569
    expect(within(grid).getAllByRole('row')[1]!.querySelector('[role="gridcell"]')).toHaveAttribute(
      'data-date',
      '2026-10-26',
    )
  })

  it('AC-806: "Rollout สาขา · Ivy" ◐ from 3 to 12 พ.ย., split over 2 week rows with ▸ / ◂ at the seam', () => {
    renderCalendar()
    const bars = barsOf(ROLL)
    expect(bars).toHaveLength(2)
    const [a, b] = bars as [HTMLElement, HTMLElement]
    expect(a.closest('[role="gridcell"]')).toHaveAttribute('data-date', '2026-11-03')
    expect(a.style.getPropertyValue('--span')).toBe('6') // Tue 3 → Sun 8
    expect(a).toHaveAttribute('data-cut-right', 'true')
    expect(a).not.toHaveAttribute('data-cut-left')
    expect(a).toHaveAttribute('data-tentative', 'true')
    expect(a).toHaveTextContent('◐')
    expect(a).toHaveTextContent('Rollout สาขา · Ivy')
    expect(a).toHaveTextContent('▸')
    expect(b.closest('[role="gridcell"]')).toHaveAttribute('data-date', '2026-11-09')
    expect(b.style.getPropertyValue('--span')).toBe('4') // Mon 9 → Thu 12
    expect(b).toHaveAttribute('data-cut-left', 'true')
    expect(b).toHaveTextContent('◂')
    const btn = within(a).getByRole('button')
    expect(btn).toHaveAccessibleName(
      [
        'Rollout สาขา · Ivy',
        formatThaiDateRange('2026-11-03', '2026-11-12'),
        th.projects.certainty.TENTATIVE,
        th.planCalendar.continuesRight,
      ].join(', '),
    )
  })

  it('names: 3 people → "Cindy, Ivy +1"; 📄 / ⛔ glyphs; a single date = 1-day bar; parent only with its own dates', () => {
    renderCalendar()
    const [uat] = barsOf(UAT)
    expect(uat).toHaveTextContent('ทำ UAT + คู่มือหน้าร้าน · Cindy, Ivy +1')
    expect(uat!.style.getPropertyValue('--span')).toBe('1')
    expect(uat).toHaveTextContent('📄')
    expect(uat).toHaveTextContent('⛔')
    expect(within(uat!).getByRole('button')).toHaveAccessibleName(
      expect.stringContaining(th.tasks.blockers.badgeWaiting(1)),
    )
    const [parent] = barsOf(PARENT)
    expect(parent!.closest('[role="gridcell"]')).toHaveAttribute('data-date', '2026-11-16')
    expect(parent!.style.getPropertyValue('--span')).toBe('2')
    // the parent's assignees = union of its subtree (BR-31)
    expect(parent).toHaveTextContent('งานแม่ · Jack')
    expect(barsOf(CHILD)[0]).toHaveTextContent('งานลูก · Jack')
  })

  it('no-date list "ไม่มีวันที่ (1)" holds the task without dates; click opens the panel; ↗ links the page', async () => {
    const user = userEvent.setup()
    const { onOpenTask } = renderCalendar()
    const side = screen.getByRole('region', { name: th.planCalendar.noDatesLabel })
    expect(within(side).getByRole('heading')).toHaveTextContent(th.planCalendar.noDates(1))
    await user.click(within(side).getByRole('button', { name: /ปรับปรุงระบบ POS หน้าร้าน/ }))
    expect(onOpenTask).toHaveBeenCalledWith(POS)
    expect(within(side).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute('href', `/t/${POS}`)
  })

  it('click a bar → the panel; Shift+Space on a bar → the task page', async () => {
    const user = userEvent.setup()
    const { onOpenTask } = renderCalendar()
    const btn = within(barsOf(ROLL)[0]!).getByRole('button')
    await user.click(btn)
    expect(onOpenTask).toHaveBeenCalledWith(ROLL)
    btn.focus()
    await user.keyboard('{Shift>} {/Shift}')
    expect(nav.push).toHaveBeenCalledWith(`/t/${ROLL}`)
    expect(onOpenTask).toHaveBeenCalledTimes(1)
  })

  it('completed tasks: strike-through when shown; hidden by the shared "แสดงงานที่เสร็จแล้ว" switch', async () => {
    const user = userEvent.setup()
    renderCalendar()
    expect(barsOf(DONE)[0]).toHaveAttribute('data-done', 'true')
    expect(within(barsOf(DONE)[0]!).getByRole('button')).toHaveAccessibleName(
      expect.stringContaining(th.planCalendar.done),
    )
    await user.click(screen.getByRole('checkbox', { name: th.grid.toolbar.showCompleted }))
    expect(barsOf(DONE)).toHaveLength(0)
  })

  it('more than 3 lanes → "+N" on the day → popover with every task of that day', async () => {
    const user = userEvent.setup()
    const extra = [1, 2, 3].map((n) =>
      task({ id: id(200 + n), name: `เพิ่ม ${n}`, position: `b${n}`, dueDate: '2026-11-11' }),
    )
    renderCalendar({ extra })
    const cell = screen.getByTestId('plan-day-2026-11-11')
    // Rollout (lane 0) + UAT + 3 extra on 11 พ.ย. = 5 tasks → 3 lanes + "+2"
    const more = within(cell).getByRole('button', { name: th.planCalendar.moreLabel(2) })
    expect(more).toHaveTextContent('+2')
    await user.click(more)
    const dialog = await screen.findByRole('dialog', { name: th.planCalendar.dayTasks(formatThaiDate('2026-11-11')) })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(5)
    expect(within(dialog).getAllByRole('link', { name: th.tasks.openAsPage })).toHaveLength(5)
  })

  it('holidays: shaded cell with the name in its label + tooltip; today ring; milestone ◆ flags on their date (M11.1)', () => {
    renderCalendar({
      holidays: [{ date: '2026-11-23', name: 'วันลอยกระทง' }],
      milestones: [
        {
          id: id(301),
          projectId: PID,
          name: 'UAT sign-off',
          date: '2026-11-13',
          description: null,
          completedOn: null,
          color: 'RED',
          status: 'UPCOMING',
          late: false,
          lateTaskCount: 0,
          progress: { done: 0, total: 0 },
        },
      ],
    })
    const hol = screen.getByTestId('plan-day-2026-11-23')
    expect(hol).toHaveAttribute('data-holiday', 'true')
    expect(hol).toHaveAttribute('title', th.planCalendar.holiday('วันลอยกระทง'))
    expect(hol.getAttribute('aria-label')).toContain(th.planCalendar.holiday('วันลอยกระทง'))
    const flagDay = screen.getByTestId('plan-day-2026-11-13')
    const flag = flagDay.querySelector('[data-milestone]')!
    expect(flag).toHaveAttribute('data-color', 'RED')
    expect(flag).toHaveTextContent('UAT sign-off')
    expect(flag).toHaveTextContent(th.milestones.diamond)
    expect(flag).toHaveTextContent(th.milestones.color.named(th.milestones.color.name.RED))
  })

  it('keyboard: arrows move day focus, bars of the focused day join the tab order, PageDown/‹ › change month', async () => {
    const user = userEvent.setup()
    renderCalendar()
    const first = screen.getByTestId('plan-day-2026-11-01')
    expect(first).toHaveAttribute('tabindex', '0')
    act(() => first.focus())
    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('plan-day-2026-11-02')).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    const nov3 = screen.getByTestId('plan-day-2026-11-03')
    expect(nov3).toHaveFocus()
    expect(within(barsOf(ROLL)[0]!).getByRole('button')).toHaveAttribute('tabindex', '0')
    expect(within(barsOf(UAT)[0]!).getByRole('button')).toHaveAttribute('tabindex', '-1')
    // Enter on a day with tasks → its task list
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: th.planCalendar.dayTasks(formatThaiDate('2026-11-03')) })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    await user.keyboard('{Escape}')
    act(() => nov3.focus())
    fireEvent.keyDown(nov3, { code: 'PageDown', key: 'PageDown' })
    expect(screen.getByTestId('plan-calendar-month')).toHaveTextContent('ธันวาคม 2569')
    expect(screen.getByTestId('plan-day-2026-12-03')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: th.planCalendar.prev }))
    expect(screen.getByTestId('plan-calendar-month')).toHaveTextContent('พฤศจิกายน 2569')
    await user.click(screen.getByRole('button', { name: th.planCalendar.today }))
    expect(screen.getByTestId('plan-calendar-month')).toHaveTextContent('กันยายน 2569')
  })

  it('the toolbar renders the caller-provided view switch first', () => {
    renderTasks(
      <PlanCalendar
        projectId={PID}
        projectColor="#2F5597"
        onOpenTask={vi.fn()}
        initialMonth="2026-11"
        toolbarStart={<button type="button">switch</button>}
      />,
      { data: response({ tasks: tasks() }), seed: seed() },
    )
    const bar = screen.getByRole('toolbar', { name: th.planCalendar.toolbar })
    expect(within(bar).getAllByRole('button')[0]).toHaveTextContent('switch')
  })
})
