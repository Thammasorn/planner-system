// AC-1401 / FR-1421…1422 (plan/m11 S3.5): the table is usable with the keyboard alone.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { DatabaseBlockContent } from '../DatabaseBlockView'
import { C, callsOf, COLUMNS, makeApi, O } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/databases', () => ({}))
vi.mock('@/components/editor/RowBody', () => ({ RowBody: () => null }))

const block = () => <DatabaseBlockContent blockId="b1" variant="page" />
const cell = (r: number, c: number) =>
  screen.getByRole('grid').querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)!

afterEach(() => window.history.replaceState(null, '', '/'))

describe('table keyboard (AC-1401)', () => {
  it('adds rows with the keyboard only: new row → name, Tab, pick a status by typing, Tab, typed date, Enter', async () => {
    // ชื่อ · สถานะ · วันที่, no rows (FR-1404 shape)
    const api = makeApi({ columns: COLUMNS.slice(0, 3), rows: [] })
    const user = userEvent.setup()
    renderDb(block(), { api })

    await user.click(screen.getByRole('gridcell', { name: th.database.table.newRow }))
    const title = await screen.findByRole('textbox', { name: 'ชื่อ' })
    expect(title).toHaveFocus()
    await user.keyboard('ความเสี่ยง 1')
    await user.keyboard('{Tab}')
    expect(cell(0, 1)).toHaveFocus()

    await user.keyboard('ก') // type-to-search on a select cell
    const picker = await screen.findByRole('combobox', { name: 'สถานะ' })
    expect(picker).toHaveValue('ก')
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(cell(0, 1)).toHaveFocus())
    await user.keyboard('{Tab}')
    expect(cell(0, 2)).toHaveFocus()

    await user.keyboard('5/11/2569{Enter}') // typed พ.ศ. date; Enter on the last row → a new row
    await waitFor(() => expect(callsOf(api, 'createRows')).toHaveLength(2))
    const rowId = api.db.rows[0]!.id
    expect(callsOf(api, 'updateRow')).toEqual([
      [rowId, { title: 'ความเสี่ยง 1' }, undefined],
      [rowId, { cells: { [C.status]: O.doing } }, undefined],
      [rowId, { cells: { [C.date]: '2026-11-05' } }, undefined],
    ])
    expect(await screen.findByRole('textbox', { name: 'ชื่อ' })).toHaveFocus()
  })

  it('arrows move, Enter edits, Esc cancels, Delete clears, typing replaces a number', async () => {
    const api = makeApi()
    const user = userEvent.setup()
    renderDb(block(), { api })
    cell(0, 0).focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}') // → ผลกระทบ (NUMBER)
    expect(cell(0, 3)).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(cell(1, 3)).toHaveFocus()

    await user.keyboard('{Enter}')
    const input = screen.getByRole('textbox', { name: 'ผลกระทบ' })
    expect(input).toHaveValue('80000')
    await user.keyboard('{Escape}')
    expect(cell(1, 3)).toHaveFocus()
    expect(callsOf(api, 'updateRow')).toHaveLength(0)

    await user.keyboard('1') // type-to-replace
    expect(screen.getByRole('textbox', { name: 'ผลกระทบ' })).toHaveValue('1')
    await user.keyboard(',500{Enter}')
    expect(callsOf(api, 'updateRow').at(-1)).toEqual(['r2', { cells: { [C.num]: '1500' } }, undefined])

    await user.keyboard('{Delete}')
    expect(callsOf(api, 'updateRow').at(-1)).toEqual(['r2', { cells: { [C.num]: null } }, undefined])
  })

  it('an invalid number keeps the editor open with the error', async () => {
    const user = userEvent.setup()
    renderDb(block(), { api: makeApi() })
    cell(0, 3).focus()
    await user.keyboard('abc{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent(th.database.cells.invalidNumber)
    expect(screen.getByRole('textbox', { name: 'ผลกระทบ' })).toBeInTheDocument()
  })

  it('Space on a title opens the row panel (?db=&row=); Space on a checkbox toggles it', async () => {
    const api = makeApi()
    const user = userEvent.setup()
    renderDb(block(), { api })
    cell(0, 4).focus() // ปิดแล้ว (CHECKBOX)
    await user.keyboard(' ')
    expect(callsOf(api, 'updateRow').at(-1)).toEqual(['r1', { cells: { [C.done]: true } }, undefined])
    cell(0, 0).focus()
    await user.keyboard(' ')
    expect(new URLSearchParams(window.location.search).get('row')).toBe('r1')
    expect(await screen.findByTestId('db-row-panel')).toBeInTheDocument()
  })

  it('Delete with selected rows deletes them; Esc clears the selection', async () => {
    const api = makeApi()
    const user = userEvent.setup()
    renderDb(block(), { api })
    const rows = within(screen.getByRole('grid'))
      .getAllByRole('row')
      .filter((r) => r.hasAttribute('data-row-id'))
    await user.click(within(rows[1]!).getByRole('checkbox'))
    cell(0, 0).focus()
    await user.keyboard('{Escape}')
    expect(screen.queryByText(th.database.table.selected(1))).not.toBeInTheDocument()
    await user.click(within(rows[1]!).getByRole('checkbox'))
    cell(0, 0).focus()
    await user.keyboard('{Delete}')
    expect(callsOf(api, 'deleteRows')).toEqual([[['r2']]])
  })

  it('Alt+Shift+↓ moves a row without sorts (keyboard alternative to the handle)', async () => {
    const api = makeApi()
    const user = userEvent.setup()
    renderDb(block(), { api })
    cell(0, 0).focus()
    await user.keyboard('{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}')
    expect(callsOf(api, 'updateRow').at(-1)).toEqual(['r1', { move: { afterRowId: 'r2' } }, undefined])
  })
})
