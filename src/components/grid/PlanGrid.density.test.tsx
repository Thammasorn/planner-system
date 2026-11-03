// v3.8 (FR-822): the [ปกติ | แคบ] week-column density of the plan grid.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gridResponse, POS_PEOPLE, POS_TASKS } from '@/lib/grid/fixtures.test.data'
import type { GridChunk } from '@/lib/query-keys'
import { resetVersions } from '@/lib/grid/versions'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { PlanGrid } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({ fetchGridChunk: vi.fn(), getJson: vi.fn() }))
vi.mock('@/lib/grid/fetch', () => ({ fetchGridChunk: m.fetchGridChunk, gridChunkUrl: vi.fn() }))
vi.mock('@/server/actions/allocations', () => ({ saveAllocations: vi.fn(), planAssignmentRange: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('@/server/actions/milestones', () => ({
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  restoreMilestoneBatch: vi.fn(),
  linkTasksToMilestone: vi.fn(),
  revertTaskMilestones: vi.fn(),
}))
vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  indentTask: vi.fn(),
  outdentTask: vi.fn(),
  moveTask: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  setTaskStatus: vi.fn(),
  revertTaskStatus: vi.fn(),
  deleteTaskTree: vi.fn(),
  restoreTaskBatch: vi.fn(),
}))
vi.mock('@/server/actions/assignments', () => ({
  assign: vi.fn(),
  unassign: vi.fn(),
  restoreAssignmentBatch: vi.fn(),
}))
vi.mock('@/server/actions/task-blockers', () => ({ addTaskBlocker: vi.fn(), removeTaskBlocker: vi.fn() }))

const ctx = { kind: 'project', id: PID } as const

function renderPos(o: { archived?: boolean; onOpenTask?: (id: string) => void } = {}) {
  return renderGrid(
    <PlanGrid
      context={ctx}
      projectName="POS Upgrade"
      archived={o.archived ?? false}
      canEdit={!o.archived}
      onOpenTask={o.onOpenTask ?? vi.fn()}
    />,
  )
}

beforeEach(() => {
  resetVersions()
  stubViewport()
  stubScrollTo()
  m.fetchGridChunk.mockImplementation((_ctx: unknown, chunk: GridChunk) =>
    Promise.resolve(gridResponse({ from: chunk.from, tasks: POS_TASKS, people: POS_PEOPLE })),
  )
  m.getJson.mockImplementation(() => Promise.resolve(projectTasksResponse()))
})

describe('plan grid density (v3.8, FR-822)', () => {
  it('แคบ narrows the week columns to 36 px, shows the day only (full date in the label), drops ".0"', async () => {
    const user = userEvent.setup()
    renderPos()
    const cell = await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    expect(cell.style.width).toBe('52px')
    expect(cell).toHaveTextContent('2.5')
    const header = document.querySelector<HTMLElement>('[role="columnheader"][data-week="2026-09-28"]')!
    expect(header).toHaveTextContent('28/9')
    expect(screen.getByTestId('density-normal')).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByTestId('density-compact'))
    expect(screen.getByTestId('density-compact')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() =>
      expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-28').style.width).toBe('36px'),
    )
    const h = document.querySelector<HTMLElement>('[role="columnheader"][data-week="2026-09-28"]')!
    expect(h.textContent).toMatch(/^28/)
    expect(h.textContent).not.toContain('28/9')
    expect(h).toHaveAttribute('title', '28/9')
    expect(h.getAttribute('aria-label')).toContain('28/9')
    // 5.0 → "5" (2.5 stays), the accessible name keeps the full value
    const five = screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-07')
    expect(five).toHaveTextContent(/^5$/)
    expect(five.getAttribute('aria-label')).toContain('5.0')
    expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-28')).toHaveTextContent('2.5')
    expect(document.querySelector('[data-density]')).toHaveAttribute('data-density', 'COMPACT')
  })
})
