import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { FOOTER_ROWS, HEADER_ROWS, periodColIndex, totalColIndex } from '@/lib/grid/columns'
import { gridResponse, POS_PEOPLE, POS_TASKS, type FxTask } from '@/lib/grid/fixtures.test.data'
import type { GridChunk } from '@/lib/query-keys'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { deleteTaskTree } from '@/server/actions/tasks'
import { assign, unassign } from '@/server/actions/assignments'
import { resetVersions } from '@/lib/grid/versions'
import { resetScrollMemory } from '@/lib/nav/scroll-memory'
import { PlanGrid } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({
  fetchGridChunk: vi.fn(),
  saveAllocations: vi.fn(),
  getJson: vi.fn(),
}))
vi.mock('@/lib/grid/fetch', () => ({ fetchGridChunk: m.fetchGridChunk, gridChunkUrl: vi.fn() }))
vi.mock('@/server/actions/allocations', () => ({
  saveAllocations: m.saveAllocations,
  planAssignmentRange: vi.fn(),
}))
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

/** Tab from wherever focus is until it lands inside the grid (the toolbar comes first). */
async function tabInto(user: ReturnType<typeof userEvent.setup>, grid: HTMLElement) {
  for (let i = 0; i < 30 && !grid.contains(document.activeElement); i++) await user.tab()
  expect(grid.contains(document.activeElement)).toBe(true)
  await waitFor(() => expect(document.activeElement).not.toBe(grid))
}

function renderPos(o: { onOpenTask?: (id: string) => void; archived?: boolean } = {}) {
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

const chunkOf = (tasks: FxTask[]) =>
  m.fetchGridChunk.mockImplementation((_ctx: unknown, chunk: GridChunk) =>
    Promise.resolve(gridResponse({ from: chunk.from, tasks, people: POS_PEOPLE })),
  )

beforeEach(() => {
  resetVersions()
  stubViewport()
  stubScrollTo()
  m.fetchGridChunk.mockImplementation((_ctx: unknown, chunk: GridChunk) =>
    Promise.resolve(gridResponse({ from: chunk.from, tasks: POS_TASKS, people: POS_PEOPLE })),
  )
  m.getJson.mockImplementation(() => Promise.resolve(projectTasksResponse()))
})

describe('PlanGrid (S3.9, S3.15)', () => {
  describe('↗ and the history return (FR-686, M6.1-D18): the grid scrolls in its own box', () => {
    beforeEach(() => {
      resetScrollMemory()
      window.history.replaceState(null, '', `/projects/${PID}/plan`)
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    })

    async function leaveViaArrow(): Promise<void> {
      const view = renderPos()
      const grid = screen.getByRole('grid', { name: th.grid.gridLabel('POS Upgrade') })
      const header = await screen.findByRole('rowheader', { name: 'Rollout สาขา · Mint' })
      grid.scrollTop = 420
      grid.scrollLeft = 1234
      const link = within(header).getByRole('link', { name: th.grid.row.openTaskPage('Rollout สาขา') })
      link.addEventListener('click', (e) => e.preventDefault()) // stay in jsdom (no app router)
      fireEvent.click(link)
      view.unmount()
    }

    it('a plain ↗ click then a popstate return puts the grid back at the same rows and weeks', async () => {
      await leaveViaArrow()
      window.dispatchEvent(new PopStateEvent('popstate'))
      renderPos()
      const grid = screen.getByRole('grid', { name: th.grid.gridLabel('POS Upgrade') })
      await screen.findByRole('rowheader', { name: 'Rollout สาขา · Mint' })
      await waitFor(() => expect(grid.scrollTop).toBe(420))
      expect(grid.scrollLeft).toBe(1234)
    })

    it('a fresh visit (no history return) opens at the default week, not the remembered place', async () => {
      await leaveViaArrow()
      renderPos()
      const grid = screen.getByRole('grid', { name: th.grid.gridLabel('POS Upgrade') })
      await screen.findByRole('rowheader', { name: 'Rollout สาขา · Mint' })
      expect(grid.scrollTop).toBe(0)
      expect(grid.scrollLeft).not.toBe(1234)
    })
  })

  describe('opens with this week in view and keeps it while it settles (SPEC §7, M7.1 review)', () => {
    it('a drop back to the timeline start before the user acts is corrected', async () => {
      renderPos()
      const grid = screen.getByRole('grid', { name: th.grid.gridLabel('POS Upgrade') })
      const opened = grid.scrollLeft
      expect(opened, 'opened past the timeline start').toBeGreaterThan(0)
      grid.scrollLeft = 0 // a lost scroll / re-layout
      fireEvent.scroll(grid)
      expect(grid.scrollLeft).toBe(opened)
      await screen.findByRole('rowheader', { name: 'Rollout สาขา · Mint' })
      grid.scrollLeft = 0
      fireEvent.scroll(grid)
      expect(grid.scrollLeft).toBe(opened)
    })

    it('released by user input or a scroll elsewhere: never fights the user', async () => {
      renderPos()
      const grid = screen.getByRole('grid', { name: th.grid.gridLabel('POS Upgrade') })
      const opened = grid.scrollLeft
      grid.scrollLeft = opened + 640
      fireEvent.scroll(grid)
      grid.scrollLeft = 0
      fireEvent.scroll(grid)
      expect(grid.scrollLeft).toBe(0)

      renderPos()
      const [, again] = screen.getAllByRole('grid', { name: th.grid.gridLabel('POS Upgrade') })
      fireEvent.pointerDown(again!)
      again!.scrollLeft = 0
      fireEvent.scroll(again!)
      expect(again!.scrollLeft).toBe(0)
    })
  })

  it('renders the labelled grid with three merged POS rows', async () => {
    renderPos()
    const grid = screen.getByRole('grid', { name: th.grid.gridLabel('POS Upgrade') })
    expect(grid).toHaveAttribute('data-save-state', 'idle')
    await waitFor(() => expect(grid.querySelectorAll('[data-row-header]')).toHaveLength(3))
    const keys = [...grid.querySelectorAll('[data-row-header]')].map((e) => e.getAttribute('data-row-key'))
    expect(keys).toEqual(['a:a-cindy-pos', 'a:a-ivy-uat', 'a:a-mint-rollout'])
  })

  it('shows the ⛔ badge on a task with open blockers', async () => {
    renderPos()
    const header = await screen.findByRole('rowheader', { name: 'Rollout สาขา · Mint' })
    await waitFor(() => expect(header.querySelector('[data-blocker-badge="WAITING"]')).not.toBeNull())
    expect(within(header).getByText(th.tasks.blockers.badgeWaiting(1))).toBeInTheDocument()
  })

  it('footer: ภาระรวม of the people in the grid, in days', async () => {
    renderPos()
    expect(await screen.findByTestId('cell-footer-load-W:2026-09-28')).toHaveTextContent('5.0')
    expect(screen.getByTestId('cell-footer-capacity-W:2026-09-28')).toHaveTextContent('15.0')
    expect(screen.getByTestId('cell-footer-util-W:2026-09-14')).toHaveTextContent(th.grid.footer.percent(42))
    expect(screen.getByText(th.grid.footer.load('Cindy, Ivy, Mint'))).toBeInTheDocument()
  })

  it('cells and the รวม column show 1 decimal (half-up)', async () => {
    renderPos()
    expect(await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-14')).toHaveTextContent('3.8')
    expect(screen.getByTestId('cell-a:a-cindy-pos-total')).toHaveTextContent('18.8')
    expect(screen.getByTestId('cell-a:a-ivy-uat-total')).toHaveTextContent('8.8')
  })

  it('Shift+click selects the column over editable rows; a plain header click toggles aria-expanded and fires no save (M7)', async () => {
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    const header = document.querySelector<HTMLElement>('[data-col-key="W:2026-09-28"]')!
    await user.keyboard('{Shift>}')
    await user.click(header)
    await user.keyboard('{/Shift}')
    expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-28')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('cell-a:a-mint-rollout-W:2026-09-28')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-10-05')).toHaveAttribute('aria-selected', 'false')
    const toggle = screen.getByTestId('expand-week-2026-09-28')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(await screen.findByTestId('collapse-week-2026-09-28')).toHaveAttribute('aria-expanded', 'true')
    expect(m.saveAllocations).not.toHaveBeenCalled()
  })

  it('ARIA sizes come from HEADER_ROWS / FOOTER_ROWS; roving tabindex', async () => {
    renderPos()
    const grid = screen.getByRole('grid')
    await waitFor(() => expect(grid.querySelectorAll('[data-row-header]')).toHaveLength(3))
    const viewRows = 3
    const quickAdd = 1
    expect(grid).toHaveAttribute('aria-rowcount', String(HEADER_ROWS + viewRows + quickAdd + FOOTER_ROWS))
    expect(grid).toHaveAttribute('aria-colcount', String(totalColIndex(313)))
    const firstBody = grid.querySelector('[data-row-key="a:a-cindy-pos"][role="row"]')!
    expect(firstBody).toHaveAttribute('aria-rowindex', String(HEADER_ROWS + 1))
    const home = screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    expect(home).toHaveAttribute('tabindex', '0')
    expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-21')).toHaveAttribute('tabindex', '-1')
    expect(home).toHaveAttribute('aria-colindex', String(periodColIndex(156)))
  })

  it('the toolbar shows [สัปดาห์] pressed and the view / unit selects', async () => {
    renderPos()
    expect(screen.getByRole('toolbar', { name: th.grid.toolbar.label })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.grid.toolbar.zoomWeek })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('combobox', { name: th.grid.toolbar.view })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: th.units.label })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: th.grid.toolbar.includeOthers })).not.toBeChecked()
  })

  it('typing 3 + Enter over a selected range fills every cell with one save (AC-801)', async () => {
    m.saveAllocations.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    renderPos()
    const first = await screen.findByTestId('cell-a:a-cindy-pos-W:2026-10-05')
    await user.click(first)
    await user.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}')
    expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-10-19')).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('3')
    const editor = await screen.findByRole('textbox', { name: /W:|สัปดาห์/ })
    expect(editor).toHaveValue('3')
    await user.keyboard('{Enter}')
    for (const w of ['2026-10-05', '2026-10-12', '2026-10-19']) {
      expect(screen.getByTestId(`cell-a:a-cindy-pos-W:${w}`)).toHaveTextContent('3.0')
    }
    expect(screen.getByRole('grid')).toHaveAttribute('data-save-state', 'pending')
    // range stays selected
    expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-10-12')).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(m.saveAllocations).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const input = m.saveAllocations.mock.calls[0]![0] as { items: { changes: unknown[] }[] }
    expect(input.items).toHaveLength(1)
    expect(input.items[0]!.changes).toHaveLength(3)
  })

  it('f applies the cell capacity; Cmd+Z sends the previous week snapshot (AC-802, AC-805)', async () => {
    m.saveAllocations.mockImplementation(
      (input: { items: { taskAssignmentId: string; changes: { period: string; cd: number | null }[] }[] }) =>
        Promise.resolve({
          ok: true,
          results: input.items.map((i) => ({
            taskAssignmentId: i.taskAssignmentId,
            version: 2,
            weeks: Object.fromEntries(
              i.changes.map((c) => [
                c.period,
                c.cd ? { cd: c.cd, resolution: 'WEEK' } : { cd: 0, resolution: null },
              ]),
            ),
            rowTotal: { total: 2125, committed: 2125 },
          })),
          warnings: [],
        }),
    )
    const user = userEvent.setup()
    renderPos()
    const cell = await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    expect(cell).toHaveTextContent('2.5')
    await user.click(cell)
    await user.keyboard('f')
    expect(cell).toHaveTextContent('5.0')
    await waitFor(() => expect(screen.getByRole('grid')).toHaveAttribute('data-save-state', 'idle'), {
      timeout: 2000,
    })
    expect(m.saveAllocations).toHaveBeenCalledTimes(1)
    await user.keyboard('{Control>}z{/Control}')
    await waitFor(() => expect(m.saveAllocations).toHaveBeenCalledTimes(2))
    const undoInput = m.saveAllocations.mock.calls[1]![0] as {
      items: { baseVersion: number; changes: unknown[] }[]
      onDayWeekConflict?: string
    }
    expect(undoInput.onDayWeekConflict).toBe('COLLAPSE')
    expect(undoInput.items[0]!.baseVersion).toBe(2)
    expect(undoInput.items[0]!.changes).toEqual([{ granularity: 'WEEK', period: '2026-09-28', cd: 250 }])
    await waitFor(() => expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-28')).toHaveTextContent('2.5'))
  })

  it('a read-only task row explains itself instead of editing', async () => {
    const tasks: FxTask[] = [
      {
        id: 'pair',
        name: 'คู่',
        assignees: [
          { taId: 'x1', userId: 'cindy', cells: { '2026-09-28': 100 } },
          { taId: 'x2', userId: 'ivy', cells: {} },
        ],
      },
    ]
    m.fetchGridChunk.mockImplementation((_ctx: unknown, chunk: GridChunk) =>
      Promise.resolve(gridResponse({ from: chunk.from, tasks, people: POS_PEOPLE })),
    )
    const user = userEvent.setup()
    renderPos()
    await user.click(await screen.findByTestId('cell-t:pair-W:2026-09-28'))
    await user.keyboard('2')
    expect(await screen.findByText(th.grid.toast.readOnlyRow)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /คู่ สัปดาห์/ })).toBeNull()
  })

  it('empty editable project: the empty text shows next to the quick-add row', async () => {
    chunkOf([])
    renderPos()
    expect(await screen.findByText(th.grid.empty)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: th.grid.row.addTaskLabel })).toBeInTheDocument()
  })

  it('empty archived project: a read-only empty text without the quick-add instruction', async () => {
    chunkOf([])
    renderPos({ archived: true })
    expect(await screen.findByText(th.grid.emptyReadOnly)).toBeInTheDocument()
    expect(screen.queryByText(th.grid.empty)).toBeNull()
    expect(screen.queryByRole('textbox', { name: th.grid.row.addTaskLabel })).toBeNull()
  })

  it('load error: the error alert with ลองโหลดใหม่; loading text before data', async () => {
    m.fetchGridChunk.mockImplementation(() => Promise.reject(new Error('boom')))
    renderPos()
    expect(screen.getByText(th.grid.loading)).toBeInTheDocument()
    expect(await screen.findByText(th.grid.loadError)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.grid.reload })).toBeInTheDocument()
  })

  it('Shift+Space → Tab reaches ⠿, ↗ (page link), + คน and ×; Enter on the row header opens the panel (§8.9, M6.1-D17, M7.1)', async () => {
    const onOpenTask = vi.fn()
    const user = userEvent.setup()
    renderPos({ onOpenTask })
    const cell = await screen.findByTestId('cell-a:a-mint-rollout-W:2026-09-28')
    const header = document.querySelector<HTMLElement>('[data-row-header][data-row-key="a:a-mint-rollout"]')!
    await waitFor(() =>
      expect(
        within(header).getByRole('button', { name: th.grid.row.addPersonLabel('Rollout สาขา') }),
      ).toBeInTheDocument(),
    )
    await user.click(cell)
    await user.keyboard('{Shift>} {/Shift}')
    expect(header).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onOpenTask).toHaveBeenCalledWith('t-rollout')
    await user.tab()
    // M7.1 (FR-815): the drag handle comes first in the task cell
    expect(within(header).getByRole('button', { name: th.grid.reorder.handle })).toHaveFocus()
    await user.tab()
    const link = within(header).getByRole('link', { name: th.grid.row.openTaskPage('Rollout สาขา') })
    expect(link).toHaveFocus()
    expect(link).toHaveAttribute('href', '/t/t-rollout')
    // Enter on the focused ↗ is the link's (native activation → the task page), not the grid's "open panel"
    expect(fireEvent.keyDown(link, { key: 'Enter', code: 'Enter' })).toBe(true)
    expect(onOpenTask).toHaveBeenCalledTimes(1)
    await user.tab()
    expect(
      within(header).getByRole('button', { name: th.grid.row.addPersonLabel('Rollout สาขา') }),
    ).toHaveFocus()
    // M7.1 (FR-816): × now sits in the ผู้รับผิดชอบ cell, after the task cell
    await user.tab()
    expect(within(header).getByRole('button', { name: th.grid.row.removeAssignee('Mint') })).toHaveFocus()
  })

  it('Shift+Space → Delete moves focus to a body cell, not to <body>', async () => {
    vi.mocked(deleteTaskTree).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderPos()
    const cell = await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    await user.click(cell)
    await user.keyboard('{Shift>} {/Shift}')
    await user.keyboard('{Delete}')
    await waitFor(() => expect(deleteTaskTree).toHaveBeenCalled())
    expect(screen.getByTestId('cell-a:a-ivy-uat-W:2026-10-05')).toHaveFocus()
  })

  it('× unassign moves focus from the button to a cell of the row', async () => {
    vi.mocked(unassign).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    const header = document.querySelector<HTMLElement>('[data-row-header][data-row-key="a:a-cindy-pos"]')!
    await user.click(within(header).getByRole('button', { name: th.grid.row.removeAssignee('Cindy') }))
    await waitFor(() => expect(unassign).toHaveBeenCalled())
    expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-28')).toHaveFocus()
  })

  it('Esc in the quick-add row focuses the last body row', async () => {
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-mint-rollout-W:2026-09-28')
    await user.click(screen.getByRole('textbox', { name: th.grid.row.addTaskLabel }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByTestId('cell-a:a-mint-rollout-W:2026-09-28')).toHaveFocus())
  })

  it('▶ (past the rendered window) then Tab from the toolbar lands on a body cell of the visible weeks (§8.9, S3.15)', async () => {
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    const grid = screen.getByRole('grid')
    const next = screen.getByRole('button', { name: th.grid.toolbar.next })
    for (let i = 0; i < 10; i++) await user.click(next)
    await waitFor(() => expect(screen.queryByTestId('cell-a:a-cindy-pos-W:2026-09-28')).toBeNull())
    await tabInto(user, grid)
    const active = document.activeElement as HTMLElement
    expect(active).toHaveAttribute('data-cell')
    expect(active.dataset.testid).toMatch(/^cell-a:a-cindy-pos-W:/)
    expect(Number(active.dataset.c)).toBeGreaterThan(156)
  })

  it('a selected cell scrolled out of the window: the root takes Tab and hands focus back to it (§8.9)', async () => {
    const user = userEvent.setup()
    renderPos()
    const cell = await screen.findByTestId('cell-a:a-ivy-uat-W:2026-09-28')
    await user.click(cell)
    const grid = screen.getByRole('grid')
    const next = screen.getByRole('button', { name: th.grid.toolbar.next })
    for (let i = 0; i < 10; i++) await user.click(next)
    await waitFor(() => expect(screen.queryByTestId('cell-a:a-ivy-uat-W:2026-09-28')).toBeNull())
    await waitFor(() => expect(grid).toHaveAttribute('tabindex', '0'))
    await tabInto(user, grid)
    await waitFor(() => expect(screen.getByTestId('cell-a:a-ivy-uat-W:2026-09-28')).toHaveFocus())
    await waitFor(() => expect(grid).toHaveAttribute('tabindex', '-1'))
  })

  it('Esc with nothing left to cancel is not swallowed: it reaches the window hotkeys (TaskPanel, §8.6)', async () => {
    const user = userEvent.setup()
    renderPos()
    const cell = await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    const seen: boolean[] = []
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') seen.push(e.defaultPrevented)
    }
    window.addEventListener('keydown', onKey)
    try {
      await user.click(cell)
      await user.keyboard('3')
      expect(document.activeElement).toHaveAttribute('data-cell-editor')
      // 1st Esc cancels the edit, 2nd clears the selection, 3rd is left to the panel
      await user.keyboard('{Escape}{Escape}{Escape}')
      expect(seen).toEqual([true, true, false])
      expect(document.activeElement).toHaveAttribute('data-cell')
    } finally {
      window.removeEventListener('keydown', onKey)
    }
  })

  it('the shared tooltip describes the cell it is shown for (aria-describedby, §8.9)', async () => {
    const user = userEvent.setup()
    renderPos()
    const cell = await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-14')
    await user.click(cell)
    const tip = await screen.findByRole('tooltip')
    expect(tip.id).not.toBe('')
    expect(cell).toHaveAttribute('aria-describedby', tip.id)
    expect(cell).toHaveAccessibleDescription(/3\.75/)
    await user.keyboard('{ArrowRight}')
    expect(cell).not.toHaveAttribute('aria-describedby')
  })

  it('week headers name the current week; the legend lists 🎌 and ▨ (FR-807, M6-D20)', async () => {
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    const today = document.querySelector('[role="columnheader"][data-col-key="W:2026-09-28"]')
    expect(today).toHaveAccessibleName([th.grid.header.week('28/9'), th.grid.header.today].join(' · '))
    const legend = screen.getByTestId('grid-legend')
    expect(legend).toHaveTextContent(th.grid.legend.holiday)
    expect(legend).toHaveTextContent(th.grid.legend.noCapacity)
  })
  it('focus leaving the grid flushes a pending edit at once (grid blur, §7.4)', async () => {
    m.saveAllocations.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    renderPos()
    const cell = await screen.findByTestId('cell-a:a-cindy-pos-W:2026-10-05')
    await user.click(cell)
    await user.keyboard('3{Enter}')
    const grid = screen.getByRole('grid')
    expect(grid).toHaveAttribute('data-save-state', 'pending')
    expect(m.saveAllocations).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: th.grid.toolbar.today }))
    expect(grid.contains(document.activeElement)).toBe(false)
    // no wait for the 400 ms debounce: the blur sent it (state leaves 'pending' for 'saving' right away)
    await waitFor(() => expect(m.saveAllocations).toHaveBeenCalledTimes(1), { timeout: 100 })
    expect(grid).toHaveAttribute('data-save-state', 'saving')
  })

  it('Cmd+Z after a VERSION_CONFLICT on that assignment: undoStale toast, nothing sent (M6-D13)', async () => {
    m.saveAllocations.mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
      message: 'x',
      current: [
        {
          taskAssignmentId: 'a-cindy-pos',
          version: 7,
          weeks: { '2026-09-28': { cd: 100, resolution: 'WEEK' } },
          rowTotal: { total: 1975, committed: 1975 },
        },
      ],
    })
    const user = userEvent.setup()
    renderPos()
    const cell = await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    await user.click(cell)
    await user.keyboard('f')
    await waitFor(() => expect(m.saveAllocations).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(await screen.findByText(th.grid.toast.conflict)).toBeInTheDocument()
    expect(screen.queryByText(th.grid.toast.undoStale)).toBeNull()
    screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-28').focus()
    await user.keyboard('{Control>}z{/Control}')
    expect(await screen.findByText(th.grid.toast.undoStale)).toBeInTheDocument()
    expect(m.saveAllocations).toHaveBeenCalledTimes(1)
  })

  it('+ คน keeps the picker open and focused while the row re-keys; Esc returns focus to the new row (§8.9)', async () => {
    let assigned = false
    m.fetchGridChunk.mockImplementation((_ctx: unknown, chunk: GridChunk) =>
      Promise.resolve(
        gridResponse({
          from: chunk.from,
          people: POS_PEOPLE,
          tasks: [
            {
              id: 't-new',
              name: 'งานใหม่',
              assignees: assigned ? [{ taId: 'a-ivy-new', userId: 'ivy', cells: {} }] : [],
            },
          ],
        }),
      ),
    )
    m.getJson.mockImplementation((url: string) =>
      Promise.resolve(
        url.startsWith('/api/people/options')
          ? {
              people: Object.entries(POS_PEOPLE).map(([id, p]) => ({
                id,
                name: p.name,
                nickname: null,
                positionId: null,
                positionName: null,
                color: null,
                active: true,
              })),
            }
          : projectTasksResponse(),
      ),
    )
    vi.mocked(assign).mockImplementation(() => {
      assigned = true
      return Promise.resolve({
        ok: true,
        projectId: PID,
        created: [{ assignmentId: 'a-ivy-new', taskId: 't-new' }],
        addedMember: false,
        skippedParentIds: [],
        alreadyAssignedIds: [],
      })
    })
    const user = userEvent.setup()
    renderPos()
    const header = await screen.findByRole('rowheader', { name: 'งานใหม่' })
    expect(header).toHaveAttribute('data-row-key', 't:t-new')
    const plus = await within(header).findByRole('button', { name: th.grid.row.addPersonLabel('งานใหม่') })
    await user.click(plus)
    const dialog = await screen.findByRole('dialog', { name: th.tasks.picker.label })
    const input = within(dialog).getByRole('combobox', { name: th.tasks.picker.label })
    await waitFor(() => expect(input).toHaveFocus())
    expect(plus).toHaveAttribute('aria-expanded', 'true')
    await user.click(await screen.findByRole('option', { name: /Ivy/ }))
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1))
    // the t:t-new row became the merged a:a-ivy-new row: the old row (and its "+ คน") unmounted
    await waitFor(() =>
      expect(document.querySelector('[data-row-header][data-row-key="a:a-ivy-new"]')).not.toBeNull(),
    )
    expect(document.querySelector('[data-row-key="t:t-new"]')).toBeNull()
    expect(screen.getByRole('dialog', { name: th.tasks.picker.label })).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByRole('dialog', { name: th.tasks.picker.label }).contains(document.activeElement)).toBe(
      true,
    )
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: th.tasks.picker.label })).toBeNull())
    const active = document.activeElement as HTMLElement
    expect(active).toHaveAttribute('data-cell')
    expect(active.dataset.testid).toMatch(/^cell-a:a-ivy-new-W:/)
  })
})
