// Row reorder in the grid (S3.6; FR-815, AC-809, BR-105, M7.1-D16–D18): drag ⠿ from row 3 to the top → M3's moveTask
// with { parentId: null, afterId: null } and the grid order patched at once; Esc cancels; Alt+↑ on a selected task row
// moves it up; an archived project has no ⠿ and Alt+↑ does nothing.
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { HEADER_TOTAL_H, ROW_H } from '@/lib/grid/columns'
import { gridResponse, POS_PEOPLE, POS_TASKS } from '@/lib/grid/fixtures.test.data'
import { resetVersions } from '@/lib/grid/versions'
import type { GridChunk } from '@/lib/query-keys'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { PlanGrid } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({ fetchGridChunk: vi.fn(), getJson: vi.fn(), moveTask: vi.fn() }))
vi.mock('@/lib/grid/fetch', () => ({ fetchGridChunk: m.fetchGridChunk, gridChunkUrl: vi.fn() }))
vi.mock('@/server/actions/allocations', () => ({ saveAllocations: vi.fn(), planAssignmentRange: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
// M8: PlanGrid's ◆ code imports useMilestoneMutations (S4), which calls these actions
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
  moveTask: m.moveTask,
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  setTaskStatus: vi.fn(),
  revertTaskStatus: vi.fn(),
  deleteTaskTree: vi.fn(),
  restoreTaskBatch: vi.fn(),
}))
vi.mock('@/server/actions/assignments', () => ({ assign: vi.fn(), unassign: vi.fn(), restoreAssignmentBatch: vi.fn() }))
vi.mock('@/server/actions/task-blockers', () => ({ addTaskBlocker: vi.fn(), removeTaskBlocker: vi.fn() }))
vi.mock('@/server/actions/plan-markers', () => ({
  createPlanMarker: vi.fn(),
  updatePlanMarker: vi.fn(),
  deletePlanMarker: vi.fn(),
  restorePlanMarkerBatch: vi.fn(),
}))

/** The task list in the grid's order (positions a0 < a1 < a2). */
function tasksResponse() {
  const r = projectTasksResponse()
  const order = ['t-pos', 't-uat', 't-rollout']
  return { ...r, tasks: r.tasks.map((t) => ({ ...t, position: `a${order.indexOf(t.id)}` })) }
}

beforeEach(() => {
  resetVersions()
  stubViewport()
  stubScrollTo()
  m.moveTask.mockReset()
  m.moveTask.mockImplementation(() => new Promise(() => {}))
  m.fetchGridChunk.mockImplementation((_c: unknown, chunk: GridChunk) =>
    Promise.resolve(gridResponse({ from: chunk.from, tasks: POS_TASKS, people: POS_PEOPLE })),
  )
  m.getJson.mockImplementation((url: string) =>
    Promise.resolve(url.endsWith('/plan-markers') ? { markers: [] } : tasksResponse()),
  )
})

function renderPos(archived = false) {
  return renderGrid(
    <PlanGrid
      context={{ kind: 'project', id: PID }}
      projectName="POS Upgrade"
      archived={archived}
      canEdit={!archived}
      onOpenTask={vi.fn()}
    />,
  )
}

const keys = () =>
  [...document.querySelectorAll('[data-row-header]')].map((e) => e.getAttribute('data-row-key'))
const handleOf = (rowKey: string) =>
  document.querySelector<HTMLElement>(`[data-row-header][data-row-key="${rowKey}"] [data-drag-handle]`)
/** client y of the middle of view row i (jsdom: the scroller sits at 0 and is not scrolled) */
const yOf = (i: number) => HEADER_TOTAL_H + i * ROW_H + ROW_H / 2

describe('useRowDrag (FR-815, M7.1-D16)', () => {
  it('drag "Rollout สาขา" (row 3) to the top → moveTask(parentId null, afterId null) and the grid order at once', async () => {
    renderPos()
    await waitFor(() => expect(handleOf('a:a-mix-rollout')).not.toBeNull())
    const handle = handleOf('a:a-mix-rollout')!
    expect(handle).toHaveAccessibleName(th.grid.reorder.handle)
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 20, clientY: yOf(2), pointerType: 'mouse' })
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 20, clientY: yOf(0) - 8 })
    const indicator = await screen.findByTestId('drop-indicator')
    expect(indicator).toHaveAttribute('data-index', '0')
    expect(indicator).toHaveAttribute('data-valid', 'true')
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 20, clientY: yOf(0) - 8 })
    await waitFor(() =>
      expect(m.moveTask).toHaveBeenCalledWith({ taskId: 't-rollout', parentId: null, afterId: null }),
    )
    expect(screen.queryByTestId('drop-indicator')).toBeNull()
    await waitFor(() => expect(keys()).toEqual(['a:a-mix-rollout', 'a:a-cindy-pos', 'a:a-ivy-uat']))
  })

  it('Esc cancels the drag: no move, no indicator', async () => {
    renderPos()
    await waitFor(() => expect(handleOf('a:a-mix-rollout')).not.toBeNull())
    fireEvent.pointerDown(handleOf('a:a-mix-rollout')!, { button: 0, pointerId: 3, clientX: 20, clientY: yOf(2) })
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 20, clientY: yOf(0) - 8 })
    await screen.findByTestId('drop-indicator')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('drop-indicator')).toBeNull()
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 20, clientY: yOf(0) - 8 })
    expect(m.moveTask).not.toHaveBeenCalled()
    expect(keys()).toEqual(['a:a-cindy-pos', 'a:a-ivy-uat', 'a:a-mix-rollout'])
  })

  it('Alt+↑ on the selected "ทำ UAT" row moves it above "ปรับปรุงระบบ POS" (X49: by e.code)', async () => {
    const user = userEvent.setup()
    renderPos()
    await waitFor(() => expect(handleOf('a:a-ivy-uat')).not.toBeNull())
    await user.click(screen.getByText('ทำ UAT + คู่มือหน้าร้าน'))
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    await waitFor(() => expect(m.moveTask).toHaveBeenCalledWith({ taskId: 't-uat', parentId: null, afterId: null }))
    await waitFor(() => expect(keys()).toEqual(['a:a-ivy-uat', 'a:a-cindy-pos', 'a:a-mix-rollout']))
  })

  it('archived: no ⠿ and Alt+↑ does nothing', async () => {
    const user = userEvent.setup()
    renderPos(true)
    await waitFor(() => expect(keys()).toHaveLength(3))
    expect(document.querySelector('[data-drag-handle]')).toBeNull()
    await user.click(screen.getByText('ทำ UAT + คู่มือหน้าร้าน'))
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(m.moveTask).not.toHaveBeenCalled()
  })
})
