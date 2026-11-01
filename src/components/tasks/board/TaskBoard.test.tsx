import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { formatThaiDate } from '@/lib/format'
import { PID, response, S, STATUSES, T } from '../fixtures.test.data'
import { ok, renderTasks } from '../render.test.helper'
import { ProjectBoard } from './ProjectBoard'

const a = vi.hoisted(() => ({ createTask: vi.fn(), setTaskStatus: vi.fn() }))
vi.mock('@/server/actions/tasks', () => ({
  createTask: a.createTask,
  setTaskStatus: a.setTaskStatus,
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
}))
vi.mock('@/server/actions/assignments', () => ({}))
vi.mock('@/server/actions/task-blockers', () => ({}))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const columns = () => screen.getAllByRole('group')

function renderBoard(prefs = {}) {
  const data = response()
  data.tasks = data.tasks.map((t) => (t.id === T.c ? { ...t, statusId: S.doing } : t))
  return renderTasks(<ProjectBoard projectId={PID} data={data} assigneeId={null} />, { data, prefs })
}

beforeEach(() => window.history.replaceState(null, '', '/projects/p/tasks'))

describe('TaskBoard (FR-660–664)', () => {
  it('one column per status in position order with counts, empty columns kept', () => {
    renderBoard()
    expect(columns().map((c) => c.getAttribute('aria-label'))).toEqual([
      th.tasks.board.column(STATUSES[0]!.name, 3),
      th.tasks.board.column(STATUSES[1]!.name, 1),
      th.tasks.board.column(STATUSES[2]!.name, 0),
      th.tasks.board.column(STATUSES[3]!.name, 0),
      th.tasks.board.column(STATUSES[4]!.name, 0),
    ])
  })

  it('hideDone hides the DONE column; leafOnly hides parents', () => {
    renderBoard({ 'tasks.board.hideDone': true, 'tasks.board.leafOnly': true })
    expect(columns()).toHaveLength(4)
    expect(screen.queryByRole('article', { name: 'ออกแบบ' })).toBeNull()
    expect(screen.getByRole('article', { name: 'ย่อย B' })).toBeInTheDocument()
  })

  it('a card shows breadcrumb, Thai due date, ◐, ⛔ รอ 1 งาน and รอมอบหมาย (FR-661); an assigned card shows its people', () => {
    const data = response()
    data.tasks = data.tasks.map((t) =>
      t.id === T.b
        ? { ...t, dueDate: '2026-10-15', certaintyOverride: 'TENTATIVE', blockers: { open: 1, total: 1 } }
        : t,
    )
    data.blockerEdges = [{ id: '22222222-2222-4222-8222-222222222222', taskId: T.b, blockerTaskId: T.c }]
    renderTasks(<ProjectBoard projectId={PID} data={data} assigneeId={null} />, { data })
    const card = within(screen.getByRole('article', { name: 'ย่อย B' }))
    expect(card.getByText(th.tasks.groups.parentPath('ออกแบบ'))).toBeInTheDocument()
    expect(card.getByText(formatThaiDate('2026-10-15'))).toBeInTheDocument()
    expect(card.getByRole('img', { name: th.projects.certainty.TENTATIVE })).toHaveTextContent(
      th.projects.tentativeGlyph,
    )
    expect(card.getByText(th.tasks.blockers.badgeWaiting(1))).toBeInTheDocument()
    expect(card.getByText(th.tasks.unassigned)).toBeInTheDocument()
    const c = within(screen.getByRole('article', { name: 'งาน C' }))
    expect(c.queryByText(th.tasks.unassigned)).toBeNull()
    expect(c.getByText(/Ivy/)).toBeInTheDocument()
    expect(c.queryByText(th.tasks.blockers.badgeWaiting(1))).toBeNull()
    expect(c.queryByRole('img', { name: th.projects.certainty.TENTATIVE })).toBeNull()
  })

  it('a card is a single tab stop: its status chip and blocker badge are not (M3-D35)', () => {
    const data = response()
    data.tasks = data.tasks.map((t) => (t.id === T.b ? { ...t, blockers: { open: 1, total: 1 } } : t))
    data.blockerEdges = [{ id: '22222222-2222-4222-8222-222222222222', taskId: T.b, blockerTaskId: T.c }]
    renderTasks(<ProjectBoard projectId={PID} data={data} assigneeId={null} />, { data })
    const card = screen.getByRole('article', { name: 'ย่อย B' })
    const stops = [...card.querySelectorAll<HTMLElement>('[tabindex="0"]')]
    expect(stops).toEqual([])
    expect(within(card).getByText(th.tasks.blockers.badgeWaiting(1)).closest('[tabindex]')).toHaveAttribute(
      'tabindex',
      '-1',
    )
  })

  it('Enter on a card opens the panel through ?task=', async () => {
    const user = userEvent.setup()
    renderBoard()
    act(() => screen.getByRole('article', { name: 'งาน C' }).focus())
    await user.keyboard('{Enter}')
    expect(new URLSearchParams(window.location.search).get('task')).toBe(T.c)
  })

  it('S on a card opens the status menu; picking calls setTaskStatus', async () => {
    const user = userEvent.setup()
    a.setTaskStatus.mockReturnValue(
      ok({
        projectId: PID,
        statusId: S.waitData,
        changed: [{ taskId: T.c, previous: { statusId: S.doing, completedOn: null } }],
        openDescendantIds: [],
        released: null,
      }),
    )
    renderBoard()
    act(() => screen.getByRole('article', { name: 'งาน C' }).focus())
    await user.keyboard('s')
    await user.click(await screen.findByRole('option', { name: new RegExp(STATUSES[2]!.name) }))
    await waitFor(() =>
      expect(a.setTaskStatus).toHaveBeenCalledWith({
        taskIds: [T.c],
        statusId: S.waitData,
        withChildren: false,
      }),
    )
  })

  it('BR-52: S → เสร็จ on a card shows the released load instead of the status toast', async () => {
    const user = userEvent.setup()
    const done = STATUSES.find((s) => s.category === 'DONE')!
    a.setTaskStatus.mockReturnValue(
      ok({
        projectId: PID,
        statusId: done.id,
        changed: [{ taskId: T.c, previous: { statusId: S.doing, completedOn: null } }],
        openDescendantIds: [],
        released: { cd: 125, weeks: 1 },
      }),
    )
    renderBoard()
    act(() => screen.getByRole('article', { name: 'งาน C' }).focus())
    await user.keyboard('s')
    await user.click(await screen.findByRole('option', { name: new RegExp(done.name) }))
    expect(await screen.findByText(th.tasks.toast.released('1.3', 1))).toBeInTheDocument()
    expect(screen.queryByText(th.tasks.status.toast.changed(done.name))).toBeNull()
  })

  it("a column's + เพิ่มงาน creates the task in that column's status", async () => {
    const user = userEvent.setup()
    a.createTask.mockReturnValue(new Promise(() => {}))
    renderBoard()
    await user.click(screen.getByRole('button', { name: th.tasks.board.quickAdd(STATUSES[2]!.name) }))
    await user.keyboard('งานใหม่{Enter}')
    await waitFor(() =>
      expect(a.createTask).toHaveBeenCalledWith({
        projectId: PID,
        parentId: null,
        name: 'งานใหม่',
        statusId: S.waitData,
      }),
    )
  })

  it('Esc in a column quick add closes it and gives focus back to "+ เพิ่มงาน"', async () => {
    const user = userEvent.setup()
    renderBoard()
    const name = th.tasks.board.quickAdd(STATUSES[2]!.name)
    await user.click(screen.getByRole('button', { name }))
    expect(screen.getByRole('textbox', { name })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name })).toHaveFocus())
  })

  it('archived: no handles and no column quick add', () => {
    const data = response({ viewer: { role: 'LEAD', canEdit: false, canManage: false } })
    renderTasks(<ProjectBoard projectId={PID} data={data} assigneeId={null} />, { data })
    expect(screen.queryByRole('button', { name: th.tasks.board.cardDragHandle('งาน C') })).toBeNull()
    expect(screen.queryByRole('button', { name: th.tasks.board.quickAdd(STATUSES[0]!.name) })).toBeNull()
  })
})
