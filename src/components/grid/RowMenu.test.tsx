// v3.8 (FR-6xx grid row menu): the row-header menu and the task-row multi-select delete of the plan grid.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { gridResponse, POS_PEOPLE, POS_TASKS } from '@/lib/grid/fixtures.test.data'
import type { GridChunk } from '@/lib/query-keys'
import { resetVersions } from '@/lib/grid/versions'
import { ok } from '@/components/tasks/render.test.helper'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { deleteTaskTree, restoreTaskBatch } from '@/server/actions/tasks'
import { unassign } from '@/server/actions/assignments'
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
})

const itemIds = () =>
  within(screen.getByRole('menu', { name: th.tasks.rowMenu.label }))
    .getAllByRole('menuitem')
    .map((x) => x.dataset.testid)

describe('plan grid row menu (v3.8)', () => {
  it('right click on a row header opens the row menu (not the browser menu) with all items', async () => {
    const onOpenTask = vi.fn()
    renderPos({ onOpenTask })
    await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    const ev = fireEvent.contextMenu(header('a:a-ivy-uat'), { clientX: 40, clientY: 50 })
    expect(ev).toBe(false) // preventDefault: no browser menu
    expect(itemIds()).toEqual([
      'row-menu-open',
      'row-menu-openPage',
      'row-menu-addSubtask',
      'row-menu-delete',
      'row-menu-unassign',
    ])
    expect(screen.getByTestId('row-menu-unassign')).toHaveTextContent(th.grid.row.menuUnassign('Ivy'))
    expect(screen.getByTestId('row-menu-openPage')).toHaveAttribute('href', '/t/t-uat')
    expect(header('a:a-ivy-uat')).toHaveAttribute('aria-selected', 'true')
    await userEvent.setup().click(screen.getByTestId('row-menu-open'))
    expect(onOpenTask).toHaveBeenCalledWith('t-uat')
  })

  it('Shift+F10 on a focused row header opens the row menu; on a cell it stays the cell menu', async () => {
    const user = userEvent.setup()
    renderPos()
    const cell = await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    await user.click(cell)
    fireEvent.keyDown(cell, { code: 'F10', key: 'F10', shiftKey: true })
    expect(await screen.findByTestId('cell-menu-collapseToWeek')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('cell-menu-collapseToWeek')).not.toBeInTheDocument())
    await user.click(within(header('a:a-ivy-uat')).getByText('ทำ UAT + คู่มือหน้าร้าน'))
    expect(header('a:a-ivy-uat')).toHaveFocus()
    fireEvent.keyDown(header('a:a-ivy-uat'), { code: 'F10', key: 'F10', shiftKey: true })
    expect(await screen.findByTestId('row-menu-delete')).toBeInTheDocument()
  })

  it('the ⋯ button opens the same menu', async () => {
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    await user.click(within(header('a:a-ivy-uat')).getByRole('button', { name: /^เมนูของ / }))
    expect(itemIds()).toContain('row-menu-delete')
  })

  it('archived / read-only: only the open items', async () => {
    renderPos({ archived: true })
    await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    fireEvent.contextMenu(header('a:a-ivy-uat'), { clientX: 40, clientY: 50 })
    expect(itemIds()).toEqual(['row-menu-open', 'row-menu-openPage'])
  })

  it('unassign from the menu uses the existing unassign', async () => {
    vi.mocked(unassign).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    fireEvent.contextMenu(header('a:a-ivy-uat'), { clientX: 40, clientY: 50 })
    await user.click(screen.getByTestId('row-menu-unassign'))
    await waitFor(() => expect(unassign).toHaveBeenCalled())
  })
})

describe('plan grid task-row multi-select delete (v3.8)', () => {
  it('Cmd+click and Shift+click select task rows (✓ + aria-selected); Delete → toast → undo restores', async () => {
    vi.mocked(deleteTaskTree).mockImplementation((v: { taskIds: string[] }) =>
      ok({
        projectId: PID,
        batch: '11111111-1111-4111-8111-111111111111',
        rootIds: v.taskIds,
        deletedIds: v.taskIds,
        transfer: null,
      }),
    )
    vi.mocked(restoreTaskBatch).mockImplementation(() =>
      ok({ projectId: PID, restoredIds: [], transfer: null }),
    )
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    await user.click(within(header('a:a-cindy-pos')).getByText('ปรับปรุงระบบ POS หน้าร้าน'))
    await user.keyboard('{Meta>}')
    await user.click(within(header('a:a-ivy-uat')).getByText('ทำ UAT + คู่มือหน้าร้าน'))
    await user.keyboard('{/Meta}')
    for (const k of ['a:a-cindy-pos', 'a:a-ivy-uat']) {
      expect(header(k)).toHaveAttribute('aria-selected', 'true')
      expect(header(k).querySelector('[data-row-check]')).not.toBeNull()
    }
    // the menu on a selected row offers "ลบ 2 งาน"
    fireEvent.contextMenu(header('a:a-ivy-uat'), { clientX: 40, clientY: 50 })
    expect(screen.getByTestId('row-menu-delete')).toHaveTextContent(th.grid.row.menuDeleteMany(2))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('row-menu-delete')).not.toBeInTheDocument())

    // Shift+click extends from the anchor to the Rollout row
    await user.keyboard('{Shift>}')
    await user.click(within(header('a:a-mint-rollout')).getByText('Rollout สาขา'))
    await user.keyboard('{/Shift}')
    expect(header('a:a-mint-rollout')).toHaveAttribute('aria-selected', 'true')
    header('a:a-mint-rollout').focus()
    await user.keyboard('{Delete}')
    await waitFor(() => expect(deleteTaskTree).toHaveBeenCalledTimes(1))
    const ids = vi.mocked(deleteTaskTree).mock.calls[0]![0].taskIds
    expect(new Set(ids)).toEqual(new Set(['t-uat', 't-rollout']))
    expect(await screen.findByText(th.tasks.toast.deletedMany(2))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.undo.undo }))
    await waitFor(() =>
      expect(restoreTaskBatch).toHaveBeenCalledWith({ batch: '11111111-1111-4111-8111-111111111111' }),
    )
  })

  it('Esc clears the multi-selection', async () => {
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    await user.click(within(header('a:a-cindy-pos')).getByText('ปรับปรุงระบบ POS หน้าร้าน'))
    await user.keyboard('{Shift>}')
    await user.click(within(header('a:a-ivy-uat')).getByText('ทำ UAT + คู่มือหน้าร้าน'))
    await user.keyboard('{/Shift}{Escape}')
    expect(header('a:a-cindy-pos')).toHaveAttribute('aria-selected', 'false')
    expect(header('a:a-ivy-uat')).toHaveAttribute('aria-selected', 'false')
  })

  it('v3.9 ☐: checkboxes select without opening the panel; the bar counts, ลบ deletes, ยกเลิก clears', async () => {
    vi.mocked(deleteTaskTree).mockImplementation((v: { taskIds: string[] }) =>
      ok({
        projectId: PID,
        batch: '22222222-2222-4222-8222-222222222222',
        rootIds: v.taskIds,
        deletedIds: v.taskIds,
        transfer: null,
      }),
    )
    const onOpenTask = vi.fn()
    const user = userEvent.setup()
    renderPos({ onOpenTask })
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    expect(screen.queryByTestId('grid-selection-bar')).toBeNull()
    const box = (k: string) => header(k).querySelector<HTMLInputElement>('[data-row-checkbox]')!
    await user.click(box('a:a-cindy-pos'))
    expect(screen.getByTestId('grid-selection-bar')).toHaveTextContent(th.grid.row.selBarCount(1))
    expect(box('a:a-ivy-uat')).toHaveAttribute('data-visible', 'true')
    await user.click(box('a:a-ivy-uat'))
    expect(box('a:a-cindy-pos')).toBeChecked()
    expect(box('a:a-ivy-uat')).toBeChecked()
    expect(screen.getByTestId('grid-selection-bar')).toHaveTextContent(th.grid.row.selBarCount(2))
    expect(onOpenTask).not.toHaveBeenCalled()
    await user.click(screen.getByTestId('grid-selection-clear'))
    expect(screen.queryByTestId('grid-selection-bar')).toBeNull()
    expect(box('a:a-cindy-pos')).not.toBeChecked()
    await user.click(box('a:a-ivy-uat'))
    await user.click(screen.getByTestId('grid-selection-delete'))
    await waitFor(() => expect(deleteTaskTree).toHaveBeenCalledWith({ taskIds: ['t-uat'] }))
  })
})
