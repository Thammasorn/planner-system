import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderCalendarUi } from '@/components/calendar/render.test.helper'
import { th } from '@/i18n/th'
import type { HolidayDTO } from '@/lib/contracts/holidays'
import { formatThaiDate } from '@/lib/format'
import { HolidaysTable } from './HolidaysTable'

const m = vi.hoisted(() => ({
  createHoliday: vi.fn<(i: unknown) => Promise<unknown>>(),
  updateHoliday: vi.fn<(i: unknown) => Promise<unknown>>(),
  deleteHoliday: vi.fn<(i: unknown) => Promise<unknown>>(),
  restoreHoliday: vi.fn<(i: unknown) => Promise<unknown>>(),
  importHolidays: vi.fn<(i: unknown) => Promise<unknown>>(),
}))
vi.mock('@/server/actions/holidays', () => m)

const hid = (n: number) => `1f1c2c38-5a8e-4a6c-9a0e-00000000000${n}`
const rows: HolidayDTO[] = [
  { id: hid(1), date: '2026-10-23', name: 'วันปิยมหาราช' },
  { id: hid(2), date: '2026-10-13', name: 'วันคล้ายวันสวรรคต' },
  { id: hid(3), date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
]

function setup(list = rows) {
  return renderCalendarUi(<HolidaysTable rows={list} initialYear={2026} />)
}
const table = () => screen.getByRole('table', { name: th.holidays.title })
const rowOf = (name: string) =>
  within(table())
    .getAllByRole('row')
    .find((r) => within(r).queryByText(name) !== null)!

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
})

describe('HolidaysTable (FR-901)', () => {
  it('shows the holidays of the chosen year in date order with Thai dates; the year select uses B.E.', async () => {
    const user = userEvent.setup()
    setup()
    const body = within(table()).getAllByRole('row').slice(1)
    expect(body.map((r) => within(r).getAllByRole('cell')[1]!.textContent)).toEqual([
      'วันคล้ายวันสวรรคต',
      'วันปิยมหาราช',
    ])
    expect(within(body[1]!).getByText(formatThaiDate('2026-10-23'))).toBeInTheDocument()
    expect(within(body[1]!).getByText(th.calendar.weekdaysLong[4])).toBeInTheDocument() // Friday
    await user.click(screen.getByRole('combobox', { name: th.holidays.year }))
    await user.click(await screen.findByRole('option', { name: '2570' }))
    expect(within(table()).getByText('วันขึ้นปีใหม่')).toBeInTheDocument()
    expect(within(table()).queryByText('วันปิยมหาราช')).toBeNull()
  })

  it('delete has no confirm: the action runs, a toast offers undo, undo calls restoreHoliday with the deleted row', async () => {
    const user = userEvent.setup()
    const deleted = rows[0]!
    m.deleteHoliday.mockResolvedValue({ ok: true, deleted })
    m.restoreHoliday.mockResolvedValue({ ok: true, holiday: deleted })
    setup()
    await user.click(within(rowOf('วันปิยมหาราช')).getByRole('button', { name: th.holidays.delete }))
    expect(m.deleteHoliday).toHaveBeenCalledWith({ id: deleted.id })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      await screen.findByText(th.holidays.deleted(deleted.name, formatThaiDate(deleted.date))),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.undo.undo }))
    await waitFor(() => expect(m.restoreHoliday).toHaveBeenCalledWith(deleted))
  })

  it('add: a taken date (CONFLICT) shows dateTaken under the date field', async () => {
    const user = userEvent.setup()
    m.createHoliday.mockResolvedValue({ ok: false, code: 'CONFLICT', message: th.holidays.errors.dateTaken })
    setup()
    const form = screen.getByRole('form', { name: th.holidays.add })
    const date = form.querySelector<HTMLInputElement>('.MuiPickersTextField-root input')!
    fireEvent.change(date, { target: { value: '23/10/2569' } })
    await user.type(within(form).getByRole('textbox', { name: th.holidays.name }), 'ซ้ำ')
    await user.click(within(form).getByRole('button', { name: th.holidays.add }))
    expect(m.createHoliday).toHaveBeenCalledWith({ date: '2026-10-23', name: 'ซ้ำ' })
    expect(await within(form).findByText(th.holidays.errors.dateTaken)).toBeInTheDocument()
  })

  it('add without a name shows nameRequired and calls nothing; success toasts created(name)', async () => {
    const user = userEvent.setup()
    m.createHoliday.mockResolvedValue({
      ok: true,
      holiday: { id: hid(9), date: '2027-04-13', name: 'สงกรานต์' },
    })
    setup()
    const form = screen.getByRole('form', { name: th.holidays.add })
    fireEvent.change(form.querySelector<HTMLInputElement>('.MuiPickersTextField-root input')!, {
      target: { value: '13/04/2570' },
    })
    await user.click(within(form).getByRole('button', { name: th.holidays.add }))
    expect(await within(form).findByText(th.holidays.errors.nameRequired)).toBeInTheDocument()
    expect(m.createHoliday).not.toHaveBeenCalled()
    await user.type(within(form).getByRole('textbox', { name: th.holidays.name }), 'สงกรานต์{Enter}')
    expect(m.createHoliday).toHaveBeenCalledWith({ date: '2027-04-13', name: 'สงกรานต์' })
    expect(await screen.findByText(th.holidays.created('สงกรานต์'))).toBeInTheDocument()
  })

  it('inline edit: Enter saves through updateHoliday, Esc cancels', async () => {
    const user = userEvent.setup()
    m.updateHoliday.mockResolvedValue({ ok: true, holiday: rows[1] })
    setup()
    await user.click(within(rowOf('วันคล้ายวันสวรรคต')).getByRole('button', { name: th.holidays.edit }))
    const name = within(table()).getByRole('textbox', { name: th.holidays.name })
    await user.clear(name)
    await user.type(name, 'วันนวมินทรมหาราช{Enter}')
    expect(m.updateHoliday).toHaveBeenCalledWith({ id: hid(2), date: '2026-10-13', name: 'วันนวมินทรมหาราช' })

    await user.click(within(rowOf('วันปิยมหาราช')).getByRole('button', { name: th.holidays.edit }))
    await user.type(within(table()).getByRole('textbox', { name: th.holidays.name }), 'x{Escape}')
    expect(within(table()).queryByRole('textbox')).toBeNull()
    expect(m.updateHoliday).toHaveBeenCalledTimes(1)
  })

  it('inline edit: Enter on the open-picker button or on a calendar day is the picker’s, not a save', async () => {
    const user = userEvent.setup()
    m.updateHoliday.mockReturnValue(new Promise(() => {}))
    setup()
    await user.click(within(rowOf('วันคล้ายวันสวรรคต')).getByRole('button', { name: th.holidays.edit }))
    const dateCell = within(table()).getAllByRole('row')[1]!.querySelector('td')!
    const dateInput = () => dateCell.querySelector<HTMLInputElement>('.MuiPickersTextField-root input')!
    expect(dateInput().value).toBe('13/10/2569')

    // Keyboard to the picker's icon button and press Enter: the calendar opens, the row stays in edit mode.
    dateCell.querySelector<HTMLButtonElement>('button:has([data-testid="CalendarIcon"])')!.focus()
    await user.keyboard('{Enter}')
    const calendar = await screen.findByRole('grid')
    expect(m.updateHoliday).not.toHaveBeenCalled()
    expect(within(table()).getByRole('textbox', { name: th.holidays.name })).toBeInTheDocument()

    // Pick 14 Oct with the keyboard: the new date lands in the row and nothing is saved yet.
    await waitFor(() => expect(calendar.contains(document.activeElement)).toBe(true))
    await user.keyboard('{ArrowRight}{Enter}')
    await waitFor(() => expect(dateInput().value).toBe('14/10/2569'))
    expect(m.updateHoliday).not.toHaveBeenCalled()
    expect(within(table()).getByRole('textbox', { name: th.holidays.name })).toBeInTheDocument()

    // Enter from the name field saves the picked date.
    await user.click(within(table()).getByRole('textbox', { name: th.holidays.name }))
    await user.keyboard('{Enter}')
    expect(m.updateHoliday).toHaveBeenCalledWith({
      id: hid(2),
      date: '2026-10-14',
      name: 'วันคล้ายวันสวรรคต',
    })
  })

  it('an empty year shows the empty state', () => {
    setup([])
    expect(screen.getByText(th.holidays.empty)).toBeInTheDocument()
  })

  it('after a delete focus moves to the next row, else the previous one, else the add form’s date field', async () => {
    const user = userEvent.setup()
    m.deleteHoliday.mockReturnValue(new Promise(() => {})) // keep the optimistic removal on screen
    const deleteIn = (name: string) => within(rowOf(name)).getByRole('button', { name: th.holidays.delete })

    const first = setup()
    await user.click(deleteIn('วันคล้ายวันสวรรคต')) // first of 2026 → the next row
    expect(within(table()).queryByText('วันคล้ายวันสวรรคต')).toBeNull()
    expect(deleteIn('วันปิยมหาราช')).toHaveFocus()
    first.unmount()

    const second = setup()
    await user.click(deleteIn('วันปิยมหาราช')) // last of 2026 → the previous row
    expect(deleteIn('วันคล้ายวันสวรรคต')).toHaveFocus()
    second.unmount()

    setup([rows[0]!])
    await user.click(deleteIn('วันปิยมหาราช')) // the year becomes empty → the add form's date field
    const form = screen.getByRole('form', { name: th.holidays.add })
    const dateField = form.querySelector('.MuiPickersTextField-root')!
    expect(document.activeElement).not.toBe(document.body)
    expect(dateField.contains(document.activeElement)).toBe(true)
  })

  it('closing the inline edit (Enter, Esc or ยกเลิก) returns focus to that row’s edit button', async () => {
    const user = userEvent.setup()
    m.updateHoliday.mockReturnValue(new Promise(() => {}))
    setup()
    const editIn = (name: string) => within(rowOf(name)).getByRole('button', { name: th.holidays.edit })

    await user.click(editIn('วันปิยมหาราช'))
    await user.keyboard('{Escape}')
    expect(within(table()).queryByRole('textbox')).toBeNull()
    expect(editIn('วันปิยมหาราช')).toHaveFocus()

    await user.keyboard('{Enter}') // the focused edit button reopens the row
    await user.click(within(table()).getByRole('button', { name: th.holidays.cancel }))
    expect(editIn('วันปิยมหาราช')).toHaveFocus()

    await user.keyboard('{Enter}')
    await user.type(within(table()).getByRole('textbox', { name: th.holidays.name }), ' 2{Enter}')
    expect(m.updateHoliday).toHaveBeenCalledWith({ id: hid(1), date: '2026-10-23', name: 'วันปิยมหาราช 2' })
    expect(editIn('วันปิยมหาราช 2')).toHaveFocus()
  })
})
