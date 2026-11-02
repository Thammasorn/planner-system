// plan/m07 S3.5/S3.6/S3.8/S3.9/S3.11/S3.12 — PlanGrid day resolution smoke (jsdom with offset stubs, r4 §16). Full
// interaction is S5's Playwright spec (e2e/m7-daily.spec.ts).
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addWeeks } from '@/domain/dates'
import { th } from '@/i18n/th'
import type { SaveAllocationsInput } from '@/lib/contracts/grid'
import { gridResponse, type FxTask } from '@/lib/grid/fixtures.test.data'
import { resetVersions } from '@/lib/grid/versions'
import { resetScrollMemory } from '@/lib/nav/scroll-memory'
import type { GridChunk } from '@/lib/query-keys'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { PlanGrid } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({ fetchGridChunk: vi.fn(), saveAllocations: vi.fn(), getJson: vi.fn() }))
vi.mock('@/lib/grid/fetch', () => ({ fetchGridChunk: m.fetchGridChunk, gridChunkUrl: vi.fn() }))
vi.mock('@/server/actions/allocations', () => ({ saveAllocations: m.saveAllocations, planAssignmentRange: vi.fn() }))
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
  deleteTaskTree: vi.fn(),
  restoreTaskBatch: vi.fn(),
  updateTask: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  setTaskStatus: vi.fn(),
  revertTaskStatus: vi.fn(),
  indentTask: vi.fn(),
  outdentTask: vi.fn(),
  moveTask: vi.fn(),
}))
vi.mock('@/server/actions/assignments', () => ({ assign: vi.fn(), unassign: vi.fn(), restoreAssignmentBatch: vi.fn() }))
vi.mock('@/server/actions/task-blockers', () => ({ addTaskBlocker: vi.fn(), removeTaskBlocker: vi.fn() }))

const TASKS: FxTask[] = [
  { id: 't-uat', name: 'UAT', assignees: [{ taId: 'a-ivy', userId: 'ivy', cells: { '2026-09-28': 250 } }] },
  {
    id: 't-pos',
    name: 'POS',
    assignees: [
      {
        taId: 'a-cindy',
        userId: 'cindy',
        cells: {
          '2026-10-05': {
            days: { '2026-10-05': 50, '2026-10-06': 50, '2026-10-07': 100, '2026-10-08': 50, '2026-10-09': 50 },
          },
        },
      },
    ],
  },
]
const PEOPLE = { ivy: { name: 'Ivy' }, cindy: { name: 'Cindy' } }

const okFor = (input: SaveAllocationsInput) => ({
  ok: true as const,
  results: input.items.map((i) => ({ taskAssignmentId: i.taskAssignmentId, version: 2, weeks: {}, rowTotal: { total: 1, committed: 1 } })),
  warnings: [],
})

function render(prefs: { 'grid.zoom'?: 'WEEK' | 'DAY' } = {}) {
  return renderGrid(
    <PlanGrid context={{ kind: 'project', id: PID }} projectName="POS" archived={false} canEdit onOpenTask={vi.fn()} />,
    { prefs },
  )
}

beforeEach(() => {
  resetVersions()
  resetScrollMemory()
  stubViewport()
  stubScrollTo()
  m.fetchGridChunk.mockImplementation((_c: unknown, chunk: GridChunk) =>
    Promise.resolve(
      gridResponse({
        from: chunk.from,
        tasks: TASKS,
        people: PEOPLE,
        expand: chunk.zoom === 'DAY' ? Array.from({ length: 8 }, (_, i) => addWeeks(chunk.from, i)) : chunk.expand,
      }),
    ),
  )
  m.saveAllocations.mockImplementation((input: SaveAllocationsInput) => Promise.resolve(okFor(input)))
  m.getJson.mockImplementation(() => Promise.resolve(projectTasksResponse()))
})

async function expandSept28(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('cell-a:a-ivy-W:2026-09-28')
  await user.click(screen.getByTestId('expand-week-2026-09-28'))
  await screen.findByTestId('collapse-week-2026-09-28')
  await waitFor(() => expect(screen.getByTestId('cell-a:a-ivy-D:2026-09-30')).toHaveAttribute('data-derived', 'true'))
}

describe('PlanGrid — day resolution (M7)', () => {
  it('expanding renders 5 day column headers + รวม, contiguous aria-colindex, and refetches that chunk only', async () => {
    const user = userEvent.setup()
    render()
    await expandSept28(user)
    const headers = [...document.querySelectorAll<HTMLElement>('[role="columnheader"][aria-colindex]')]
    const keys = headers.map((h) => h.dataset.colKey).filter((k): k is string => k !== undefined)
    const i = keys.indexOf('D:2026-09-28')
    expect(keys.slice(i, i + 6)).toEqual([
      'D:2026-09-28',
      'D:2026-09-29',
      'D:2026-09-30',
      'D:2026-10-01',
      'D:2026-10-02',
      'W:2026-09-28',
    ])
    expect(document.querySelector('[data-col-key="W:2026-09-28"]')).toHaveTextContent(th.grid.day.totalColumn)
    const idx = headers.filter((h) => h.dataset.colKey).map((h) => Number(h.getAttribute('aria-colindex')))
    for (let k = 1; k < idx.length; k++) expect(idx[k]! - idx[k - 1]!).toBe(1)
    const chunks = m.fetchGridChunk.mock.calls.map((c) => c[1] as GridChunk)
    expect(chunks.filter((c) => c.expand.length > 0)).toEqual([
      { from: '2026-08-31', expand: ['2026-09-28'], zoom: 'WEEK', includeOthers: false },
    ])
    expect(m.saveAllocations).not.toHaveBeenCalled()
  })

  it('derived days are dashed with aria-description (BR-20, M7-D20)', async () => {
    const user = userEvent.setup()
    render()
    await expandSept28(user)
    const wed = screen.getByTestId('cell-a:a-ivy-D:2026-09-30')
    expect(wed).toHaveTextContent('0.5')
    expect(wed).toHaveAttribute('aria-description', th.grid.day.derivedDescription)
    expect(wed.querySelector('[data-cell-value]')?.className).toMatch(/derived/)
  })

  it('AC-804: Wed = 1 → week 3.0 at once, other days solid; one DAY change saved', async () => {
    const user = userEvent.setup()
    render()
    await expandSept28(user)
    await user.click(screen.getByTestId('cell-a:a-ivy-D:2026-09-30'))
    await user.keyboard('1{Enter}')
    expect(screen.getByTestId('cell-a:a-ivy-W:2026-09-28')).toHaveTextContent('3.0')
    expect(screen.getByTestId('cell-a:a-ivy-D:2026-09-30')).toHaveTextContent('1.0')
    expect(screen.getByTestId('cell-a:a-ivy-D:2026-09-29')).not.toHaveAttribute('data-derived')
    await waitFor(() => expect(m.saveAllocations).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const input = m.saveAllocations.mock.calls[0]![0] as SaveAllocationsInput
    expect(input.items[0]!.changes).toEqual([{ granularity: 'DAY', period: '2026-09-30', cd: 100 }])
    expect(input.onDayWeekConflict).toBeUndefined()
  })

  it('a day value over 1 keeps the editor open (aria-invalid) and saves nothing', async () => {
    const user = userEvent.setup()
    render()
    await expandSept28(user)
    await user.click(screen.getByTestId('cell-a:a-ivy-D:2026-09-30'))
    await user.keyboard('1.25{Enter}')
    const editor = document.querySelector('[data-cell-editor]')
    expect(editor).toHaveAttribute('aria-invalid', 'true')
    expect(await screen.findByText(th.grid.errors.maxDay)).toBeInTheDocument()
    expect(m.saveAllocations).not.toHaveBeenCalled()
  })

  it('Cmd+↓ on a week cell expands it and focuses its first day; Cmd+↑ collapses back (view only)', async () => {
    const user = userEvent.setup()
    render()
    const cell = await screen.findByTestId('cell-a:a-ivy-W:2026-09-28')
    await user.click(cell)
    await user.keyboard('{Meta>}{ArrowDown}{/Meta}')
    await waitFor(() => expect(screen.getByTestId('cell-a:a-ivy-D:2026-09-28')).toHaveAttribute('data-focused', 'true'))
    await user.keyboard('{Control>}{ArrowUp}{/Control}')
    await waitFor(() => expect(screen.getByTestId('expand-week-2026-09-28')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('cell-a:a-ivy-W:2026-09-28')).toHaveAttribute('data-focused', 'true'))
    expect(m.saveAllocations).not.toHaveBeenCalled()
  })

  it('BR-24: a new total on a DAY week opens the dialog once; SCALE is sent with that choice', async () => {
    const user = userEvent.setup()
    render()
    const cell = await screen.findByTestId('cell-a:a-cindy-W:2026-10-05')
    await user.click(cell)
    await user.keyboard('2{Enter}')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(th.grid.br24.title(1))).toBeInTheDocument()
    expect(screen.getByTestId('cell-a:a-cindy-W:2026-10-05')).toHaveAttribute('data-pending-choice', 'true')
    expect(m.saveAllocations).not.toHaveBeenCalled()
    await user.click(within(dialog).getByTestId('br24-scale'))
    await waitFor(() => expect(m.saveAllocations).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const input = m.saveAllocations.mock.calls[0]![0] as SaveAllocationsInput
    expect(input.onDayWeekConflict).toBe('SCALE')
    expect(input.items[0]!.changes).toEqual([{ granularity: 'WEEK', period: '2026-10-05', cd: 200 }])
    expect(screen.getByTestId('cell-a:a-cindy-W:2026-10-05')).toHaveTextContent('2.0')
  })

  it('BR-24 Cancel drops the pair and saves nothing', async () => {
    const user = userEvent.setup()
    render()
    const cell = await screen.findByTestId('cell-a:a-cindy-W:2026-10-05')
    await user.click(cell)
    await user.keyboard('2{Enter}')
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('cell-a:a-cindy-W:2026-10-05')).toHaveTextContent('3.0')
    expect(screen.getByTestId('cell-a:a-cindy-W:2026-10-05')).not.toHaveAttribute('data-pending-choice')
    expect(m.saveAllocations).not.toHaveBeenCalled()
  })

  it('↕ in the รวม cell of a DAY week collapses it (WEEK Σ with COLLAPSE) + undo toast', async () => {
    const user = userEvent.setup()
    render()
    await screen.findByTestId('cell-a:a-cindy-W:2026-10-05')
    await user.click(screen.getByTestId('expand-week-2026-10-05'))
    const total = await screen.findByTestId('cell-a:a-cindy-W:2026-10-05')
    const btn = await waitFor(() => {
      const b = total.querySelector<HTMLElement>('[data-collapse-week]')
      expect(b).not.toBeNull()
      return b!
    })
    expect(btn).toHaveAccessibleName(th.grid.day.collapseToWeek)
    fireEvent.click(btn)
    expect(await screen.findByText(th.grid.day.collapsedToast)).toBeInTheDocument()
    await waitFor(() => expect(m.saveAllocations).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const input = m.saveAllocations.mock.calls[0]![0] as SaveAllocationsInput
    expect(input.onDayWeekConflict).toBe('COLLAPSE')
    expect(input.items[0]!.changes).toEqual([{ granularity: 'WEEK', period: '2026-10-05', cd: 300 }])
  })

  it('zoom [วัน] persists grid.zoom and loads day chunks; headers stop being toggles', async () => {
    const user = userEvent.setup()
    render()
    await screen.findByTestId('cell-a:a-ivy-W:2026-09-28')
    await user.click(screen.getByTestId('zoom-day'))
    await waitFor(() =>
      expect(m.fetchGridChunk.mock.calls.some((c) => (c[1] as GridChunk).zoom === 'DAY')).toBe(true),
    )
    expect(screen.getByTestId('zoom-day')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(screen.queryByTestId('expand-week-2026-09-28')).toBeNull())
    expect(screen.queryByTestId('collapse-week-2026-09-28')).toBeNull()
  })

  it('initial zoom DAY from the preference', async () => {
    render({ 'grid.zoom': 'DAY' })
    await waitFor(() => expect(screen.getByTestId('cell-a:a-ivy-D:2026-09-30')).toHaveAttribute('data-derived', 'true'))
    expect(m.fetchGridChunk.mock.calls.every((c) => (c[1] as GridChunk).zoom === 'DAY')).toBe(true)
  })
})
