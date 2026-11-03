// FR-1410 / AC-1402 (plan/m11 S3.4): cell displays and editors of the nine column types.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { CellValue, DbColumnDTO } from '@/lib/contracts/databases'
import { dbIdMap } from '@/lib/database/optimistic'
import { C, COLUMNS, makeApi, O, row } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'
import { CellDisplay } from './CellDisplay'
import { CellEditor, dateEditText, type EditorDone } from './CellEditor'
import type { PersonLookup } from './people'

vi.mock('@/server/actions/databases', () => ({}))

const people: PersonLookup = (id) =>
  ({
    'u-cindy': { name: 'Cindy', nickname: null, color: null, deactivated: false },
    'u-old': { name: 'Old', nickname: null, color: null, deactivated: true },
  })[id]
const colOf = (id: string) => COLUMNS.find((c) => c.id === id)!

describe('CellDisplay', () => {
  const show = (column: DbColumnDTO, cells: Record<string, CellValue>, title = 'x') =>
    render(<CellDisplay column={column} row={{ ...row('r', title, 'a0', cells) }} people={people} />)

  it('numbers keep every digit and only the display rounds (BR-91, AC-1402)', () => {
    show({ ...colOf(C.num), config: { decimals: null, thousands: true } }, { [C.num]: '1234567.891234' })
    expect(screen.getByText('1,234,567.891234')).toBeInTheDocument()
  })
  it('numbers align right in a table/card line but start-aligned in the panel and /r property list (D19)', () => {
    const column = { ...colOf(C.num), config: { decimals: null, thousands: true } }
    const { unmount } = show(column, { [C.num]: '5' })
    expect(screen.getByText('5')).toHaveAttribute('data-align', 'end')
    unmount()
    render(
      <CellDisplay
        column={column}
        row={row('r', 'x', 'a0', { [C.num]: '7' })}
        people={people}
        layout="block"
      />,
    )
    expect(screen.getByText('7')).toHaveAttribute('data-align', 'start')
  })
  it('0.1 with 2 decimals shows 0.10', () => {
    show({ ...colOf(C.num), config: { decimals: 2, thousands: true } }, { [C.num]: '0.1' })
    expect(screen.getByText('0.10')).toBeInTheDocument()
  })
  it('dates in Thai (พ.ศ.)', () => {
    show(colOf(C.date), { [C.date]: '2026-11-05' })
    expect(screen.getByText('5 พ.ย. 2569')).toBeInTheDocument()
  })
  it('multi-select keeps order and shows names (never colour alone)', () => {
    show(colOf(C.tags), { [C.tags]: [O.b, O.a] })
    expect(screen.getAllByTestId('db-option-chip').map((c) => c.textContent)).toEqual(['ลูกค้า', 'ด่วน'])
  })
  it('a deleted option reads as empty (FR-1416)', () => {
    show(colOf(C.status), { [C.status]: 'o-gone' })
    expect(screen.queryByTestId('db-option-chip')).not.toBeInTheDocument()
  })
  it('people keep order; a deactivated person shows "ปิดใช้งาน"', () => {
    show(colOf(C.people), { [C.people]: ['u-old', 'u-cindy'] })
    const chips = screen.getAllByTestId('db-person-chip')
    expect(chips.map((c) => c.textContent)).toEqual([`O${'Old'}${th.database.cells.deactivated}`, 'CCindy'])
  })
  it('URLs are anchors in a new tab with rel noopener noreferrer; other schemes are text', () => {
    show(colOf(C.link), { [C.link]: 'https://example.com' })
    const a = screen.getByRole('link', { name: 'https://example.com' })
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })
  it('checkbox has a text name; untitled rows read "ไม่มีชื่อ"; 📄 marks a body', () => {
    show(colOf(C.done), { [C.done]: true })
    expect(screen.getByRole('img', { name: th.database.cells.checked })).toBeInTheDocument()
    render(
      <CellDisplay column={colOf(C.title)} row={{ ...row('r', '', 'a0'), hasBody: true }} people={people} />,
    )
    expect(screen.getByText(th.database.table.untitledRow)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: th.database.rows.hasBody })).toBeInTheDocument()
  })
})

describe('CellEditor', () => {
  function edit(
    column: DbColumnDTO,
    cells: Record<string, CellValue> = {},
    extra: { createOption?: (n: string) => Promise<string> } = {},
  ) {
    const onCommit = vi.fn<(v: CellValue | null) => void>()
    const onDone = vi.fn<(r: EditorDone) => void>()
    renderDb(
      <CellEditor
        column={column}
        row={row('r', 'เดิม', 'a0', cells)}
        label={column.name}
        people={people}
        today="2026-09-30"
        onCommit={onCommit}
        onDone={onDone}
        {...extra}
      />,
      { api: makeApi() },
    )
    return { onCommit, onDone }
  }

  it('number: exact canonical string; Thai digits and commas accepted; invalid → error, stays open', async () => {
    const { onCommit, onDone } = edit(colOf(C.num))
    const input = screen.getByRole('textbox', { name: 'ผลกระทบ' })
    await userEvent.type(input, '1,234,567.891234{Enter}')
    expect(onCommit).toHaveBeenCalledWith('1234567.891234')
    expect(onDone).toHaveBeenCalledWith('enter')
  })
  it('number: garbage shows the error and does not commit', async () => {
    const { onCommit, onDone } = edit(colOf(C.num))
    await userEvent.type(screen.getByRole('textbox', { name: 'ผลกระทบ' }), '12abc{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent(th.database.cells.invalidNumber)
    expect(onCommit).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })
  it('date: typed พ.ศ. → ISO (BR-92); the edit text of a stored date is D/M/พ.ศ.', async () => {
    expect(dateEditText('2026-11-05')).toBe('5/11/2569')
    const { onCommit } = edit(colOf(C.date))
    await userEvent.type(screen.getByRole('textbox', { name: 'วันที่' }), '5/11/2569{Enter}')
    expect(onCommit).toHaveBeenCalledWith('2026-11-05')
  })
  it('URL: javascript: is rejected with the Thai message (AC-1402)', async () => {
    const { onCommit } = edit(colOf(C.link))
    await userEvent.type(screen.getByRole('textbox', { name: 'ลิงก์' }), 'javascript:alert(1){Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent(th.database.cells.invalidUrl)
    expect(onCommit).not.toHaveBeenCalled()
  })
  it('text: Shift+Enter is a new line, Enter commits; Esc cancels', async () => {
    const { onCommit, onDone } = edit(colOf(C.note))
    const box = screen.getByRole('textbox', { name: 'หมายเหตุ' })
    await userEvent.type(box, 'a{Shift>}{Enter}{/Shift}b{Enter}')
    expect(onCommit).toHaveBeenCalledWith('a\nb')
    expect(onDone).toHaveBeenCalledWith('enter')
  })
  it('Esc cancels without committing', async () => {
    const { onCommit, onDone } = edit(colOf(C.note), { [C.note]: 'old' })
    await userEvent.type(screen.getByRole('textbox', { name: 'หมายเหตุ' }), 'x{Escape}')
    expect(onCommit).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledWith('escape')
  })
  it('select: typing a new name offers "สร้าง" → addOption → commits the new id', async () => {
    const createOption = vi.fn(() => Promise.resolve('o-new'))
    const { onCommit } = edit(colOf(C.status), {}, { createOption })
    await userEvent.type(screen.getByRole('combobox', { name: 'สถานะ' }), 'รอตรวจ')
    await userEvent.click(screen.getByRole('option', { name: th.database.cells.createOption('รอตรวจ') }))
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('o-new'))
    expect(createOption).toHaveBeenCalledWith('รอตรวจ')
  })
  it('multi-select keeps the picked order and commits on Tab', async () => {
    const { onCommit, onDone } = edit(colOf(C.tags))
    const box = screen.getByRole('combobox', { name: 'ป้าย' })
    await userEvent.click(screen.getByRole('option', { name: 'ลูกค้า' }))
    await userEvent.click(screen.getByRole('option', { name: 'ด่วน' }))
    box.focus()
    await userEvent.keyboard('{Tab}')
    expect(onCommit).toHaveBeenCalledWith([O.b, O.a])
    expect(onDone).toHaveBeenCalledWith('tab')
  })
  it('multi-select: type, Enter, type, Enter… creates each name once (any case) and stays open; temp ids commit as server ids', async () => {
    let n = 0
    const createOption = vi.fn((name: string) => Promise.resolve(`tmp_${++n}_${name}`))
    const { onCommit, onDone } = edit(colOf(C.tags), {}, { createOption })
    const box = screen.getByRole('combobox', { name: 'ป้าย' })
    // the "สร้าง" item is first and highlighted
    await userEvent.type(box, 'qwer')
    expect(screen.getAllByRole('option')[0]).toHaveTextContent(th.database.cells.createOption('qwer'))
    await userEvent.keyboard('{Enter}')
    expect(box).toHaveValue('')
    expect(box).toHaveFocus()
    await userEvent.type(box, 'asdf{Enter}QWER{Enter}ลูกค้า{Enter}')
    expect(createOption.mock.calls.map((c) => c[0])).toEqual(['qwer', 'asdf'])
    // chips show names (never ids); Backspace on the empty input drops the last one
    const chips = () => screen.getAllByTestId('db-option-chip').map((c) => c.textContent)
    expect(chips().slice(0, 3)).toEqual(['qwer', 'asdf', 'ลูกค้า'])
    await userEvent.keyboard('{Backspace}')
    expect(chips().slice(0, 2)).toEqual(['qwer', 'asdf'])
    // the server answered meanwhile: commit (Esc closes and keeps the picks) sends the server ids
    dbIdMap.set('tmp_1_qwer', 'o-qwer')
    dbIdMap.set('tmp_2_asdf', 'o-asdf')
    await userEvent.keyboard('{Escape}')
    expect(onCommit).toHaveBeenCalledWith(['o-qwer', 'o-asdf'])
    expect(onDone).toHaveBeenCalledWith('escape')
    dbIdMap.clear()
  })
  it('select: an existing name in another case is picked, not created; ↑/↓ move the highlight', async () => {
    const createOption = vi.fn(() => Promise.resolve('o-new'))
    const { onCommit, onDone } = edit(colOf(C.status), {}, { createOption })
    const box = screen.getByRole('combobox', { name: 'สถานะ' })
    await userEvent.type(box, '  กำลังทำ {Enter}')
    expect(createOption).not.toHaveBeenCalled()
    expect(onCommit).toHaveBeenCalledWith(O.doing)
    expect(onDone).toHaveBeenCalledWith('picked')
  })
  it('person: only active people are offered (M11-D33); two people in one cell keep their order', async () => {
    const { onCommit } = edit(colOf(C.people))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Cindy', 'Ivy', 'Mint'])
    await userEvent.click(screen.getByRole('option', { name: 'Ivy' }))
    await userEvent.click(screen.getByRole('option', { name: 'Cindy' }))
    screen.getByRole('combobox', { name: 'คน' }).focus()
    await userEvent.keyboard('{Tab}')
    expect(onCommit).toHaveBeenCalledWith(['u-ivy', 'u-cindy'])
  })
  it('title: an empty title is allowed', async () => {
    const { onCommit } = edit(colOf(C.title))
    const input = screen.getByRole('textbox', { name: 'ชื่อ' })
    await userEvent.clear(input)
    await userEvent.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledWith('')
  })
})
