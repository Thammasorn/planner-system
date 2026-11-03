// PlanGrid M7.1 columns (S3.1, S3.3, S3.7; FR-813, FR-816/817, AC-810, BR-100/101, M7.1-D6/D7/D8): two frozen
// columns, hide assignees → summed rows ("👥 N", values = task totals), SumModeHint on a multi-assignee cell with
// [แสดงผู้รับผิดชอบ], a single-assignee summed cell writes that assignment, and the chart pane shares includeOthers.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { gridResponse, POS_PEOPLE, POS_TASKS, type FxTask } from '@/lib/grid/fixtures.test.data'
import { resetVersions } from '@/lib/grid/versions'
import type { GridChunk } from '@/lib/query-keys'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { PlanGrid, type PlanGridProps } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({
  fetchGridChunk: vi.fn(),
  saveAllocations: vi.fn(),
  getJson: vi.fn(),
  chartProps: null as null | {
    includeOthers: boolean
    onIncludeOthers(on: boolean): void
    weeks: string[]
    layout: { slots: { key: string }[] }
  },
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
// S4 owns the chart; this stand-in exposes the shared switch and the x weeks it receives
vi.mock('@/components/load-chart/LoadChartPanel', () => ({
  LoadChartPanel: (p: {
    includeOthers: boolean
    onIncludeOthers(on: boolean): void
    weeks: string[]
    layout: { slots: { key: string }[] }
  }) => {
    m.chartProps = p
    return (
      <section data-testid="load-chart-panel">
        <label>
          <input
            type="checkbox"
            aria-label="chart-include-others"
            checked={p.includeOthers}
            onChange={(e) => p.onIncludeOthers(e.target.checked)}
          />
        </label>
      </section>
    )
  },
}))

const ctx = { kind: 'project', id: PID } as const
const POS_JACK: FxTask[] = POS_TASKS.map((t) =>
  t.id === 't-uat'
    ? {
        ...t,
        assignees: [...t.assignees, { taId: 'a-jack-uat', userId: 'jack', cells: { '2026-09-28': 100 } }],
      }
    : t,
)
const PEOPLE = { ...POS_PEOPLE, jack: { name: 'Jack' } }

function renderPos(o: Partial<PlanGridProps> = {}, prefs: Parameters<typeof renderGrid>[1] = {}) {
  return renderGrid(
    <PlanGrid context={ctx} projectName="POS Upgrade" archived={false} canEdit onOpenTask={vi.fn()} {...o} />,
    prefs,
  )
}

beforeEach(() => {
  resetVersions()
  stubViewport()
  stubScrollTo()
  m.chartProps = null
  m.fetchGridChunk.mockImplementation((_ctx: unknown, chunk: GridChunk) =>
    Promise.resolve(gridResponse({ from: chunk.from, tasks: POS_JACK, people: PEOPLE })),
  )
  m.getJson.mockImplementation(() => Promise.resolve(projectTasksResponse()))
})

const rowKeys = (grid: HTMLElement) =>
  [...grid.querySelectorAll('[data-row-header]')].map((e) => e.getAttribute('data-row-key'))

describe('two frozen columns (FR-816, M7.1-D8)', () => {
  it('header "งาน" (with the ⇔ separator) and "ผู้รับผิดชอบ" (with ซ่อน); the person sits in the assignee cell', async () => {
    renderPos()
    const grid = screen.getByRole('grid')
    await waitFor(() => expect(rowKeys(grid)).toHaveLength(5))
    const task = screen.getByRole('columnheader', { name: new RegExp(th.grid.columns.task) })
    expect(task).toHaveAttribute('aria-colindex', '1')
    expect(within(task).getByRole('separator', { name: th.grid.columns.resize })).toBeInTheDocument()
    const assignee = screen.getByRole('columnheader', { name: new RegExp(th.grid.columns.assignee) })
    expect(assignee).toHaveAttribute('aria-colindex', '2')
    expect(within(assignee).getByRole('button', { name: th.grid.columns.hide })).toBeInTheDocument()
    const merged = grid.querySelector<HTMLElement>('[data-row-header][data-row-key="a:a-cindy-pos"]')!
    expect(merged).toHaveAttribute('aria-colspan', '2')
    expect(
      within(merged.querySelector<HTMLElement>('[data-assignee-cell]')!).getByText('Cindy'),
    ).toBeInTheDocument()
    expect(
      within(merged.querySelector<HTMLElement>('[data-task-cell]')!).getByText('ปรับปรุงระบบ POS หน้าร้าน'),
    ).toBeInTheDocument()
  })
})

describe('hide assignees → summed rows (FR-816/817, AC-810, BR-100/101)', () => {
  it('the toolbar switch gives one row per task: ทำ UAT 28/9 = 3.5 with "👥 2"', async () => {
    const user = userEvent.setup()
    renderPos()
    const grid = screen.getByRole('grid')
    await waitFor(() =>
      expect(rowKeys(grid)).toEqual([
        'a:a-cindy-pos',
        't:t-uat',
        'a:a-ivy-uat',
        'a:a-jack-uat',
        'a:a-mint-rollout',
      ]),
    )
    await user.click(screen.getByRole('switch', { name: th.grid.columns.show }))
    await waitFor(() => expect(rowKeys(grid)).toEqual(['t:t-pos', 't:t-uat', 't:t-rollout']))
    expect(grid).toHaveAttribute('data-assignees', 'hidden')
    expect(screen.queryByRole('columnheader', { name: new RegExp(th.grid.columns.assignee) })).toBeNull()
    expect(screen.getByTestId('cell-t:t-uat-W:2026-09-28')).toHaveTextContent('3.5')
    const uat = grid.querySelector<HTMLElement>('[data-row-header][data-row-key="t:t-uat"]')!
    expect(within(uat).getByText(th.grid.sumMode.people(2))).toBeInTheDocument()
    // a single-assignee task shows (and edits) its assignment's cells
    expect(screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-28')).toHaveTextContent('2.5')
  })

  it('typing on a multi-assignee summed cell changes nothing and shows the hint; [แสดงผู้รับผิดชอบ] focuses Ivy', async () => {
    const user = userEvent.setup()
    renderPos({ initialShowAssignees: false })
    const cell = await screen.findByTestId('cell-t:t-uat-W:2026-09-28')
    expect(cell).toHaveAttribute('aria-readonly', 'true')
    await user.click(cell)
    await user.keyboard('4')
    const hint = await screen.findByTestId('sum-mode-hint')
    expect(hint).toHaveTextContent(th.grid.sumMode.readOnlyHint(2))
    expect(document.querySelector('[data-cell-editor]')).toBeNull()
    expect(cell).toHaveTextContent('3.5')
    await user.click(within(hint).getByRole('button', { name: th.grid.sumMode.showAssignees }))
    const ivy = await screen.findByTestId('cell-a:a-ivy-uat-W:2026-09-28')
    await waitFor(() => expect(ivy).toHaveAttribute('data-focused', 'true'))
    expect(screen.queryByTestId('sum-mode-hint')).toBeNull()
    expect(m.saveAllocations).not.toHaveBeenCalled()
  })

  it('typing 3 on "ปรับปรุงระบบ POS" 5/10 (one assignee) saves Cindy\'s assignment (X65)', async () => {
    m.saveAllocations.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    renderPos({}, { prefs: { 'grid.showAssignees': false } })
    const grid = screen.getByRole('grid')
    await waitFor(() => expect(rowKeys(grid)).toEqual(['t:t-pos', 't:t-uat', 't:t-rollout']))
    const cell = screen.getByTestId('cell-a:a-cindy-pos-W:2026-10-05')
    expect(cell).not.toHaveAttribute('aria-readonly')
    await user.click(cell)
    await user.keyboard('3{Enter}')
    expect(cell).toHaveTextContent('3.0')
    await waitFor(() => expect(m.saveAllocations).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const input = m.saveAllocations.mock.calls[0]![0] as { items: { taskAssignmentId: string }[] }
    expect(input.items.map((i) => i.taskAssignmentId)).toEqual(['a-cindy-pos'])
  })

  it('"ซ่อน" on the ผู้รับผิดชอบ header hides the column too', async () => {
    renderPos()
    const grid = screen.getByRole('grid')
    await waitFor(() => expect(rowKeys(grid).length).toBeGreaterThan(3))
    fireEvent.click(screen.getByRole('button', { name: th.grid.columns.hide }))
    await waitFor(() => expect(rowKeys(grid)).toEqual(['t:t-pos', 't:t-uat', 't:t-rollout']))
    expect(screen.getByRole('switch', { name: th.grid.columns.show })).not.toBeChecked()
  })
})

describe('chart pane (FR-813, S3.7)', () => {
  it('📈 opens the pane under the grid; its "รวมงานโปรเจคอื่น" is the footer switch (one state)', async () => {
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    const toggle = screen.getByRole('button', { name: new RegExp(th.loadChart.toggle) })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('load-chart-panel')).toBeNull()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('load-chart-panel')).toBeInTheDocument()
    const footer = screen.getByRole('switch', { name: th.grid.toolbar.includeOthers })
    expect(footer).not.toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'chart-include-others' }))
    await waitFor(() => expect(footer).toBeChecked())
    expect(m.chartProps?.includeOthers).toBe(true)
    // M7.1-D30: x = exactly the weeks whose column the grid renders (no 4–26 clamp), on the grid's geometry
    const rendered = [...document.querySelectorAll('[role="columnheader"][data-col-key^="W:"]')].map((h) =>
      h.getAttribute('data-col-key')!.slice(2),
    )
    expect(m.chartProps!.weeks).toEqual(rendered)
    expect(m.chartProps!.layout.slots.map((s) => s.key)).toEqual(rendered.map((w) => `W:${w}`))
  })

  it('initialChartOpen renders the pane at once', async () => {
    renderPos({ initialChartOpen: true })
    expect(await screen.findByTestId('load-chart-panel')).toBeInTheDocument()
  })
  it('FR-810: toolbarStart (the plan page view switch) is the first item of the toolbar', async () => {
    renderPos({ toolbarStart: <div role="group" aria-label="view-switch" /> })
    const toolbar = await screen.findByRole('toolbar', { name: th.grid.toolbar.label })
    // M7.1 review: the toolbar is grouped (view · filters · overlays); the switch leads the first group
    const first = toolbar.firstElementChild
    expect(first).toHaveAttribute('data-toolbar-group', 'view')
    expect(first?.firstElementChild).toBe(screen.getByRole('group', { name: 'view-switch' }))
  })
})
