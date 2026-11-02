import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CurrentUserContext } from '@/hooks/useCurrentUser'
import { th } from '@/i18n/th'
import type { MyBucketTask, TeamTasksResponse } from '@/lib/contracts/tasks'
import { qk } from '@/lib/query-keys'
import { WORKER } from '../pages/render.test.helper'
import { PID, S, STATUSES, T } from './fixtures.test.data'
import { ok, renderTasks } from './render.test.helper'
import { MyTasks, MyTasksView, type MyTasksData } from './MyTasks'

const a = vi.hoisted(() => ({
  completeTask: vi.fn(),
  revertTaskStatus: vi.fn(),
  setTaskStatus: vi.fn(),
  push: vi.fn(),
  getJson: vi.fn(),
  invalidateLoad: vi.fn(),
}))
vi.mock('@/server/actions/tasks', () => ({
  completeTask: a.completeTask,
  revertTaskStatus: a.revertTaskStatus,
  setTaskStatus: a.setTaskStatus,
  uncompleteTask: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: a.push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
vi.mock('@/lib/api', () => ({ getJson: a.getJson }))
vi.mock('@/lib/invalidate', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/invalidate')>()
  return {
    ...orig,
    invalidateLoad: (...args: Parameters<typeof orig.invalidateLoad>) => {
      a.invalidateLoad(...args)
      return orig.invalidateLoad(...args)
    },
  }
})
vi.mock('./board/TaskBoard', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./board/TaskBoard')>()
  return { ...orig, TaskBoard: () => <div data-testid="task-board" /> }
})

const CRM = '77777777-7777-4777-8777-777777777777'
const POS = { id: PID, name: 'POS Upgrade', color: '#B45309', certainty: 'CONFIRMED' as const }
const CRMP = { id: CRM, name: 'CRM Migration', color: '#2F5597', certainty: 'TENTATIVE' as const }

const uat: MyBucketTask = {
  id: T.c,
  projectId: PID,
  project: POS,
  name: 'ทำ UAT + คู่มือหน้าร้าน',
  parentName: null,
  startDate: null,
  dueDate: '2026-10-16',
  status: STATUSES[1]!,
  hasBody: false,
  firstWeek: '2026-09-28',
  plannedCd: 250,
}
const automation: MyBucketTask = {
  id: T.e,
  projectId: CRM,
  project: CRMP,
  name: 'ตั้งค่า automation',
  parentName: 'ระบบ CRM',
  startDate: null,
  dueDate: null,
  status: { ...STATUSES[0]!, projectId: CRM } as MyBucketTask['status'],
  hasBody: true,
  firstWeek: '2026-10-12',
  plannedCd: 300,
}

// Ivy's golden /my on 2026-09-30 (e2e W9)
const data: MyTasksData = {
  today: '2026-09-30',
  count: 1,
  buckets: [
    { key: 'THIS_WEEK', tasks: [uat] },
    { key: 'NEXT_WEEK', tasks: [] },
    { key: 'LATER', tasks: [automation] },
    { key: 'UNPLANNED', tasks: [] },
  ],
  statusesByProject: { [PID]: STATUSES, [CRM]: STATUSES.map((s) => ({ ...s, projectId: CRM })) },
}

function renderMy(d: MyTasksData = data) {
  return renderTasks(<MyTasks />, { seed: (qc) => qc.setQueryData(qk.myTasks(), d) })
}
const sections = () => screen.getAllByRole('region').filter((r) => r.dataset.myBucket !== undefined)

beforeEach(() => {
  window.history.replaceState(null, '', '/my')
  a.getJson.mockReset()
  a.getJson.mockImplementation(() => new Promise(() => {}))
  a.invalidateLoad.mockClear()
})

describe('MyTasks buckets (FR-1009, X22, M9-D17)', () => {
  it('sections in bucket order with Ivy’s golden content; UNPLANNED hidden when empty', () => {
    renderMy()
    expect(sections().map((s) => s.dataset.myBucket)).toEqual(['THIS_WEEK', 'NEXT_WEEK', 'LATER'])
    const [thisWeek, next, later] = sections()
    expect(within(thisWeek!).getByRole('heading', { level: 2 })).toHaveTextContent(th.my.buckets.THIS_WEEK)
    expect(within(thisWeek!).getByText('ทำ UAT + คู่มือหน้าร้าน')).toBeInTheDocument()
    expect(within(thisWeek!).getByText(th.my.planned('2.50'))).toBeInTheDocument()
    expect(within(thisWeek!).queryByText(/เริ่มสัปดาห์/)).toBeNull()
    expect(within(next!).getByText(th.my.emptyBucket)).toBeInTheDocument()
    expect(within(later!).getByText('ตั้งค่า automation')).toBeInTheDocument()
    expect(within(later!).getByText(th.my.fromWeek('12/10'))).toBeInTheDocument()
    expect(within(later!).getByText(th.my.inParent('ระบบ CRM'))).toBeInTheDocument()
    expect(within(thisWeek!).getByText(th.my.due('16 ต.ค. 2569'))).toBeInTheDocument()
  })

  it('ticking calls completeTask, pushes the undo entry and invalidates load', async () => {
    const user = userEvent.setup()
    a.completeTask.mockReturnValue(
      ok({
        projectId: PID,
        statusId: S.done,
        changed: [{ taskId: T.c, previous: { statusId: S.doing, completedOn: null } }],
        openDescendantIds: [],
        released: null,
      }),
    )
    renderMy()
    await user.click(
      screen.getByRole('checkbox', { name: th.tasks.completeCheckbox('ทำ UAT + คู่มือหน้าร้าน') }),
    )
    await waitFor(() => expect(a.completeTask).toHaveBeenCalledWith({ taskIds: [T.c] }))
    expect(await screen.findByText(th.tasks.toast.completed)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.undo.undo })).toBeInTheDocument()
    // optimistic removal from its bucket
    expect(screen.queryByText('ทำ UAT + คู่มือหน้าร้าน')).toBeNull()
    await waitFor(() => expect(a.invalidateLoad).toHaveBeenCalled())
  })

  it('BR-52: ticking a task with future load shows the released load', async () => {
    const user = userEvent.setup()
    a.completeTask.mockReturnValue(
      ok({
        projectId: PID,
        statusId: S.done,
        changed: [{ taskId: T.c, previous: { statusId: S.doing, completedOn: null } }],
        openDescendantIds: [],
        released: { cd: 1000, weeks: 4 },
      }),
    )
    renderMy()
    await user.click(
      screen.getByRole('checkbox', { name: th.tasks.completeCheckbox('ทำ UAT + คู่มือหน้าร้าน') }),
    )
    expect(await screen.findByText(th.tasks.toast.released('10.0', 4))).toBeInTheDocument()
  })

  it('the name opens the task in its project; ↗ is the task page; 📄 only with a body', async () => {
    renderMy()
    const [thisWeek, , later] = sections()
    expect(within(thisWeek!).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute(
      'href',
      `/t/${T.c}`,
    )
    expect(within(later!).getByRole('img', { name: th.tasks.hasBody })).toBeInTheDocument()
    expect(within(thisWeek!).queryByRole('img', { name: th.tasks.hasBody })).toBeNull()
    await userEvent.click(screen.getByRole('link', { name: 'ทำ UAT + คู่มือหน้าร้าน' }))
    expect(a.push).toHaveBeenCalledWith(`/projects/${PID}/tasks?task=${T.c}`)
  })

  it('M6.1-D25: the status chip opens the menu; picking calls setTaskStatus', async () => {
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
  })

  it('without statusesByProject the chip is plain text', () => {
    const { statusesByProject: _s, ...rest } = data
    renderMy(rest)
    expect(
      screen.queryByRole('button', { name: th.tasks.status.menuLabel(th.tasks.status.defaults.doing) }),
    ).toBeNull()
  })

  it('empty', () => {
    renderMy({ ...data, count: 0, buckets: data.buckets.map((b) => ({ ...b, tasks: [] })) })
    expect(screen.getByText(th.my.empty)).toBeInTheDocument()
  })
})

describe('MyTasksView (FR-667, M9-D15)', () => {
  const team: TeamTasksResponse = {
    cards: [],
    projects: [],
    statusesByProject: {},
    milestonesByProject: {},
    nextCursor: null,
  }

  function renderView() {
    return renderTasks(
      <CurrentUserContext value={WORKER}>
        <MyTasksView />
      </CurrentUserContext>,
      { seed: (qc) => qc.setQueryData(qk.myTasks(), data) },
    )
  }

  it('?view=board renders TeamTasks fixed to me as a TaskBoard', async () => {
    window.history.replaceState(null, '', '/my?view=board')
    a.getJson.mockImplementation((url: string) =>
      url.startsWith('/api/tasks?')
        ? Promise.resolve({
            ...team,
            cards: [
              {
                id: T.c,
                projectId: PID,
                name: 'x',
                parentPath: [],
                status: STATUSES[0]!,
                assigneeIds: [WORKER.id],
                dueDate: null,
                certainty: 'CONFIRMED',
                completed: false,
                blockers: { open: 0, total: 0 },
                hasBody: false,
                milestoneId: null,
              },
            ],
            projects: [{ id: PID, name: 'POS Upgrade', color: '#B45309' }],
          })
        : new Promise(() => {}),
    )
    renderView()
    expect(await screen.findByTestId('task-board')).toBeInTheDocument()
    expect(a.getJson.mock.calls.some((c) => String(c[0]).includes(`userId=${WORKER.id}`))).toBe(true)
  })

  it('the switch writes ?view= and back to the buckets removes it', async () => {
    const user = userEvent.setup()
    renderView()
    expect(sections()).not.toHaveLength(0)
    await user.click(screen.getByRole('button', { name: th.my.view.list }))
    expect(window.location.search).toBe('?view=list')
    await user.click(screen.getByRole('button', { name: th.my.view.weeks }))
    expect(window.location.search).toBe('')
  })
})
