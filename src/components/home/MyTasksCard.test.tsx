import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { statusToastMessage } from '@/components/tasks/statusToast'
import { th } from '@/i18n/th'
import type { HomeResponse } from '@/lib/contracts/home'
import { HomeDashboard } from './HomeDashboard'
import { homeResponse, POS, TASK_POS } from './test-data.test.helper'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/home' }))
const actions = vi.hoisted(() => ({
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  revertTaskStatus: vi.fn(),
}))
vi.mock('@/server/actions/tasks', () => actions)
const api = vi.hoisted(() => {
  const home: { current: unknown } = { current: null }
  return { home }
})
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getJson: () => Promise.resolve(api.home.current),
}))

const PREV_STATUS = '00000000-0000-4000-8000-00000000e001'
const NAME = 'ปรับปรุงระบบ POS หน้าร้าน'
const result = (released: { cd: number; weeks: number } | null) => ({
  ok: true as const,
  projectId: POS,
  statusId: '00000000-0000-4000-8000-00000000e009',
  changed: [{ taskId: TASK_POS, previous: { statusId: PREV_STATUS, completedOn: null } }],
  openDescendantIds: [],
  released,
})
const withoutTask = (): HomeResponse => {
  const d = homeResponse()
  return { ...d, myTasks: { ...d.myTasks, items: d.myTasks.items.filter((t) => t.id !== TASK_POS) } }
}
const box = () => screen.getByRole('checkbox', { name: th.home.myTasks.complete(NAME) })
const row = () => box().closest('li') as HTMLElement

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset()
  api.home.current = homeResponse()
})

async function renderHome() {
  const user = userEvent.setup()
  const utils = renderTasks(<HomeDashboard />, { seed: (qc) => qc.setQueryData(['home'], api.home.current) })
  await screen.findByRole('heading', { level: 2, name: th.home.myTasks.title })
  return { user, ...utils }
}

describe('MyTasksCard tick (FR-1101a, M10-D33, BR-52)', () => {
  it('tick → completeTask; struck through and checked at once; BR-52 toast; leaves the card after the refetch', async () => {
    let resolve: (v: unknown) => void = () => {}
    actions.completeTask.mockReturnValue(new Promise((r) => (resolve = r)))
    const { user, qc } = await renderHome()
    expect(within(row()).getByRole('link', { name: NAME })).toHaveAttribute(
      'href',
      `/projects/${POS}/tasks?task=${TASK_POS}`,
    )
    expect(row()).toHaveTextContent(th.home.myTasks.planned('2.5'))
    qc.setDefaultOptions({ queries: { staleTime: 0, retry: false } })
    await user.click(box())
    expect(actions.completeTask).toHaveBeenCalledWith({ taskIds: [TASK_POS] })
    expect(box()).toBeChecked()
    expect(within(row()).getByRole('link', { name: NAME })).toHaveStyle({ textDecoration: 'line-through' })
    api.home.current = withoutTask()
    resolve(result({ cd: 1875, weeks: 5 }))
    const text = statusToastMessage({ released: { cd: 1875, weeks: 5 } }, th.tasks.toast.completed)
    expect(text).toBe('ปลดภาระ 18.8 วัน ในอีก 5 สัปดาห์')
    expect(await screen.findByText(text)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: th.home.myTasks.complete(NAME) })).toBeNull(),
    )
  })

  it('the undo entry reverts to the previous status and the task comes back', async () => {
    actions.completeTask.mockResolvedValue(result(null))
    actions.revertTaskStatus.mockResolvedValue({ ...result(null), statusId: null, changed: [] })
    const { user, qc } = await renderHome()
    qc.setDefaultOptions({ queries: { staleTime: 0, retry: false } })
    api.home.current = withoutTask()
    await user.click(box())
    expect(await screen.findByText(th.tasks.toast.completed)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: th.home.myTasks.complete(NAME) })).toBeNull(),
    )
    api.home.current = homeResponse()
    await user.click(screen.getByRole('button', { name: th.undo.undo }))
    expect(actions.revertTaskStatus).toHaveBeenCalledWith({
      items: [{ taskId: TASK_POS, statusId: PREV_STATUS, completedOn: null }],
    })
    await waitFor(() => expect(box()).not.toBeChecked())
  })

  it('unticking a still-visible ticked row calls uncompleteTask', async () => {
    actions.completeTask.mockResolvedValue(result(null))
    actions.uncompleteTask.mockResolvedValue({ ...result(null), released: null })
    const { user } = await renderHome() // the refetch still lists the task (staleTime ∞ in the harness)
    await user.click(box())
    await waitFor(() => expect(actions.completeTask).toHaveBeenCalled())
    await screen.findByText(th.tasks.toast.completed)
    expect(box()).toBeChecked()
    await user.click(box())
    expect(actions.uncompleteTask).toHaveBeenCalledWith({ taskIds: [TASK_POS] })
    await waitFor(() => expect(box()).not.toBeChecked())
    expect(await screen.findByText(th.tasks.toast.uncompleted)).toBeInTheDocument()
  })

  it('a failed tick rolls back and shows the error', async () => {
    actions.completeTask.mockResolvedValue({ ok: false, code: 'CONFLICT', message: 'บันทึกไม่สำเร็จ' })
    const { user } = await renderHome()
    await user.click(box())
    expect(await screen.findByText('บันทึกไม่สำเร็จ')).toBeInTheDocument()
    expect(box()).not.toBeChecked()
  })

  it('no tasks → the empty state with the ⌘K hint (no quick add)', async () => {
    api.home.current = { ...homeResponse(), myTasks: { items: [], more: 0 } }
    await renderHome()
    expect(screen.getByText(th.home.myTasks.empty)).toBeInTheDocument()
    expect(screen.getByText(th.home.myTasks.hint)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('more > 0 → "และอีก N งาน"; the footer link goes to /my', async () => {
    api.home.current = { ...homeResponse(), myTasks: { ...homeResponse().myTasks, more: 3 } }
    await renderHome()
    expect(screen.getByText(th.home.myTasks.more(3))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: th.home.myTasks.seeAll })).toHaveAttribute('href', '/my')
    expect(screen.getByRole('link', { name: th.home.myTasks.seeAll })).toHaveStyle({ textDecoration: 'none' })
  })
})
