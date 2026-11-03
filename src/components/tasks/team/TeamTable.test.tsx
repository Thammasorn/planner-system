import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { TeamTaskCard, TeamTasksResponse } from '@/lib/contracts/tasks'
import { PID, S, STATUSES, T } from '../fixtures.test.data'
import { renderTasks } from '../render.test.helper'
import { TeamTasks } from './TeamTasks'

const m = vi.hoisted(() => ({
  getJson: vi.fn(),
  setTaskStatus: vi.fn(),
  updateTask: vi.fn(),
  deleteTaskTree: vi.fn(),
  restoreTaskBatch: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('@/server/actions/tasks', () => ({
  setTaskStatus: m.setTaskStatus,
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  revertTaskStatus: vi.fn(),
  updateTask: m.updateTask,
  deleteTaskTree: m.deleteTaskTree,
  restoreTaskBatch: m.restoreTaskBatch,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
// the task panel beside the table has its own suite; here it only has to exist when `?task=` is set
vi.mock('../TaskPanel', () => ({
  TaskPanel: ({ projectId }: { projectId: string }) => <aside data-testid="task-panel" data-project={projectId} />,
}))

const CRM = '7a1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'
const MS = '8b1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'

function card(id: string, name: string, o: Partial<TeamTaskCard> = {}): TeamTaskCard {
  return {
    id,
    projectId: PID,
    name,
    parentPath: [],
    status: STATUSES[0]!,
    assigneeIds: [],
    dueDate: null,
    startDate: null,
    completedOn: null,
    certainty: 'CONFIRMED',
    completed: false,
    blockers: { open: 0, total: 0 },
    hasBody: false,
    milestoneId: null,
    plannedCd: 0,
    ...o,
  }
}

const page: TeamTasksResponse = {
  cards: [
    card(T.a, 'ข งานสอง', { dueDate: '2026-09-01', assigneeIds: ['ivy'], plannedCd: 250 }),
    card(T.b, 'ก งานหนึ่ง', { projectId: CRM, parentPath: ['งานแม่'], milestoneId: MS, hasBody: true }),
    card(T.c, 'ค งานสาม', { dueDate: '2026-12-01', blockers: { open: 1, total: 1 } }),
  ],
  projects: [
    { id: PID, name: 'POS Upgrade', color: '#B45309' },
    { id: CRM, name: 'CRM', color: '#2F5597' },
  ],
  statusesByProject: { [PID]: STATUSES, [CRM]: STATUSES.map((s) => ({ ...s, projectId: CRM })) },
  milestonesByProject: { [CRM]: [{ id: MS, name: 'Go-live', date: '2026-10-30', completedOn: null, color: 'RED' }] },
  nextCursor: null,
}

const rowNames = () =>
  screen
    .getAllByRole('row')
    .filter((r) => r.hasAttribute('data-task-id'))
    .map((r) => (within(r).getAllByRole('gridcell')[0]!.textContent ?? '').replace('งานแม่ ›', ''))
const rowOf = (name: string) => screen.getByText(name).closest<HTMLElement>('[role="row"]')!
const cellOf = (name: string, column: string) =>
  rowOf(name).querySelector<HTMLElement>(`[role="gridcell"][data-column="${column}"]`)!

beforeEach(() => {
  window.history.replaceState(null, '', '/tasks')
  m.getJson.mockReset()
  m.getJson.mockResolvedValue(page)
  m.setTaskStatus.mockReset()
  m.updateTask.mockReset()
  m.deleteTaskTree.mockReset()
  m.push.mockReset()
})

describe('/tasks view toggle (M11.4, FR-668/669)', () => {
  it('offers ลิสต์ · บอร์ด · ตาราง · ปฏิทิน; ตาราง writes ?view=table and the preference', async () => {
    const user = userEvent.setup()
    renderTasks(<TeamTasks />)
    const group = await screen.findByRole('group', { name: th.tasks.view.label })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      th.tasks.view.list,
      th.tasks.view.board,
      th.tasks.view.table,
      th.tasks.view.calendar,
    ])
    await user.click(within(group).getByRole('button', { name: th.tasks.view.table }))
    expect(await screen.findByRole('grid', { name: th.teamTasks.table.label })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('view')).toBe('table')
  })

  it('?view= in the URL wins over the stored tasks.view', async () => {
    window.history.replaceState(null, '', '/tasks?view=table&blocked=true')
    renderTasks(<TeamTasks />, { prefs: { 'tasks.view': 'BOARD' } })
    expect(await screen.findByRole('grid', { name: th.teamTasks.table.label })).toBeInTheDocument()
    await waitFor(() => expect(m.getJson).toHaveBeenCalledWith('/api/tasks?blocked=true', expect.anything()))
  })

  it('ตาราง loads every page (no โหลดเพิ่ม button)', async () => {
    m.getJson.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('cursor=') ? { ...page, cards: [card(T.d, 'ง งานสี่')] } : { ...page, nextCursor: 'next' },
      ),
    )
    renderTasks(<TeamTasks />, { prefs: { 'tasks.view': 'TABLE' } })
    expect(await screen.findByText('ง งานสี่')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.teamTasks.loadMore })).not.toBeInTheDocument()
  })
})

describe('TeamTable (M11.4, FR-668)', () => {
  const renderTable = () => renderTasks(<TeamTasks />, { prefs: { 'tasks.view': 'TABLE' } })

  it('shows every column: name with parent path + 📄 + ↗, project, ◆ milestone, blockers, load in days, overdue in words', async () => {
    renderTable()
    await screen.findByRole('grid', { name: th.teamTasks.table.label })
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      Object.values(th.teamTasks.table.columns),
    )
    const b = rowOf('ก งานหนึ่ง')
    expect(within(b).getByText('งานแม่ ›')).toBeInTheDocument()
    expect(within(b).getByRole('img', { name: th.tasks.hasBody })).toBeInTheDocument()
    expect(within(b).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute('href', `/t/${T.b}`)
    expect(within(cellOf('ก งานหนึ่ง', 'project')).getByText('CRM')).toBeInTheDocument()
    expect(cellOf('ก งานหนึ่ง', 'milestone')).toHaveTextContent(`${th.milestones.diamond}Go-live`)
    expect(cellOf('ค งานสาม', 'blockers')).toHaveTextContent(th.tasks.blockers.badgeWaiting(1))
    expect(cellOf('ข งานสอง', 'load')).toHaveTextContent(th.teamTasks.table.loadDays('2.5'))
    // today = 2026-09-30 → 1 ก.ย. is overdue: icon + words, not colour alone
    const due = cellOf('ข งานสอง', 'dueDate')
    expect(due).toHaveTextContent(th.teamTasks.table.overdue)
    expect(due).toHaveAttribute('aria-label', expect.stringContaining(th.teamTasks.table.overdue))
    expect(cellOf('ค งานสาม', 'dueDate')).not.toHaveTextContent(th.teamTasks.table.overdue)
  })

  it('sorts by header clicks: ascending → descending → server order (aria-sort)', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByRole('grid')
    const header = screen.getAllByRole('columnheader')[0]!
    const button = within(header).getByRole('button')
    expect(rowNames()[0]).toContain('ข งานสอง')
    await user.click(button)
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    expect(rowNames().map((n) => n.slice(0, 1))).toEqual(['ก', 'ข', 'ค'])
    await user.click(button)
    expect(header).toHaveAttribute('aria-sort', 'descending')
    expect(rowNames().map((n) => n.slice(0, 1))).toEqual(['ค', 'ข', 'ก'])
    await user.click(button)
    expect(header).toHaveAttribute('aria-sort', 'none')
    expect(rowNames().map((n) => n.slice(0, 1))).toEqual(['ข', 'ก', 'ค'])
  })

  it('edits the status through the existing StatusMenu (setTaskStatus)', async () => {
    const user = userEvent.setup()
    m.setTaskStatus.mockResolvedValue({
      ok: true,
      projectId: PID,
      statusId: S.doing,
      changed: [{ taskId: T.a, previous: { statusId: S.todo, completedOn: null } }],
      openDescendantIds: [],
      released: null,
    })
    renderTable()
    await screen.findByRole('grid')
    await user.click(within(cellOf('ข งานสอง', 'status')).getByRole('button'))
    const dialog = await screen.findByRole('dialog', { name: th.tasks.status.label })
    await user.click(within(dialog).getByRole('option', { name: new RegExp(th.tasks.status.defaults.doing) }))
    await waitFor(() => expect(m.setTaskStatus).toHaveBeenCalledWith({ taskIds: [T.a], statusId: S.doing }))
  })

  it('keyboard: arrows move the active cell, Enter edits, Esc returns to the cell; Enter on the name opens the panel', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByRole('grid')
    const first = cellOf('ข งานสอง', 'name')
    first.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(cellOf('ข งานสอง', 'status')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: th.tasks.status.label })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(cellOf('ข งานสอง', 'status')).toHaveFocus())
    await user.keyboard('{ArrowDown}{Home}')
    expect(cellOf('ก งานหนึ่ง', 'name')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(new URLSearchParams(window.location.search).get('task')).toBe(T.b)
    expect(await screen.findByTestId('task-panel')).toHaveAttribute('data-project', CRM)
    await user.keyboard('{Shift>} {/Shift}')
    expect(m.push).toHaveBeenCalledWith(`/t/${T.b}`)
  })

  it('a row click opens the task panel', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByRole('grid')
    await user.click(cellOf('ค งานสาม', 'project'))
    expect(new URLSearchParams(window.location.search).get('task')).toBe(T.c)
    expect(await screen.findByTestId('task-panel')).toHaveAttribute('data-project', PID)
  })

  it('edits a due date with one click in the calendar (updateTask, ISO at the edge)', async () => {
    const user = userEvent.setup()
    m.updateTask.mockResolvedValue({ ok: true, task: {} })
    renderTable()
    await screen.findByRole('grid')
    await user.click(within(cellOf('ค งานสาม', 'dueDate')).getByRole('button'))
    const dialog = await screen.findByRole('dialog', { name: th.teamTasks.table.date.due })
    await user.click(within(dialog).getByRole('gridcell', { name: '15' }))
    await waitFor(() =>
      expect(m.updateTask).toHaveBeenCalledWith({ taskId: T.c, patch: { dueDate: '2026-12-15' } }),
    )
    expect(cellOf('ค งานสาม', 'dueDate')).toHaveTextContent('2569')
  })

  it('Delete on a date cell clears it', async () => {
    const user = userEvent.setup()
    m.updateTask.mockResolvedValue({ ok: true, task: {} })
    renderTable()
    await screen.findByRole('grid')
    cellOf('ค งานสาม', 'dueDate').focus()
    await user.keyboard('{Delete}')
    await waitFor(() => expect(m.updateTask).toHaveBeenCalledWith({ taskId: T.c, patch: { dueDate: null } }))
  })

  it('right-click menu: เปิด, เปิดเป็นหน้า, ลบงาน → deleted at once with an undo toast', async () => {
    const user = userEvent.setup()
    m.deleteTaskTree.mockResolvedValue({
      ok: true,
      projectId: PID,
      batch: '11111111-1111-4111-8111-111111111111',
      rootIds: [T.c],
      deletedIds: [T.c],
      transfer: null,
    })
    // after the delete the server no longer lists the task
    m.getJson.mockImplementation(() =>
      Promise.resolve(
        m.deleteTaskTree.mock.calls.length > 0 ? { ...page, cards: page.cards.filter((c) => c.id !== T.c) } : page,
      ),
    )
    renderTable()
    await screen.findByRole('grid')
    await user.pointer({ keys: '[MouseRight]', target: cellOf('ค งานสาม', 'status') })
    const menu = await screen.findByRole('menu', { name: th.teamTasks.table.rowMenu.label })
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      th.teamTasks.table.rowMenu.open,
      th.teamTasks.table.rowMenu.openPage,
      th.teamTasks.table.rowMenu.delete,
    ])
    await user.click(within(menu).getByRole('menuitem', { name: th.teamTasks.table.rowMenu.delete }))
    await waitFor(() => expect(m.deleteTaskTree).toHaveBeenCalledWith({ taskIds: [T.c] }))
    expect(await screen.findByText(th.tasks.toast.deleted('ค งานสาม'))).toBeInTheDocument()
    await waitFor(() => expect(rowNames().some((n) => n.includes('ค งานสาม'))).toBe(false))
    expect(screen.getByRole('button', { name: th.undo.undo })).toBeInTheDocument()
  })

  it('Shift+F10 opens the row menu from the keyboard', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByRole('grid')
    cellOf('ข งานสอง', 'name').focus()
    await user.keyboard('{Shift>}{F10}{/Shift}')
    expect(await screen.findByRole('menu', { name: th.teamTasks.table.rowMenu.label })).toBeInTheDocument()
  })

  it('hides a column from the คอลัมน์ menu and groups by project (tasks.table preference)', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByRole('grid')
    await user.click(screen.getByRole('button', { name: th.teamTasks.table.columnsButton }))
    const menu = await screen.findByRole('menu', { name: th.teamTasks.table.columnsMenu })
    expect(within(menu).getByRole('menuitemcheckbox', { name: th.teamTasks.table.columns.name })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.click(within(menu).getByRole('menuitemcheckbox', { name: th.teamTasks.table.columns.load }))
    await user.keyboard('{Escape}')
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).not.toContain(
      th.teamTasks.table.columns.load,
    )
    await user.click(screen.getByRole('switch', { name: th.teamTasks.table.groupByProject }))
    const groups = screen.getAllByRole('row').filter((r) => r.hasAttribute('data-team-group'))
    expect(groups.map((g) => g.textContent)).toEqual([
      th.teamTasks.table.group('CRM', 1),
      th.teamTasks.table.group('POS Upgrade', 2),
    ])
  })

  it('resizes a column from the keyboard (separator, ±16 px)', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByRole('grid')
    const sep = screen.getByRole('separator', { name: th.teamTasks.table.resize(th.teamTasks.table.columns.project) })
    const before = Number(sep.getAttribute('aria-valuenow'))
    sep.focus()
    await user.keyboard('{ArrowRight}')
    expect(Number(sep.getAttribute('aria-valuenow'))).toBe(before + 16)
  })

  it('the milestone cell picks from the project milestones (ไม่ผูก + ◆ name)', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByRole('grid')
    await user.click(within(cellOf('ก งานหนึ่ง', 'milestone')).getByRole('button'))
    const menu = await screen.findByRole('menu', { name: th.teamTasks.table.milestoneMenu })
    const items = within(menu).getAllByRole('menuitemradio')
    expect(items[0]).toHaveTextContent(th.milestones.none)
    expect(items[1]).toHaveAttribute('aria-checked', 'true')
    expect(items[1]).toHaveTextContent('Go-live')
  })
})
