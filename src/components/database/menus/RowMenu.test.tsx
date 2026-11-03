// FR-1424a (owner request 2026-11-03): the row context menu — right-click a row, click its ⠿ handle, Shift+F10 /
// ContextMenu on a cell; เปิด / เปิดเป็นหน้า / ทำสำเนาแถว / ลบแถว ("ลบ N แถว" for a selection); read-only viewers get
// the two open items; text fields keep the browser menu; Esc closes and focus returns to the row. The delete toast
// "ลบ N แถว · เลิกทำ" + Cmd+Z come from deleteRows itself (useDbMutations.test.tsx).
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { DatabaseBlockContent } from '../DatabaseBlockView'
import { callsOf, makeApi } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'
import { inTextField, isMenuKey } from './RowMenu'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/databases', () => ({}))
vi.mock('@/components/editor/RowBody', () => ({ RowBody: () => null }))

const t = th.database.rowMenu
const block = () => <DatabaseBlockContent blockId="b1" variant="page" />
const grid = () => screen.getByRole('grid', { name: th.database.table.label })
const dataRows = () =>
  within(grid())
    .getAllByRole('row')
    .filter((r) => r.hasAttribute('data-row-id'))
const menuItems = () =>
  within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .map((m) => m.textContent)

describe('row context menu', () => {
  it('right-click a row opens the app menu (default prevented); ลบแถว deletes that row at once', async () => {
    const api = makeApi()
    renderDb(block(), { api })
    const cell = within(dataRows()[1]!).getAllByRole('gridcell')[1]!
    const ev = fireEvent.contextMenu(cell, { clientX: 300, clientY: 200 })
    expect(ev).toBe(false) // preventDefault: no browser menu
    expect(menuItems()).toEqual([t.open, t.openAsPage, t.duplicate, t.delete])
    await userEvent.click(screen.getByRole('menuitem', { name: t.delete }))
    expect(callsOf(api, 'deleteRows')).toEqual([[['r2']]])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(dataRows()).toHaveLength(4)
  })

  it('a row inside a checkbox selection offers “ลบ N แถว” for the whole selection', async () => {
    const api = makeApi()
    const user = userEvent.setup()
    renderDb(block(), { api })
    await user.click(within(dataRows()[0]!).getByRole('checkbox'))
    await user.click(within(dataRows()[2]!).getByRole('checkbox'))
    fireEvent.contextMenu(within(dataRows()[2]!).getAllByRole('gridcell')[0]!, { clientX: 10, clientY: 10 })
    await user.click(screen.getByRole('menuitem', { name: t.deleteMany(2) }))
    expect(callsOf(api, 'deleteRows')).toEqual([[['r1', 'r3']]])
    // a row outside the selection acts on itself only
    await user.click(within(dataRows()[0]!).getByRole('checkbox'))
    fireEvent.contextMenu(within(dataRows()[1]!).getAllByRole('gridcell')[0]!, { clientX: 10, clientY: 10 })
    expect(screen.getByRole('menuitem', { name: t.delete })).toBeInTheDocument()
  })

  it('clicking the ⠿ handle opens the menu under it; เปิด opens the row panel; ทำสำเนาแถว copies title + cells below', async () => {
    const api = makeApi()
    const user = userEvent.setup()
    renderDb(block(), { api })
    const handle = within(dataRows()[0]!).getByRole('button', { name: th.database.table.dragRow })
    expect(handle).toHaveAttribute('aria-haspopup', 'menu')
    await user.click(handle)
    const src = api.db.rows[0]!
    await user.click(screen.getByRole('menuitem', { name: t.duplicate }))
    expect(callsOf(api, 'createRows')[0]![0]).toEqual([
      { title: src.title, cells: src.cells, afterRowId: src.id },
    ])
    await user.click(handle)
    expect(screen.getByRole('menuitem', { name: t.openAsPage })).toHaveAttribute('href', `/r/${src.id}`)
  })

  it('Shift+F10 / ContextMenu on a focused cell opens it; Esc closes and focus returns to the cell', async () => {
    renderDb(block(), { api: makeApi() })
    const cell = within(dataRows()[0]!).getAllByRole('gridcell')[1]!
    cell.focus()
    fireEvent.keyDown(cell, { key: 'F10', code: 'F10', shiftKey: true })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // the browser's own keyboard `contextmenu` that follows does not reopen / move it
    fireEvent.contextMenu(cell)
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(cell).toHaveFocus())
    fireEvent.keyDown(cell, { key: 'ContextMenu', code: 'ContextMenu' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('read-only viewers get เปิด / เปิดเป็นหน้า only', () => {
    renderDb(block(), { api: makeApi({ canEdit: false }, { canEdit: false }) })
    fireEvent.contextMenu(within(dataRows()[0]!).getAllByRole('gridcell')[0]!, { clientX: 5, clientY: 5 })
    expect(menuItems()).toEqual([t.open, t.openAsPage])
  })

  it('an open cell editor keeps the browser menu (copy / paste)', async () => {
    renderDb(block(), { api: makeApi() })
    const title = within(dataRows()[0]!).getAllByRole('gridcell')[0]!
    await userEvent.click(title)
    const input = within(title).getByRole('textbox')
    expect(fireEvent.contextMenu(input, { clientX: 5, clientY: 5 })).toBe(true)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('isMenuKey: Shift+F10 and the ContextMenu key only', () => {
    expect(isMenuKey({ key: 'F10', shiftKey: true })).toBe(true)
    expect(isMenuKey({ key: 'ContextMenu', shiftKey: false })).toBe(true)
    expect(isMenuKey({ key: 'F10', shiftKey: false })).toBe(false)
  })
})

describe('inTextField (the block inside the page editor)', () => {
  it('a cell inside a contenteditable=false node view of the editor is not a text field; inputs are', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<div role="textbox" contenteditable="true"><div contenteditable="false"><div role="row"><span id="cell">100</span><input id="inp" /></div></div><p id="para">text</p></div>'
    document.body.append(root)
    expect(inTextField(root.querySelector('#cell'))).toBe(false)
    expect(inTextField(root.querySelector('#inp'))).toBe(true)
    expect(inTextField(root.querySelector('#para'))).toBe(true)
    root.remove()
  })
})
