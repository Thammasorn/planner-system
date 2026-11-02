import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PID, response, T } from '@/components/tasks/fixtures.test.data'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { th } from '@/i18n/th'
import { PreferencesContext } from '@/hooks/usePreferences'
import { DEFAULT_PREFERENCES } from '@/lib/schemas/preferences'
import { PlanView } from './PlanView'

type GridProps = { onOpenTask(id: string): void; projectName: string; toolbarStart?: ReactNode }
const g = vi.hoisted(() => ({
  props: null as null | GridProps,
  mounts: 0,
}))
vi.mock('@/components/grid/PlanGrid', async () => {
  const { useEffect } = await import('react')
  return {
    PlanGrid: (p: GridProps) => {
      g.props = p
      useEffect(() => {
        g.mounts++
      }, [])
      // FR-810: the view switch is the first item of the grid's toolbar (toolbarStart)
      return (
        <div data-testid="plan-grid">
          <div role="toolbar" aria-label={th.grid.toolbar.label}>
            {p.toolbarStart}
          </div>
          {p.projectName}
        </div>
      )
    },
  }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/tasks', () => ({}))
vi.mock('@/server/actions/assignments', () => ({}))
vi.mock('@/server/actions/task-blockers', () => ({}))
vi.mock('@/server/actions/allocations', () => ({ planAssignmentRange: vi.fn(), saveAllocations: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

beforeEach(() => window.history.replaceState(null, '', `/projects/${PID}/plan`))

describe('PlanView (FR-408, M6-D18)', () => {
  it('renders the grid; ?task=<id> shows the M3 task panel beside it and ✕ removes the param', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', `/projects/${PID}/plan?task=${T.c}`)
    renderTasks(<PlanView projectId={PID} projectName="POS Upgrade" archived={false} canEdit />, {
      data: response(),
    })
    expect(screen.getByTestId('plan-grid')).toHaveTextContent('POS Upgrade')
    expect(await screen.findByRole('complementary', { name: th.tasks.panel.label })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.tasks.panel.close }))
    expect(new URLSearchParams(window.location.search).get('task')).toBeNull()
    expect(screen.queryByRole('complementary', { name: th.tasks.panel.label })).toBeNull()
  })

  it('onOpenTask from the grid opens the panel through ?task=', async () => {
    renderTasks(<PlanView projectId={PID} projectName="POS Upgrade" archived={false} canEdit />, {
      data: response(),
    })
    expect(screen.queryByRole('complementary')).toBeNull()
    act(() => g.props!.onOpenTask(T.c))
    expect(new URLSearchParams(window.location.search).get('task')).toBe(T.c)
    expect(await screen.findByRole('complementary', { name: th.tasks.panel.label })).toBeInTheDocument()
  })

  it('FR-810: [แผนงาน | ปฏิทิน] switches to the calendar, writes ?view=calendar (keeping ?task=) and plan.view', async () => {
    const user = userEvent.setup()
    const setPreference = vi.fn()
    g.mounts = 0
    window.history.replaceState(null, '', `/projects/${PID}/plan?task=${T.c}`)
    renderTasks(
      <PreferencesContext value={{ prefs: DEFAULT_PREFERENCES, setPreference }}>
        <PlanView projectId={PID} projectName="POS Upgrade" archived={false} canEdit />
      </PreferencesContext>,
      { data: response() },
    )
    const gridToolbar = screen.getByRole('toolbar', { name: th.grid.toolbar.label })
    const group = within(gridToolbar).getByRole('group', { name: th.planView.label })
    expect(gridToolbar.firstElementChild).toBe(group)
    expect(screen.getByRole('button', { name: th.planView.grid })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: th.planView.calendar }))
    const q = new URLSearchParams(window.location.search)
    expect(q.get('view')).toBe('calendar')
    expect(q.get('task')).toBe(T.c)
    expect(setPreference).toHaveBeenCalledWith('plan.view', 'CALENDAR')
    expect(screen.getByTestId('plan-calendar')).toBeInTheDocument()
    // the grid stays mounted but hidden (its switch with it); the visible switch is the calendar toolbar's
    expect(screen.getByTestId('plan-grid-slot')).not.toBeVisible()
    expect(group).not.toBeVisible()
    expect(
      within(screen.getByRole('toolbar', { name: th.planCalendar.toolbar })).getByRole('group', {
        name: th.planView.label,
      }),
    ).toBeInTheDocument()
    // the task panel stays beside the calendar
    expect(await screen.findByRole('complementary', { name: th.tasks.panel.label })).toBeInTheDocument()
    // back to the grid: same instance (never re-mounted)
    await user.click(screen.getByRole('button', { name: th.planView.grid }))
    expect(new URLSearchParams(window.location.search).get('view')).toBe('grid')
    expect(setPreference).toHaveBeenLastCalledWith('plan.view', 'GRID')
    expect(screen.getByTestId('plan-grid-slot')).toBeVisible()
    expect(screen.queryByTestId('plan-calendar')).toBeNull()
    expect(g.mounts).toBe(1)
  })

  it('initialView CALENDAR (from ?view= or plan.view) renders the calendar and mounts no grid until switched', async () => {
    const user = userEvent.setup()
    g.mounts = 0
    renderTasks(
      <PlanView projectId={PID} projectName="POS Upgrade" archived={false} canEdit initialView="CALENDAR" />,
      { data: response() },
    )
    expect(screen.getByTestId('plan-calendar')).toBeInTheDocument()
    expect(screen.queryByTestId('plan-grid')).toBeNull()
    expect(screen.getByRole('button', { name: th.planView.calendar })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: th.planView.grid }))
    expect(screen.getByTestId('plan-grid')).toBeInTheDocument()
    expect(g.mounts).toBe(1)
  })
})
