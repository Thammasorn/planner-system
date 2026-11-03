// v3.9 (FR-823, owner feedback): inline rename in the plan grid + a plain click opens the task panel.
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gridResponse, POS_PEOPLE, POS_TASKS } from '@/lib/grid/fixtures.test.data'
import type { GridChunk } from '@/lib/query-keys'
import { resetVersions } from '@/lib/grid/versions'
import { ok } from '@/components/tasks/render.test.helper'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { deleteTaskTree, restoreTaskBatch, updateTask } from '@/server/actions/tasks'

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
const header = (key: string) =>
  document.querySelector<HTMLElement>(`[data-row-header][data-row-key="${key}"]`)!

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
  vi.mocked(deleteTaskTree).mockReset()
  vi.mocked(restoreTaskBatch).mockReset()
  vi.mocked(updateTask).mockReset()
  vi.mocked(updateTask).mockImplementation(() => ok({}) as never)
})

const nameOf = (k: string) => header(k).querySelector<HTMLElement>('[data-task-name]')

describe('plan grid inline rename (v3.9, FR-823)', () => {
  it('a plain click selects the row and opens the panel; Cmd+click only selects', async () => {
    const onOpenTask = vi.fn()
    const user = userEvent.setup()
    renderPos({ onOpenTask })
    await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    await user.click(nameOf('a:a-ivy-uat')!)
    expect(onOpenTask).toHaveBeenCalledWith('t-uat')
    expect(header('a:a-ivy-uat')).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Meta>}')
    await user.click(nameOf('a:a-cindy-pos')!)
    await user.keyboard('{/Meta}')
    expect(onOpenTask).toHaveBeenCalledTimes(1)
  })

  it('double-click → input; Enter saves through updateTask, the grid shows it; Cmd+Z sends the old name', async () => {
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    await user.dblClick(nameOf('a:a-ivy-uat')!)
    const input = screen.getByTestId<HTMLInputElement>('grid-rename-input')
    expect(input).toHaveFocus()
    expect(input.value).toBe('ทำ UAT + คู่มือหน้าร้าน')
    let resolve: () => void = () => {}
    vi.mocked(updateTask).mockImplementationOnce(
      () => new Promise((r) => (resolve = () => r({ ok: true } as never))),
    )
    await user.clear(input)
    await user.type(input, '  UAT รอบ 2  {Enter}')
    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({ taskId: 't-uat', patch: { name: 'UAT รอบ 2' } }),
    )
    // optimistic: the grid shows the new name before the server answers
    expect(nameOf('a:a-ivy-uat')).toHaveTextContent('UAT รอบ 2')
    expect(header('a:a-ivy-uat')).toHaveFocus()
    m.fetchGridChunk.mockImplementation((_ctx: unknown, chunk: GridChunk) =>
      Promise.resolve(
        gridResponse({
          from: chunk.from,
          tasks: POS_TASKS.map((t) => (t.id === 't-uat' ? { ...t, name: 'UAT รอบ 2' } : t)),
          people: POS_PEOPLE,
        }),
      ),
    )
    resolve()
    await waitFor(() => expect(nameOf('a:a-ivy-uat')).toHaveTextContent('UAT รอบ 2'))
    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() =>
      expect(updateTask).toHaveBeenLastCalledWith({
        taskId: 't-uat',
        patch: { name: 'ทำ UAT + คู่มือหน้าร้าน' },
      }),
    )
  })

  it('F2 / typing on the selected row header start the rename; Esc, empty or unchanged save nothing', async () => {
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    fireEvent.click(nameOf('a:a-ivy-uat')!)
    header('a:a-ivy-uat').focus()
    await user.keyboard('ก')
    expect(screen.getByTestId<HTMLInputElement>('grid-rename-input').value).toBe('ก')
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('grid-rename-input')).toBeNull()
    expect(header('a:a-ivy-uat')).toHaveFocus()
    expect(header('a:a-ivy-uat')).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{F2}')
    const input = screen.getByTestId<HTMLInputElement>('grid-rename-input')
    await user.clear(input)
    await user.keyboard('{Enter}')
    await user.keyboard('{F2}{Enter}')
    expect(updateTask).not.toHaveBeenCalled()
    expect(nameOf('a:a-ivy-uat')).toHaveTextContent('ทำ UAT + คู่มือหน้าร้าน')
  })

  it('read-only (archived): double-click and Enter never show the input', async () => {
    const user = userEvent.setup()
    renderPos({ archived: true })
    await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    await user.dblClick(nameOf('a:a-ivy-uat')!)
    header('a:a-ivy-uat').focus()
    await user.keyboard('{F2}x')
    expect(screen.queryByTestId('grid-rename-input')).toBeNull()
  })

  it('Esc after a plain click clears the row and bubbles (so the open panel closes in the same keystroke)', async () => {
    renderPos()
    await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    fireEvent.click(nameOf('a:a-ivy-uat')!)
    expect(header('a:a-ivy-uat')).toHaveAttribute('aria-selected', 'true')
    const notPrevented = fireEvent.keyDown(header('a:a-ivy-uat'), { key: 'Escape', code: 'Escape' })
    expect(notPrevented).toBe(true)
    expect(header('a:a-ivy-uat')).toHaveAttribute('aria-selected', 'false')
  })
})
