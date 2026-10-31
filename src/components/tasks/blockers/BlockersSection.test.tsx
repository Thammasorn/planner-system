import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { buildTaskRows } from '@/lib/tasks/tree'
import { PID, response, T } from '../fixtures.test.data'
import { ok, renderTasks } from '../render.test.helper'
import { BlockerBadge } from './BlockerBadge'
import { BlockersSection } from './BlockersSection'

const a = vi.hoisted(() => ({ addTaskBlocker: vi.fn(), removeTaskBlocker: vi.fn() }))
vi.mock('@/server/actions/task-blockers', () => a)
vi.mock('@/server/actions/tasks', () => ({}))
vi.mock('@/server/actions/assignments', () => ({}))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const EDGE = '44444444-4444-4444-8444-444444444444'

function setup() {
  const data = response()
  // B (child of ออกแบบ) is blocked by งาน C
  data.blockerEdges = [{ id: EDGE, taskId: T.b, blockerTaskId: T.c }]
  data.tasks = data.tasks.map((t) => (t.id === T.b ? { ...t, blockers: { open: 1, total: 1 } } : t))
  const rows = buildTaskRows(data.tasks)
  const task = rows.find((r) => r.id === T.b)!
  renderTasks(<BlockersSection projectId={PID} task={task} rows={rows} data={data} canEdit />, { data })
}

describe('BlockersSection (FR-640–644)', () => {
  it('the picker leaves out self, the parent and existing blockers', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: th.tasks.blockers.add }))
    expect(screen.getByRole('combobox', { name: th.tasks.blockers.pickerLabel })).toHaveFocus()
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['งาน D'])
  })

  it('Esc in the picker, or picking a blocker, gives focus back to "+ เพิ่มงานที่ขวาง"', async () => {
    const user = userEvent.setup()
    a.addTaskBlocker.mockReturnValue(new Promise(() => {}))
    setup()
    await user.click(screen.getByRole('button', { name: th.tasks.blockers.add }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: th.tasks.blockers.add })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: th.tasks.blockers.add }))
    await user.click(await screen.findByRole('option', { name: 'งาน D' }))
    await waitFor(() => expect(a.addTaskBlocker).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: th.tasks.blockers.add })).toHaveFocus())
  })

  it('× removes the blocker with removeTaskBlocker', async () => {
    const user = userEvent.setup()
    a.removeTaskBlocker.mockReturnValue(ok({ projectId: PID, edgeId: EDGE, taskId: T.b, blockerTaskId: T.c }))
    setup()
    await user.click(screen.getByRole('button', { name: th.tasks.blockers.remove('งาน C') }))
    await waitFor(() => expect(a.removeTaskBlocker).toHaveBeenCalledWith({ blockerId: EDGE }))
    expect(await screen.findByText(th.tasks.blockers.toast.removed('งาน C'))).toBeInTheDocument()
  })

  it('× hands focus to the next × in the list (never <body>)', async () => {
    const user = userEvent.setup()
    a.removeTaskBlocker.mockImplementation((v: { blockerId: string }) =>
      ok({ projectId: PID, edgeId: v.blockerId, taskId: T.b, blockerTaskId: T.c }),
    )
    const data = response()
    const EDGE2 = '44444444-4444-4444-8444-444444444445'
    // static props: the list does not shrink here, the hand-off happens before the optimistic removal
    data.blockerEdges = [
      { id: EDGE, taskId: T.b, blockerTaskId: T.c },
      { id: EDGE2, taskId: T.b, blockerTaskId: T.d },
    ]
    const rows = buildTaskRows(data.tasks)
    renderTasks(
      <BlockersSection projectId={PID} task={rows.find((r) => r.id === T.b)!} rows={rows} data={data} canEdit />,
      { data },
    )
    await user.click(screen.getByRole('button', { name: th.tasks.blockers.remove('งาน C') }))
    await waitFor(() => expect(a.removeTaskBlocker).toHaveBeenCalledWith({ blockerId: EDGE }))
    expect(screen.getByRole('button', { name: th.tasks.blockers.remove('งาน D') })).toHaveFocus()
  })

  it('× on the only blocker hands focus to "+ เพิ่มงานที่ขวาง"', async () => {
    const user = userEvent.setup()
    a.removeTaskBlocker.mockReturnValue(ok({ projectId: PID, edgeId: EDGE, taskId: T.b, blockerTaskId: T.c }))
    setup()
    act(() => screen.getByRole('button', { name: th.tasks.blockers.remove('งาน C') }).focus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(a.removeTaskBlocker).toHaveBeenCalledWith({ blockerId: EDGE }))
    expect(screen.getByRole('button', { name: th.tasks.blockers.add })).toHaveFocus()
  })

  it('lists the reverse edges under "กำลังขวาง"', () => {
    const data = response()
    data.blockerEdges = [{ id: EDGE, taskId: T.b, blockerTaskId: T.c }]
    const rows = buildTaskRows(data.tasks)
    renderTasks(
      <BlockersSection
        projectId={PID}
        task={rows.find((r) => r.id === T.c)!}
        rows={rows}
        data={data}
        canEdit
      />,
      { data },
    )
    expect(screen.getByRole('button', { name: 'ย่อย B' })).toBeInTheDocument()
  })
})

describe('BlockerBadge (BR-86)', () => {
  it('waiting: icon + "รอ 1 งาน" and the blocker names on hover', async () => {
    render(<BlockerBadge open={1} total={1} names={['งาน A19']} />)
    const badge = screen.getByText(th.tasks.blockers.badgeWaiting(1))
    await userEvent.hover(badge)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(th.tasks.blockers.badgeTooltip('งาน A19'))
  })

  it('cleared: "ตัวขวางเสร็จแล้ว"; none: nothing', () => {
    const { container, rerender } = render(<BlockerBadge open={0} total={2} />)
    expect(within(container).getByText(th.tasks.blockers.badgeCleared)).toBeInTheDocument()
    rerender(<BlockerBadge open={0} total={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})
