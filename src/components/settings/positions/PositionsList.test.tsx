import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { ToasterHost } from '@/components/providers/ToasterHost'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { th } from '@/i18n/th'
import type { DeletedPosition, PositionRow } from '@/lib/contracts/users'
import { renderWithProviders } from '../../../../tests/helpers/render'
import { PositionsList } from './PositionsList'

const mocks = vi.hoisted(() => ({
  createPosition: vi.fn<(i: { name: string }) => Promise<unknown>>(),
  renamePosition: vi.fn<(i: { id: string; name: string }) => Promise<unknown>>(),
  movePosition: vi.fn<(i: { id: string; direction: 'up' | 'down' }) => Promise<unknown>>(),
  deletePosition: vi.fn<(i: { id: string }) => Promise<unknown>>(),
  restorePosition: vi.fn<(i: DeletedPosition) => Promise<unknown>>(),
}))
vi.mock('@/server/actions/positions', () => mocks)

const rows: PositionRow[] = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Project Manager', position: 'a0', userCount: 1 },
  { id: 'a1b2c3d4-0000-4000-8000-000000000002', name: 'QA', position: 'a1', userCount: 1 },
  { id: 'a1b2c3d4-0000-4000-8000-000000000003', name: 'DevOps', position: 'a2', userCount: 0 },
]
const devops = rows[2]!

function setup(list: PositionRow[] = rows) {
  return renderWithProviders(
    <UndoProvider>
      <PositionsList rows={list} />
      <ToasterHost />
    </UndoProvider>,
  )
}

const itemOf = (name: string) =>
  screen.getAllByRole('listitem').find((li) => within(li).queryByText(name, { exact: true }) !== null)!

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => {}
})
afterEach(() => {
  toast.dismiss()
})
beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.createPosition.mockResolvedValue({ ok: true, id: 'a1b2c3d4-0000-4000-8000-000000000009' })
  mocks.renamePosition.mockResolvedValue({ ok: true })
  mocks.movePosition.mockResolvedValue({ ok: true })
  mocks.restorePosition.mockResolvedValue({ ok: true })
  mocks.deletePosition.mockResolvedValue({
    ok: true,
    deleted: { id: devops.id, name: devops.name, position: devops.position },
  })
})

describe('PositionsList', () => {
  it('U-POSL-01 delete calls the action, shows an undo toast; เลิกทำ restores the returned row', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(itemOf('DevOps')).getByRole('button', { name: th.common.delete }))
    expect(mocks.deletePosition).toHaveBeenCalledWith({ id: devops.id })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText(th.positions.deleted('DevOps'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.undo.undo }))
    await vi.waitFor(() =>
      expect(mocks.restorePosition).toHaveBeenCalledWith({ id: devops.id, name: 'DevOps', position: 'a2' }),
    )
  })

  it('U-POSL-02 IN_USE shows the error toast and pushes nothing', async () => {
    const user = userEvent.setup()
    mocks.deletePosition.mockResolvedValue({ ok: false, code: 'IN_USE', message: th.positions.inUse(1) })
    setup()
    await user.click(within(itemOf('QA')).getByRole('button', { name: th.common.delete }))
    expect(await screen.findByText(th.positions.inUse(1))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.undo.undo })).not.toBeInTheDocument()
    expect(await screen.findByText('QA', { exact: true })).toBeInTheDocument() // optimistic removal rolled back
  })

  it('U-POSL-03 the first row cannot move up and the last cannot move down', async () => {
    const user = userEvent.setup()
    setup()
    expect(within(itemOf('Project Manager')).getByRole('button', { name: th.common.moveUp })).toBeDisabled()
    expect(within(itemOf('DevOps')).getByRole('button', { name: th.common.moveDown })).toBeDisabled()
    await user.click(within(itemOf('DevOps')).getByRole('button', { name: th.common.moveUp }))
    expect(mocks.movePosition).toHaveBeenCalledWith({ id: devops.id, direction: 'up' })
  })

  it('U-POSL-04 rename inline: Enter saves, Esc cancels', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(itemOf('DevOps')).getByRole('button', { name: th.positions.rename }))
    const input = screen.getByRole('textbox', { name: th.positions.rename })
    await user.clear(input)
    await user.type(input, 'Platform{Enter}')
    expect(mocks.renamePosition).toHaveBeenCalledWith({ id: devops.id, name: 'Platform' })

    await user.click(within(itemOf('QA')).getByRole('button', { name: th.positions.rename }))
    await user.type(screen.getByRole('textbox', { name: th.positions.rename }), 'x{Escape}')
    expect(mocks.renamePosition).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox', { name: th.positions.rename })).not.toBeInTheDocument()
  })

  it('U-POSL-05 add with Enter; an empty name shows nameRequired; server fieldErrors.name shows too', async () => {
    const user = userEvent.setup()
    setup()
    const input = screen.getByRole('textbox', { name: th.positions.namePlaceholder })
    await user.type(input, '{Enter}')
    expect(await screen.findByText(th.positions.nameRequired)).toBeInTheDocument()
    expect(mocks.createPosition).not.toHaveBeenCalled()

    await user.type(input, 'Data{Enter}')
    expect(mocks.createPosition).toHaveBeenCalledWith({ name: 'Data' })
    await vi.waitFor(() => expect(input).toHaveValue(''))

    mocks.createPosition.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      message: th.positions.nameTaken,
      fieldErrors: { name: [th.positions.nameTaken] },
    })
    await user.type(input, 'QA')
    await user.click(screen.getByRole('button', { name: th.positions.add }))
    expect(await screen.findByText(th.positions.nameTaken)).toBeInTheDocument()
  })

  it('U-POSL-07 closing the inline rename (Enter or Esc) returns focus to that row’s rename button', async () => {
    const user = userEvent.setup()
    setup()
    const renameQa = within(itemOf('QA')).getByRole('button', { name: th.positions.rename })
    await user.click(renameQa)
    await user.keyboard('x{Escape}')
    expect(screen.queryByRole('textbox', { name: th.positions.rename })).not.toBeInTheDocument()
    expect(renameQa).toHaveFocus()

    await user.keyboard('{Enter}') // the focused rename button reopens the field
    const input = screen.getByRole('textbox', { name: th.positions.rename })
    await user.clear(input)
    await user.type(input, 'Tester{Enter}')
    expect(mocks.renamePosition).toHaveBeenCalledWith({ id: rows[1]!.id, name: 'Tester' })
    expect(renameQa).toHaveFocus()

    // A validation error keeps the field open and focused.
    await user.click(within(itemOf('DevOps')).getByRole('button', { name: th.positions.rename }))
    await user.clear(screen.getByRole('textbox', { name: th.positions.rename }))
    await user.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: th.positions.rename })).toHaveFocus()
  })

  it('U-POSL-08 after a delete focus moves to the next row, else the previous one, else the add field', async () => {
    const user = userEvent.setup()
    const deleteIn = (name: string) => within(itemOf(name)).getByRole('button', { name: th.common.delete })

    const first = setup()
    await user.click(deleteIn('QA'))
    expect(deleteIn('DevOps')).toHaveFocus()
    first.unmount()

    const second = setup()
    await user.click(deleteIn('DevOps'))
    expect(deleteIn('QA')).toHaveFocus()
    second.unmount()

    setup([devops])
    await user.click(deleteIn('DevOps'))
    expect(screen.getByRole('textbox', { name: th.positions.namePlaceholder })).toHaveFocus()
  })

  it('U-POSL-09 a keyboard move keeps focus on the moved row (pressed direction, else the opposite one)', async () => {
    const user = userEvent.setup()
    const pending = Promise.withResolvers<unknown>()
    mocks.movePosition.mockReturnValue(pending.promise)
    const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
    const button = (name: string, label: string) => within(itemOf(name)).getByRole('button', { name: label })
    // Browsers blur a focused element whose subtree is re-inserted (insertBefore = remove + insert); jsdom keeps
    // the focus, so emulate the browser. React's commit restores the prior focus after the reorder — this guards
    // that the move path keeps relying on (and does not fight) that restore.
    const insertBefore = Node.prototype.insertBefore
    const spy = vi.spyOn(Node.prototype, 'insertBefore').mockImplementation(function <T extends Node>(
      this: Node,
      node: T,
      child: Node | null,
    ): T {
      const active = document.activeElement
      if (node.isConnected && active instanceof HTMLElement && node.contains(active)) active.blur()
      return insertBefore.call(this, node, child) as T
    })
    onTestFinished(() => spy.mockRestore())

    const first = setup()
    button('Project Manager', th.common.moveDown).focus()
    await user.keyboard('{Enter}')
    expect(mocks.movePosition).toHaveBeenCalledWith({ id: rows[0]!.id, direction: 'down' })
    expect(names()).toEqual(['QA', 'Project Manager', 'DevOps']) // optimistic swap re-inserts the moved <li>
    expect(button('Project Manager', th.common.moveDown)).toHaveFocus()
    // The action settles without new props here, so the row moves back (as on a failed move): focus follows it.
    await act(async () => {
      pending.resolve({ ok: true })
      await pending.promise
    })
    await vi.waitFor(() => expect(names()).toEqual(['Project Manager', 'QA', 'DevOps']))
    expect(button('Project Manager', th.common.moveDown)).toHaveFocus()
    first.unmount()

    // Second row up → it becomes first, its move-up button is disabled → focus falls back to move-down.
    mocks.movePosition.mockReturnValue(new Promise(() => {}))
    setup()
    button('QA', th.common.moveUp).focus()
    await user.keyboard('{Enter}')
    expect(names()).toEqual(['QA', 'Project Manager', 'DevOps'])
    expect(button('QA', th.common.moveUp)).toBeDisabled()
    expect(button('QA', th.common.moveDown)).toHaveFocus()
  })

  it('U-POSL-06 shows the empty state and user counts', () => {
    const { unmount } = setup()
    expect(within(itemOf('QA')).getByText(th.positions.userCount(1))).toBeInTheDocument()
    unmount()
    setup([])
    expect(screen.getByText(th.positions.empty)).toBeInTheDocument()
  })
})
