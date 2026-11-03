// plan/m08 S3.3–S3.6, S3.9 (ui): the ◆ Milestones row inside PlanGrid — placement + status texts (FR-705, §8.9),
// "+N" stacking (M8-D9), create from a date cell / toolbar (FR-702, M8-D11), popover + cell menu (FR-707/708, M8-D10),
// pointer drag (FR-707, X66), the member / read-only path (C40) and the ARIA row bookkeeping (S3.9). The shared
// MilestoneForm and useMilestoneMutations (S4) are mocked: this file tests the grid's wiring.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { GridMilestone } from '@/lib/contracts/grid'
import { FOOTER_ROWS, HEADER_ROWS, MS_ROW_INDEX } from '@/lib/grid/columns'
import { fxMilestone, gridResponse, POS_PEOPLE, POS_TASKS, type FxTask } from '@/lib/grid/fixtures.test.data'
import { resetVersions } from '@/lib/grid/versions'
import type { GridChunk } from '@/lib/query-keys'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { milestoneLabel } from './MilestoneRow'
import { PlanGrid } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({
  fetchGridChunk: vi.fn(),
  getJson: vi.fn(),
  mut: {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    link: vi.fn(),
  },
}))
vi.mock('@/lib/grid/fetch', () => ({ fetchGridChunk: m.fetchGridChunk, gridChunkUrl: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('@/server/actions/allocations', () => ({ saveAllocations: vi.fn(), planAssignmentRange: vi.fn() }))
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
vi.mock('@/components/milestones/useMilestoneMutations', () => ({ useMilestoneMutations: () => m.mut }))
// a minimal stand-in for S4's MilestoneForm: the date field (keyboard move) + submit with the initial values
vi.mock('@/components/milestones/MilestoneForm', async () => {
  const { th: t } = await import('@/i18n/th')
  return {
    MilestoneForm: (p: {
      initial: { name: string; date: string | null; description: string }
      readOnly?: boolean
      submitLabel: string
      onSubmit(v: { name: string; date: string; description: string | null; color: string }): void
    }) => (
      <form
        aria-label="milestone-form"
        data-initial-date={p.initial.date ?? ''}
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const get = (k: string) => {
            const v = fd.get(k)
            return typeof v === 'string' ? v : ''
          }
          p.onSubmit({
            name: get('name') || p.initial.name || 'ใหม่',
            date: get('date'),
            description: null,
            color: 'PURPLE',
          })
        }}
      >
        <label>
          {t.milestones.fields.date}
          <input name="date" defaultValue={p.initial.date ?? ''} />
        </label>
        <input name="name" aria-label={t.milestones.fields.name} defaultValue={p.initial.name} />
        <button type="submit">{p.submitLabel}</button>
      </form>
    ),
  }
})

const ctx = { kind: 'project', id: PID } as const

const UAT = fxMilestone('m-uat', '2026-10-02', {
  name: 'UAT sign-off',
  status: 'DUE_SOON',
  late: true,
  lateTaskCount: 1,
  progress: { done: 0, total: 1 },
})
const BETA = fxMilestone('m-beta', '2026-10-20', { name: 'Beta release' })
const REVIEW = fxMilestone('m-review', '2026-10-23', { name: 'Dashboard review' })
const DONE = fxMilestone('m-kick', '2026-09-15', {
  name: 'Kickoff',
  status: 'DONE',
  completedOn: '2026-09-15',
})

const TASKS: FxTask[] = POS_TASKS.map((t) =>
  t.id === 't-uat' ? { ...t, milestoneId: 'm-uat', lateForMilestone: true } : t,
)

function serve(milestones: GridMilestone[], canManage: boolean) {
  m.fetchGridChunk.mockImplementation((_c: unknown, chunk: GridChunk) =>
    Promise.resolve(
      gridResponse({ from: chunk.from, tasks: TASKS, people: POS_PEOPLE, milestones, canManage }),
    ),
  )
}

function renderPos() {
  return renderGrid(
    <PlanGrid context={ctx} projectName="POS Upgrade" archived={false} canEdit onOpenTask={vi.fn()} />,
  )
}

beforeEach(() => {
  resetVersions()
  stubViewport()
  stubScrollTo()
  for (const f of Object.values(m.mut)) f.mockReset()
  m.mut.update.mockResolvedValue(undefined)
  m.mut.remove.mockResolvedValue(undefined)
  m.mut.create.mockResolvedValue(null)
  m.getJson.mockImplementation(() => Promise.resolve(projectTasksResponse()))
})

describe('◆ row: rendering (S3.3, FR-705, §8.9)', () => {
  it('a rowheader "◆ Milestones" on aria-rowindex 1; UAT sign-off in its week with status + late texts', async () => {
    serve([UAT, BETA, REVIEW, DONE], true)
    renderPos()
    const diamond = await screen.findByTestId('ms-m-uat')
    const row = screen.getByTestId('ms-row')
    expect(row).toHaveAttribute('aria-rowindex', String(MS_ROW_INDEX))
    expect(MS_ROW_INDEX).toBe(1)
    expect(within(row).getByRole('rowheader')).toHaveTextContent(th.milestones.grid.rowHeader)
    expect(screen.getByTestId('ms-cell-W:2026-09-28')).toContainElement(diamond)
    expect(diamond).toHaveAccessibleName(
      `${th.milestones.grid.diamondLabel('UAT sign-off', '2 ต.ค. 2569', th.milestones.status.DUE_SOON)} ${th.milestones.lateTasks(1)}`,
    )
    expect(diamond).toHaveTextContent(th.milestones.lateTasks(1))
    expect(diamond).toHaveAttribute('data-late', 'true')
    expect(diamond).toHaveAttribute('data-status', 'DUE_SOON')
    expect(diamond).toHaveAttribute('data-period-key', 'W:2026-09-28')
  })

  it('two ◆ in one week → one ◆ (the earlier) + "+1" opening the list', async () => {
    serve([BETA, REVIEW], true)
    renderPos()
    const cell = await screen.findByTestId('ms-cell-W:2026-10-19')
    await waitFor(() => expect(within(cell).getByTestId('ms-m-beta')).toBeInTheDocument())
    expect(within(cell).queryByTestId('ms-m-review')).toBeNull()
    const more = within(cell).getByRole('button', { name: th.milestones.grid.moreLabel(1, '19/10') })
    expect(more).toHaveTextContent(th.milestones.grid.more(1))
    fireEvent.click(more)
    const list = await screen.findByTestId('ms-stack-popover')
    expect(within(list).getByTestId('ms-stack-m-review')).toHaveAccessibleName(milestoneLabel(REVIEW))
    fireEvent.click(within(list).getByTestId('ms-stack-m-review'))
    expect(await screen.findByTestId('ms-popover')).toHaveTextContent('Dashboard review')
  })

  it('DONE carries the hidden status text; no ◆ relies on colour alone', async () => {
    serve([UAT, BETA, DONE], true)
    renderPos()
    const done = await screen.findByTestId('ms-m-kick')
    expect(done).toHaveTextContent(th.milestones.status.DONE)
    for (const el of document.querySelectorAll<HTMLElement>('[data-ms-id]')) {
      expect(el.textContent?.trim().length).toBeGreaterThan(0)
      const status = el.dataset.status as GridMilestone['status']
      expect(el).toHaveTextContent(th.milestones.status[status])
    }
  })

  it("S3.9: aria-rowcount from HEADER_ROWS (3) and the ◆ shares its period column's aria-colindex", async () => {
    serve([UAT], true)
    renderPos()
    const grid = screen.getByRole('grid')
    await waitFor(() => expect(grid.querySelectorAll('[data-row-header]')).toHaveLength(3))
    expect(HEADER_ROWS).toBe(3)
    expect(grid).toHaveAttribute('aria-rowcount', String(HEADER_ROWS + 3 + 1 + FOOTER_ROWS))
    const msCell = screen.getByTestId('ms-cell-W:2026-09-28')
    const body = screen.getByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    expect(msCell.getAttribute('aria-colindex')).toBe(body.getAttribute('aria-colindex'))
    const rows = screen.getAllByRole('row')
    expect(rows.slice(0, 3).map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3'])
  })

  it('the milestone is also a line in the line layer in its colour (FR-709, BR-102), without a flag', async () => {
    serve([UAT, { ...REVIEW, color: 'RED' }], true)
    renderPos()
    await screen.findByTestId('ms-m-uat')
    const purple = document.querySelectorAll('[data-marker-line][data-marker-ids="m-uat"]')
    expect([...purple].map((e) => e.getAttribute('data-marker-line')).sort()).toEqual([
      'body',
      'footer',
      'header',
    ])
    for (const e of purple) {
      expect(e).toHaveAttribute('data-color', 'PURPLE')
      expect(e).toHaveAttribute('aria-hidden', 'true')
    }
    expect(document.querySelector('[data-marker-line][data-marker-ids="m-review"]')).toHaveAttribute(
      'data-color',
      'RED',
    )
    // M11.1: no ⚑ flags and no "เส้นกำกับ" toolbar menu any more
    expect(document.querySelector('[data-marker-flag]')).toBeNull()
    expect(screen.queryByTestId('markers-menu')).toBeNull()
  })

  it('M11.1: the ◆ carries its colour (data-color + the colour name in its accessible description), never colour alone', async () => {
    serve([{ ...UAT, color: 'GREEN' }], true)
    renderPos()
    const diamond = await screen.findByTestId('ms-m-uat')
    expect(diamond).toHaveAttribute('data-color', 'GREEN')
    // the colour is named in the ◆ tooltip (milestoneTooltipFor, tooltip.test.ts) and the form's radio group
  })
})

describe('◆ row: create (S3.4, FR-702, M8-D11)', () => {
  it('manager: a click on an empty week cell opens the form pre-filled with its Monday; submit creates', async () => {
    serve([UAT], true)
    m.mut.create.mockResolvedValue(fxMilestone('m-new', '2026-10-19', { name: 'ใหม่' }))
    renderPos()
    const cell = await screen.findByTestId('ms-cell-W:2026-10-19')
    await waitFor(() => expect(cell).toHaveAttribute('tabindex', '-1'))
    fireEvent.click(cell)
    const pop = await screen.findByTestId('ms-create-popover')
    expect(within(pop).getByRole('form', { name: 'milestone-form' })).toHaveAttribute(
      'data-initial-date',
      '2026-10-19',
    )
    fireEvent.click(within(pop).getByRole('button', { name: th.milestones.form.create }))
    expect(m.mut.create).toHaveBeenCalledWith({
      projectId: PID,
      name: 'ใหม่',
      date: '2026-10-19',
      description: null,
      color: 'PURPLE',
    })
    expect(await screen.findByTestId('ms-m-new')).toBeInTheDocument()
  })

  it('manager: Enter on a focused empty cell opens the same form', async () => {
    serve([UAT], true)
    renderPos()
    const cell = await screen.findByTestId('ms-cell-W:2026-10-26')
    await waitFor(() => expect(cell).toHaveAttribute('tabindex', '-1'))
    cell.focus()
    fireEvent.keyDown(cell, { code: 'Enter', key: 'Enter' })
    expect(await screen.findByTestId('ms-create-popover')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'milestone-form' })).toHaveAttribute(
      'data-initial-date',
      '2026-10-26',
    )
  })

  it('member: nothing opens; empty cells are not focusable; no toolbar button', async () => {
    serve([UAT], false)
    renderPos()
    const cell = await screen.findByTestId('ms-cell-W:2026-10-19')
    await screen.findByTestId('ms-m-uat')
    expect(cell).not.toHaveAttribute('tabindex')
    fireEvent.click(cell)
    expect(screen.queryByTestId('ms-create-popover')).toBeNull()
    expect(screen.queryByTestId('milestone-add')).toBeNull()
  })

  it('manager: the toolbar "+ milestone" opens the form pre-filled with today', async () => {
    serve([UAT], true)
    renderPos()
    const add = await screen.findByTestId('milestone-add')
    expect(add).toHaveTextContent(th.milestones.grid.toolbarAdd)
    fireEvent.click(add)
    expect(await screen.findByRole('form', { name: 'milestone-form' })).toHaveAttribute(
      'data-initial-date',
      '2026-09-30',
    )
  })
})

describe('◆ popover + cell menu (S3.5, FR-707/708, §8.9)', () => {
  it('manager: Enter on a focused ◆ opens the popover with the date field; saving a new date moves it', async () => {
    const user = userEvent.setup()
    serve([UAT], true)
    renderPos()
    const diamond = await screen.findByTestId('ms-m-uat')
    diamond.focus()
    await user.keyboard('{Enter}')
    const pop = await screen.findByTestId('ms-popover')
    const date = within(pop).getByLabelText(th.milestones.fields.date)
    fireEvent.change(date, { target: { value: '2026-10-09' } })
    fireEvent.click(within(pop).getByRole('button', { name: th.milestones.form.save }))
    expect(m.mut.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm-uat' }),
      { date: '2026-10-09' },
      {
        toast: 'moved',
      },
    )
    // optimistic: the ◆ moved to the week of 5/10 before any refetch
    await waitFor(() =>
      expect(screen.getByTestId('ms-cell-W:2026-10-05')).toContainElement(screen.getByTestId('ms-m-uat')),
    )
  })

  it('member: the popover has no inputs and the read-only text', async () => {
    const user = userEvent.setup()
    serve([UAT], false)
    renderPos()
    const diamond = await screen.findByTestId('ms-m-uat')
    diamond.focus()
    await user.keyboard('{Enter}')
    const pop = await screen.findByTestId('ms-popover')
    expect(within(pop).queryByRole('textbox')).toBeNull()
    expect(within(pop).getByTestId('ms-read-only')).toHaveTextContent(th.milestones.grid.readOnly)
    expect(within(pop).getByText(th.milestones.lateTasks(1), { exact: false })).toBeInTheDocument()
  })

  it('Shift+F10 on a ◆ opens the menu open / complete / delete; delete removes it at once (no confirm)', async () => {
    serve([UAT, BETA], true)
    renderPos()
    const diamond = await screen.findByTestId('ms-m-uat')
    diamond.focus()
    fireEvent.keyDown(diamond, { code: 'F10', key: 'F10', shiftKey: true })
    const menu = await screen.findByRole('menu', { name: th.grid.day.cellMenu })
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([
      th.milestones.grid.menu.open,
      th.milestones.grid.menu.complete,
      th.milestones.grid.menu.delete,
    ])
    fireEvent.click(within(menu).getByRole('menuitem', { name: th.milestones.grid.menu.delete }))
    expect(m.mut.remove).toHaveBeenCalledTimes(1)
    expect(m.mut.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-uat', projectId: 'p-pos' }))
    await waitFor(() => expect(screen.queryByTestId('ms-m-uat')).toBeNull())
    expect(screen.getByTestId('ms-m-beta')).toBeInTheDocument()
  })

  it('member: the ◆ menu only has "open"; complete from the manager menu sends completed: true', async () => {
    serve([UAT], false)
    const view = renderPos()
    const diamond = await screen.findByTestId('ms-m-uat')
    fireEvent.contextMenu(diamond, { clientX: 40, clientY: 40 })
    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([th.milestones.grid.menu.open])
    view.unmount()

    serve([UAT], true)
    renderPos()
    const d2 = await screen.findByTestId('ms-m-uat')
    fireEvent.contextMenu(d2, { clientX: 40, clientY: 40 })
    fireEvent.click(await screen.findByRole('menuitem', { name: th.milestones.grid.menu.complete }))
    expect(m.mut.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm-uat' }),
      { completed: true },
      {
        toast: 'completed',
      },
    )
    await waitFor(() => expect(screen.getByTestId('ms-m-uat')).toHaveAttribute('data-status', 'DONE'))
  })

  it('Shift+F10 on an empty cell (manager) offers "create here"', async () => {
    serve([UAT], true)
    renderPos()
    const cell = await screen.findByTestId('ms-cell-W:2026-10-19')
    await waitFor(() => expect(cell).toHaveAttribute('tabindex', '-1'))
    cell.focus()
    fireEvent.keyDown(cell, { code: 'F10', key: 'F10', shiftKey: true })
    fireEvent.click(await screen.findByRole('menuitem', { name: th.milestones.grid.menu.create }))
    expect(await screen.findByRole('form', { name: 'milestone-form' })).toHaveAttribute(
      'data-initial-date',
      '2026-10-19',
    )
  })
})

describe('◆ drag (S3.6, FR-707, X66)', () => {
  const drag = (el: HTMLElement, dx: number) => {
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 10 + dx / 2, clientY: 10 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 10 + dx, clientY: 10 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 10 + dx, clientY: 10 })
    fireEvent.click(el)
  }

  it('+70 px from a 23 ต.ค. ◆ (week width 64) → Friday 30 ต.ค., one moved update, optimistic', async () => {
    serve([REVIEW], true)
    renderPos()
    const diamond = await screen.findByTestId('ms-m-review')
    drag(diamond, 70)
    expect(m.mut.update).toHaveBeenCalledTimes(1)
    expect(m.mut.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm-review' }),
      { date: '2026-10-30' },
      {
        toast: 'moved',
      },
    )
    expect(screen.queryByTestId('ms-popover')).toBeNull()
    await waitFor(() =>
      expect(screen.getByTestId('ms-cell-W:2026-10-26')).toContainElement(screen.getByTestId('ms-m-review')),
    )
  })

  it('a 2 px move is a click: no drop, the popover opens', async () => {
    serve([REVIEW], true)
    renderPos()
    const diamond = await screen.findByTestId('ms-m-review')
    drag(diamond, 2)
    expect(m.mut.update).not.toHaveBeenCalled()
    expect(await screen.findByTestId('ms-popover')).toBeInTheDocument()
  })

  it('Escape cancels a drag', async () => {
    serve([REVIEW], true)
    renderPos()
    const diamond = await screen.findByTestId('ms-m-review')
    fireEvent.pointerDown(diamond, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 80, clientY: 10 })
    expect(await screen.findByTestId('ms-ghost')).toBeInTheDocument()
    expect(screen.getByTestId('ms-drop-hint')).toHaveTextContent(th.milestones.grid.dropHint('30 ต.ค. 2569'))
    fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 80, clientY: 10 })
    expect(m.mut.update).not.toHaveBeenCalled()
    expect(screen.queryByTestId('ms-ghost')).toBeNull()
  })

  it('member: dragging is disabled (the click still opens the read-only popover)', async () => {
    serve([REVIEW], false)
    renderPos()
    const diamond = await screen.findByTestId('ms-m-review')
    drag(diamond, 70)
    expect(m.mut.update).not.toHaveBeenCalled()
    expect(await screen.findByTestId('ms-read-only')).toBeInTheDocument()
  })
})
