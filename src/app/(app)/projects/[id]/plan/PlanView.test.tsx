import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PID, response, T } from '@/components/tasks/fixtures.test.data'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { th } from '@/i18n/th'
import { PlanView } from './PlanView'

const g = vi.hoisted(() => ({ props: null as null | { onOpenTask(id: string): void; projectName: string } }))
vi.mock('@/components/grid/PlanGrid', () => ({
  PlanGrid: (p: { onOpenTask(id: string): void; projectName: string }) => {
    g.props = p
    return <div data-testid="plan-grid">{p.projectName}</div>
  },
}))
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
})
