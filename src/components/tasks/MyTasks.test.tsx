import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { MyTasksResponse } from '@/lib/contracts/tasks'
import { qk } from '@/lib/query-keys'
import { PID, S, STATUSES, T } from './fixtures.test.data'
import { ok, renderTasks } from './render.test.helper'
import { MyTasks } from './MyTasks'

const a = vi.hoisted(() => ({
  completeTask: vi.fn(),
  revertTaskStatus: vi.fn(),
  setTaskStatus: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/server/actions/tasks', () => ({
  completeTask: a.completeTask,
  revertTaskStatus: a.revertTaskStatus,
  setTaskStatus: a.setTaskStatus,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: a.push }) }))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const CRM = '77777777-7777-4777-8777-777777777777'
const data: MyTasksResponse = {
  count: 2,
  groups: [
    {
      project: { id: CRM, name: 'CRM Migration', color: '#2F5597', certainty: 'CONFIRMED' },
      tasks: [
        {
          id: T.e,
          projectId: CRM,
          name: 'ตั้งค่า automation',
          parentName: null,
          startDate: null,
          dueDate: '2026-10-16',
          status: STATUSES[0]!,
          hasBody: true,
        },
      ],
    },
    {
      project: { id: PID, name: 'POS Upgrade', color: '#B45309', certainty: 'TENTATIVE' },
      tasks: [
        {
          id: T.c,
          projectId: PID,
          name: 'ทำ UAT',
          parentName: 'ออกแบบ',
          startDate: null,
          dueDate: null,
          status: STATUSES[1]!,
          hasBody: false,
        },
      ],
    },
  ],
  statusesByProject: {
    [CRM]: STATUSES.map((s) => ({ ...s, projectId: CRM })),
    [PID]: STATUSES,
  },
}

function renderMy(d: MyTasksResponse = data) {
  return renderTasks(<MyTasks />, { seed: (qc) => qc.setQueryData(qk.myTasks(), d) })
}

describe('MyTasks (FR-1009 basic, X22, M3-D8)', () => {
  it('groups by project in response order with status chips', () => {
    renderMy()
    const sections = screen.getAllByRole('region').filter((r) => r.dataset.myProject !== undefined)
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual(['CRM Migration', 'POS Upgrade'])
    expect(within(sections[1]!).getByText(th.my.inParent('ออกแบบ'))).toBeInTheDocument()
    expect(within(sections[0]!).getByText(th.my.due('16 ต.ค. 2569'))).toBeInTheDocument()
    expect(within(sections[1]!).getAllByText(th.tasks.status.defaults.doing).length).toBeGreaterThan(0)
  })

  it('ticking calls completeTask and offers undo', async () => {
    const user = userEvent.setup()
    a.completeTask.mockReturnValue(
      ok({
        projectId: CRM,
        statusId: S.done,
        changed: [{ taskId: T.e, previous: { statusId: S.todo, completedOn: null } }],
        openDescendantIds: [],
        released: null,
      }),
    )
    renderMy()
    await user.click(screen.getByRole('checkbox', { name: th.tasks.completeCheckbox('ตั้งค่า automation') }))
    await waitFor(() => expect(a.completeTask).toHaveBeenCalledWith({ taskIds: [T.e] }))
    expect(await screen.findByText(th.tasks.toast.completed)).toBeInTheDocument()
  })

  it('BR-52: ticking a task with future load shows the released load', async () => {
    const user = userEvent.setup()
    a.completeTask.mockReturnValue(
      ok({
        projectId: CRM,
        statusId: S.done,
        changed: [{ taskId: T.e, previous: { statusId: S.todo, completedOn: null } }],
        openDescendantIds: [],
        released: { cd: 1000, weeks: 4 },
      }),
    )
    renderMy()
    await user.click(screen.getByRole('checkbox', { name: th.tasks.completeCheckbox('ตั้งค่า automation') }))
    expect(await screen.findByText(th.tasks.toast.released('10.0', 4))).toBeInTheDocument()
  })

  it('the name opens the task in its project', async () => {
    renderMy()
    await userEvent.click(screen.getByRole('link', { name: 'ทำ UAT' }))
    expect(a.push).toHaveBeenCalledWith(`/projects/${PID}/tasks?task=${T.c}`)
  })

  it('FR-685: ↗ is a link to the task page; 📄 only on tasks with a body (FR-691)', () => {
    renderMy()
    const [crm, pos] = screen.getAllByRole('region').filter((r) => r.dataset.myProject !== undefined)
    expect(within(crm!).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute('href', `/t/${T.e}`)
    expect(within(pos!).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute('href', `/t/${T.c}`)
    expect(within(crm!).getByRole('img', { name: th.tasks.hasBody })).toBeInTheDocument()
    expect(within(pos!).queryByRole('img', { name: th.tasks.hasBody })).toBeNull()
  })

  it('M6.1-D25 (FR-1606): the status chip opens the menu; picking calls setTaskStatus with undo', async () => {
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
    renderMy()
    await user.click(
      screen.getByRole('button', { name: th.tasks.status.menuLabel(th.tasks.status.defaults.doing) }),
    )
    await user.click(
      await screen.findByRole('option', { name: new RegExp(th.tasks.status.defaults.waitData) }),
    )
    await waitFor(() =>
      expect(a.setTaskStatus).toHaveBeenCalledWith({ taskIds: [T.c], statusId: S.waitData }),
    )
    expect(
      await screen.findByText(th.tasks.status.toast.changed(th.tasks.status.defaults.waitData)),
    ).toBeInTheDocument()
  })

  it('without statusesByProject the chip is plain text', () => {
    renderMy({ ...data, statusesByProject: {} })
    expect(
      screen.queryByRole('button', { name: th.tasks.status.menuLabel(th.tasks.status.defaults.doing) }),
    ).toBeNull()
  })

  it('empty', () => {
    renderMy({ groups: [], count: 0, statusesByProject: {} })
    expect(screen.getByText(th.my.empty)).toBeInTheDocument()
  })
})
