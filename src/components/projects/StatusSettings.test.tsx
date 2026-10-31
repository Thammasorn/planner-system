import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { ActionFailure } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { ProjectStatusesResponse, TaskStatusDTO } from '@/lib/contracts/tasks'
import { qk } from '@/lib/query-keys'
import { PID, S, STATUSES } from '../tasks/fixtures.test.data'
import { ok, renderTasks } from '../tasks/render.test.helper'
import { StatusSettings } from './StatusSettings'

const a = vi.hoisted(() => ({
  createTaskStatus: vi.fn(),
  updateTaskStatus: vi.fn(),
  reorderTaskStatus: vi.fn(),
  deleteTaskStatus: vi.fn(),
  restoreTaskStatusBatch: vi.fn(),
}))
vi.mock('@/server/actions/task-statuses', () => a)
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const BATCH = '55555555-5555-4555-8555-555555555555'

function renderSettings(
  canManage: boolean,
  usage: Record<string, number> = { [S.todo]: 3, [S.waitData]: 3 },
) {
  const data: ProjectStatusesResponse = { statuses: STATUSES, usage, canManage }
  return renderTasks(<StatusSettings projectId={PID} />, {
    seed: (qc) => qc.setQueryData(qk.projectStatuses(PID), data),
  })
}
const rowOf = (name: string) => screen.getByTestId(`status-row-${STATUSES.find((s) => s.name === name)!.id}`)

beforeEach(() => {
  for (const f of Object.values(a)) f.mockReset()
})

describe('StatusSettings (FR-622–624, PERM-23)', () => {
  it('MEMBER: read-only list, no handles, inputs or delete', () => {
    renderSettings(false)
    expect(screen.getByText(th.tasks.status.settings.readOnly)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.tasks.status.settings.dragHandle })).toBeNull()
    for (const st of STATUSES)
      expect(screen.queryByRole('button', { name: th.tasks.status.settings.delete(st.name) })).toBeNull()
    expect(screen.queryByRole('button', { name: th.tasks.status.settings.add })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(
      within(rowOf(th.tasks.status.defaults.waitData)).getAllByText(th.tasks.status.categories.WAITING)
        .length,
    ).toBeGreaterThan(0)
  })

  it('LEAD: deleting an unused status calls deleteTaskStatus right away (no dialog)', async () => {
    const user = userEvent.setup()
    a.deleteTaskStatus.mockReturnValue(ok({ projectId: PID, batch: BATCH, moveToStatusId: null, moved: [] }))
    renderSettings(true)
    await user.click(
      within(rowOf(th.tasks.status.defaults.blocked)).getByRole('button', {
        name: th.tasks.status.settings.delete(th.tasks.status.defaults.blocked),
      }),
    )
    await waitFor(() => expect(a.deleteTaskStatus).toHaveBeenCalledWith({ statusId: S.blocked }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      await screen.findByText(th.tasks.status.toast.deleted(th.tasks.status.defaults.blocked)),
    ).toBeInTheDocument()
  })

  it('LEAD: each delete button names its status; after a delete focus moves to the next row (never <body>)', async () => {
    const user = userEvent.setup()
    const names = STATUSES.map((st) => th.tasks.status.settings.delete(st.name))
    renderSettings(true)
    expect(new Set(names).size).toBe(STATUSES.length)
    for (const st of STATUSES)
      expect(
        within(rowOf(st.name)).getByRole('button', { name: th.tasks.status.settings.delete(st.name) }),
      ).toBeInTheDocument()
    const blocked = STATUSES.find((x) => x.id === S.blocked)!
    const at = STATUSES.indexOf(blocked)
    const after = STATUSES[at + 1]!
    vi.mocked(getJson).mockImplementation(() =>
      Promise.resolve({ statuses: STATUSES.filter((x) => x.id !== S.blocked), usage: {}, canManage: true }),
    )
    try {
      a.deleteTaskStatus.mockReturnValue(ok({ projectId: PID, batch: BATCH, moveToStatusId: null, moved: [] }))
      const btn = within(rowOf(blocked.name)).getByRole('button', { name: th.tasks.status.settings.delete(blocked.name) })
      act(() => btn.focus())
      await user.keyboard('{Enter}')
      await waitFor(() => expect(screen.queryByTestId(`status-row-${S.blocked}`)).toBeNull())
      await waitFor(() =>
        expect(
          within(rowOf(after.name)).getByRole('button', { name: th.tasks.status.settings.delete(after.name) }),
        ).toHaveFocus(),
      )
    } finally {
      vi.mocked(getJson).mockImplementation(() => new Promise(() => {}))
    }
  })

  it('LEAD: deleting the last row hands focus to "+ เพิ่มสถานะ" when no row is left after it', async () => {
    const user = userEvent.setup()
    const only = STATUSES[0]!
    vi.mocked(getJson).mockImplementation(() => Promise.resolve({ statuses: [], usage: {}, canManage: true }))
    try {
      a.deleteTaskStatus.mockReturnValue(ok({ projectId: PID, batch: BATCH, moveToStatusId: null, moved: [] }))
      renderTasks(<StatusSettings projectId={PID} />, {
        seed: (qc) => qc.setQueryData(qk.projectStatuses(PID), { statuses: [only], usage: {}, canManage: true }),
      })
      act(() => screen.getByRole('button', { name: th.tasks.status.settings.delete(only.name) }).focus())
      await user.keyboard('{Enter}')
      await waitFor(() =>
        expect(screen.getByRole('button', { name: th.tasks.status.settings.add })).toHaveFocus(),
      )
    } finally {
      vi.mocked(getJson).mockImplementation(() => new Promise(() => {}))
    }
  })

  it('LEAD: deleting a used status opens the popover with the default preselected', async () => {
    const user = userEvent.setup()
    a.deleteTaskStatus.mockReturnValue(
      ok({
        projectId: PID,
        batch: BATCH,
        moveToStatusId: S.todo,
        moved: [1, 2, 3].map((n) => ({ taskId: `${n}`, fromStatusId: S.waitData, completedOn: null })),
      }),
    )
    renderSettings(true)
    await user.click(
      within(rowOf(th.tasks.status.defaults.waitData)).getByRole('button', {
        name: th.tasks.status.settings.delete(th.tasks.status.defaults.waitData),
      }),
    )
    const select = await screen.findByRole('combobox', { name: th.tasks.status.settings.moveTo })
    expect(select).toHaveTextContent(th.tasks.status.defaults.todo)
    await user.click(screen.getByRole('button', { name: th.tasks.status.settings.moveAndDelete }))
    await waitFor(() =>
      expect(a.deleteTaskStatus).toHaveBeenCalledWith({ statusId: S.waitData, moveToStatusId: S.todo }),
    )
    expect(
      await screen.findByText(th.tasks.status.toast.deletedMoved(3, th.tasks.status.defaults.todo)),
    ).toBeInTheDocument()
  })

  it('LEAD: ↑/↓ buttons reorder with the keyboard (M3-D10); the drag handle is pointer-only', async () => {
    const user = userEvent.setup()
    a.reorderTaskStatus.mockReturnValue(ok({ previousAfterId: S.doing }))
    renderSettings(true)
    const set = th.tasks.status.settings
    const todo = th.tasks.status.defaults.todo
    const waitData = th.tasks.status.defaults.waitData
    expect(within(rowOf(todo)).getByRole('button', { name: set.moveUp(todo) })).toBeDisabled()
    const handle = within(rowOf(waitData)).getByRole('button', { name: set.dragHandle })
    expect(handle).toHaveAttribute('tabindex', '-1')
    expect(handle).not.toHaveAttribute('aria-describedby')
    const up = within(rowOf(waitData)).getByRole('button', { name: set.moveUp(waitData) })
    act(() => up.focus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(a.reorderTaskStatus).toHaveBeenCalledWith({ statusId: S.waitData, afterId: S.todo }))
    // optimistic order: รอข้อมูล is now second, and focus stays on its ↑ button
    const names = screen.getAllByTestId(/^status-row-/).map((r) => r.dataset.testid)
    expect(names.slice(0, 3)).toEqual([`status-row-${S.todo}`, `status-row-${S.waitData}`, `status-row-${S.doing}`])
    await waitFor(() =>
      expect(within(rowOf(waitData)).getByRole('button', { name: set.moveUp(waitData) })).toHaveFocus(),
    )
    await user.click(within(rowOf(todo)).getByRole('button', { name: set.moveDown(todo) }))
    await waitFor(() => expect(a.reorderTaskStatus).toHaveBeenLastCalledWith({ statusId: S.todo, afterId: S.waitData }))
  })

  it('a VALIDATION reason renders under the row', async () => {
    const user = userEvent.setup()
    a.deleteTaskStatus.mockRejectedValue(
      new ActionFailure({ ok: false, code: 'VALIDATION', message: th.tasks.status.errors.needDone }),
    )
    renderSettings(true)
    await user.click(
      within(rowOf(th.tasks.status.defaults.done)).getByRole('button', {
        name: th.tasks.status.settings.delete(th.tasks.status.defaults.done),
      }),
    )
    expect(
      await within(rowOf(th.tasks.status.defaults.done)).findByText(th.tasks.status.errors.needDone),
    ).toBeInTheDocument()
  })

  it('"+ เพิ่มสถานะ" creates a WAITING amber status right before the first DONE', async () => {
    const user = userEvent.setup()
    a.createTaskStatus.mockReturnValue(new Promise(() => {}))
    renderSettings(true)
    await user.click(screen.getByRole('button', { name: th.tasks.status.settings.add }))
    expect(a.createTaskStatus).toHaveBeenCalledWith({
      projectId: PID,
      name: th.tasks.status.settings.newName,
      category: 'WAITING',
      color: '#B45309',
      afterId: S.blocked,
    })
  })

  it('the new status opens for renaming once; later refetches do not reopen the editor after the rename', async () => {
    const user = userEvent.setup()
    const blocked = STATUSES.find((x) => x.id === S.blocked)!
    const fresh: TaskStatusDTO = {
      ...blocked,
      id: '66666666-6666-4666-8666-666666666666',
      name: th.tasks.status.settings.newName,
      color: '#B45309',
      category: 'WAITING',
      position: blocked.position + 'V',
    }
    let server: ProjectStatusesResponse = { statuses: [...STATUSES, fresh], usage: {}, canManage: true }
    vi.mocked(getJson).mockImplementation(() => Promise.resolve(server))
    try {
      a.createTaskStatus.mockReturnValue(ok({ status: fresh }))
      a.updateTaskStatus.mockImplementation((v: { patch: { name?: string; color?: string } }) => {
        server = {
          ...server,
          statuses: server.statuses.map((x) => (x.id === fresh.id ? { ...x, ...v.patch } : x)),
        }
        return ok({ status: server.statuses.find((x) => x.id === fresh.id)! })
      })
      const { qc } = renderSettings(true)
      await user.click(screen.getByRole('button', { name: th.tasks.status.settings.add }))
      const input = await screen.findByRole('textbox', { name: th.tasks.status.settings.name })
      await waitFor(() => expect(input).toHaveFocus())
      await user.clear(input)
      await user.type(input, 'รอลูกค้ายืนยัน{Enter}')
      await waitFor(() => expect(a.updateTaskStatus).toHaveBeenCalledTimes(1))
      expect(await screen.findByRole('button', { name: 'รอลูกค้ายืนยัน' })).toBeInTheDocument()
      // a later status-set change (another refetch) must not put the name back into edit mode
      server = { ...server, statuses: server.statuses.map((x) => ({ ...x })) }
      await qc.invalidateQueries({ queryKey: qk.projectStatuses(PID) })
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.queryByRole('textbox', { name: th.tasks.status.settings.name })).toBeNull()
      expect(screen.getByRole('button', { name: 'รอลูกค้ายืนยัน' })).toBeInTheDocument()
    } finally {
      vi.mocked(getJson).mockImplementation(() => new Promise(() => {}))
    }
  })
})
