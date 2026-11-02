// FR-1411…1416 (plan/m11 S3.6): the column header menu, options editor and number settings.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { C, callsOf, makeApi, O, TABLE_VIEW } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'
import { ColumnMenu } from './ColumnMenu'

vi.mock('@/server/actions/databases', () => ({}))

function open(columnId: string, extra: { onFilter?: (id: string) => void } = {}) {
  const api = makeApi()
  const onClose = vi.fn()
  renderDb(
    <ColumnMenu
      anchorEl={document.body}
      columnId={columnId}
      view={TABLE_VIEW}
      onClose={onClose}
      {...extra}
    />,
    { api },
  )
  return { api, onClose }
}
const t = th.database.columnMenu

describe('ColumnMenu', () => {
  it('TITLE: type change disabled with the reason; no hide / duplicate / delete (FR-1410)', () => {
    open(C.title)
    const item = screen.getByRole('menuitem', { name: new RegExp(t.changeType) })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveTextContent(th.database.errors.titleColumn)
    expect(screen.queryByRole('menuitem', { name: t.hide })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: t.duplicate })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: t.delete })).not.toBeInTheDocument()
  })

  it('renames with Enter', async () => {
    const { api, onClose } = open(C.note)
    const name = screen.getByRole('textbox', { name: t.rename })
    await userEvent.clear(name)
    await userEvent.type(name, 'รายละเอียด{Enter}')
    expect(callsOf(api, 'updateColumn')).toEqual([[C.note, { name: 'รายละเอียด' }]])
    expect(onClose).toHaveBeenCalled()
  })

  it('changes the type without a dialog', async () => {
    const { api } = open(C.note)
    await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(t.changeType) }))
    await userEvent.click(screen.getByRole('menuitem', { name: th.database.types.NUMBER }))
    expect(callsOf(api, 'changeColumnType')).toEqual([[C.note, 'NUMBER']])
    expect(screen.queryByRole('dialog', { name: /ยืนยัน/ })).not.toBeInTheDocument()
  })

  it('sort ↓ sets the view sorts to this single key; hide adds to hidden; filter asks the toolbar', async () => {
    const onFilter = vi.fn()
    const { api } = open(C.num, { onFilter })
    await userEvent.click(screen.getByRole('menuitem', { name: t.sortDesc }))
    expect(callsOf(api, 'updateView')[0]).toEqual([
      TABLE_VIEW.id,
      { config: { sorts: [{ columnId: C.num, dir: 'DESC' }] } },
      undefined,
    ])
  })

  it.each([
    [t.hide, 'updateView', [TABLE_VIEW.id, { config: { hiddenColumnIds: [C.num] } }, undefined]],
    [t.insertRight, 'createColumn', ['TEXT', { afterColumnId: C.num }]],
    [t.duplicate, 'duplicateColumn', [C.num]],
    [t.delete, 'deleteColumn', [C.num]],
  ] as const)('%s', async (name, method, args) => {
    const { api } = open(C.num)
    await userEvent.click(screen.getByRole('menuitem', { name }))
    expect(callsOf(api, method)[0]).toEqual(args)
  })

  it('"กรอง" hands the column to the filter menu', async () => {
    const onFilter = vi.fn()
    open(C.status, { onFilter })
    await userEvent.click(screen.getByRole('menuitem', { name: t.filter }))
    expect(onFilter).toHaveBeenCalledWith(C.status)
  })

  it('options: delete one (no dialog), add one, rename', async () => {
    const { api } = open(C.status)
    const editor = screen.getByTestId('db-options-editor')
    await userEvent.click(within(editor).getByRole('button', { name: `${t.deleteOption} เสร็จ` }))
    const [, patch] = callsOf(api, 'updateColumn')[0] as [string, { config: { options: { id: string }[] } }]
    expect(patch.config.options.map((o) => o.id)).toEqual([O.todo, O.doing])
    await userEvent.type(within(editor).getByRole('textbox', { name: t.addOption }), 'รอตรวจ{Enter}')
    expect(callsOf(api, 'addOption')).toEqual([[C.status, 'รอตรวจ']])
  })

  it('number display: decimals and thousands', async () => {
    const { api } = open(C.num)
    await userEvent.click(screen.getByRole('combobox', { name: t.decimals }))
    await userEvent.click(screen.getByRole('option', { name: '2' }))
    expect(callsOf(api, 'updateColumn')[0]).toEqual([C.num, { config: { decimals: 2, thousands: true } }])
    await userEvent.click(screen.getByRole('switch', { name: t.thousands }))
    expect(callsOf(api, 'updateColumn')[1]![1]).toEqual({ config: { decimals: 2, thousands: false } })
  })
})
