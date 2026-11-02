// FR-1440…1445, AC-1405, BR-97, M11-D25 (plan/m11 S4.2): the calendar view with the fake DbApi — Monday-first month
// "พฤศจิกายน 2569", ‹ วันนี้ ›, today frame + label, weekend marks, ≤ 3 cards + "+N เพิ่มเติม", "ย้ายไปวันที่…" (the tap path
// of a drag), + on a day, "ไม่มีวันที่ (N)", drop targets, the date-column prompt, the phone day list and the ⋯ items.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Menu from '@mui/material/Menu'
import { type JSX, useMemo, useSyncExternalStore } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { applyView, makeCollator } from '@/domain/database'
import { th } from '@/i18n/th'
import type { DatabaseResponse, DbViewDTO } from '@/lib/contracts/databases'
import { createFakeDbApi, type FakeDbApi } from '../data/fakeDbApi.test-helper'
import { C, callsOf, makeDb, row } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'
import { CalendarMenuItems, CalendarView, dropValue } from './CalendarView'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/databases', () => ({}))

const CAL: DbViewDTO = {
  id: 'v-cal',
  type: 'CALENDAR',
  name: 'ปฏิทิน',
  config: { dateColumnId: C.date },
  position: 'a2',
  version: 1,
}

function Harness({
  api,
  openRow,
  narrow,
}: {
  api: FakeDbApi
  openRow: (id: string) => void
  narrow: boolean
}) {
  useSyncExternalStore(api.subscribe, () => api.revision)
  const view = api.db.views.find((v) => v.type === 'CALENDAR')!
  const rows = useMemo(
    () =>
      applyView(api.db.rows, view, api.db.columns, {
        people: new Map(Object.entries(api.db.people)),
        viewerId: api.viewerId,
        today: api.today,
        collator: makeCollator(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fake mutates in place; revision drives re-renders
    [api.revision, view],
  )
  return <CalendarView view={view} rows={rows} openRow={openRow} variant="page" narrow={narrow} />
}

function show(over: Partial<DatabaseResponse> = {}, opts: { canEdit?: boolean; narrow?: boolean } = {}) {
  const api = createFakeDbApi(makeDb({ views: [CAL], ...over }), {
    viewerId: 'u-cindy',
    today: '2026-11-02',
    ...(opts.canEdit === undefined ? {} : { canEdit: opts.canEdit }),
  })
  const openRow = vi.fn()
  renderDb(<Harness api={api} openRow={openRow} narrow={opts.narrow ?? false} />, { api })
  return { api, openRow }
}

const grid = () => screen.getByRole('grid')
/** The day cell whose accessible name starts with the Thai long date ("5 พฤศจิกายน 2569"). */
const day = (d: number, month = 'พฤศจิกายน 2569') =>
  within(grid()).getByRole('gridcell', { name: new RegExp(`^วัน\\S+ ${d} ${month}`) })
const cardIds = (el: HTMLElement) =>
  within(el)
    .queryAllByTestId('db-card')
    .map((c) => c.getAttribute('data-row-id'))

describe('CalendarView — month grid (FR-1440, FR-1441, BR-97)', () => {
  it('"พฤศจิกายน 2569", Monday first, 6 weeks, today framed with "วันนี้", weekends marked', () => {
    show()
    expect(screen.getByTestId('db-calendar')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'พฤศจิกายน 2569' })).toBeInTheDocument()
    const heads = within(grid()).getAllByRole('columnheader')
    expect(heads.map((h) => h.textContent)).toEqual(th.database.calendar.weekdays)
    expect(within(grid()).getAllByRole('row')).toHaveLength(7) // header + 6 weeks (26 ต.ค. – 6 ธ.ค.)
    const today = day(2)
    expect(today).toHaveAttribute('data-today', 'true')
    expect(within(today).getByText(th.database.calendar.today)).toBeInTheDocument()
    expect(day(7)).toHaveAttribute('data-weekend', 'true')
    expect(day(26, 'ตุลาคม 2569')).toHaveAttribute('data-outside', 'true')
  })

  it('rows land on their date; ‹ › change the month; วันนี้ comes back', async () => {
    show()
    expect(cardIds(day(5))).toEqual(['r1'])
    await userEvent.click(screen.getByRole('button', { name: th.database.calendar.next }))
    expect(screen.getByRole('heading', { name: 'ธันวาคม 2569' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: th.database.calendar.prev }))
    await userEvent.click(screen.getByRole('button', { name: th.database.calendar.prev }))
    expect(screen.getByRole('heading', { name: 'ตุลาคม 2569' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: th.database.calendar.today }))
    expect(screen.getByRole('heading', { name: 'พฤศจิกายน 2569' })).toBeInTheDocument()
  })

  it('more than 3 cards → 3 + "+N เพิ่มเติม" opening the whole day', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
      row(id, `งาน ${id}`, `a${i}`, { [C.date]: '2026-11-10' }),
    )
    show({ rows })
    expect(cardIds(day(10))).toEqual(['a', 'b', 'c'])
    await userEvent.click(within(day(10)).getByRole('button', { name: th.database.calendar.more(2) }))
    const dialog = await screen.findByRole('dialog')
    expect(cardIds(dialog)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('click on a card opens the row', async () => {
    const { openRow } = show()
    await userEvent.click(
      within(day(5)).getByRole('button', { name: th.database.calendar.openCard('ลูกค้าส่ง spec ช้า') }),
    )
    expect(openRow).toHaveBeenCalledWith('r1')
  })
})

describe('CalendarView — changing dates (FR-1442…1444, AC-1405)', () => {
  it('"ย้ายไปวันที่…" 5 → 12 พ.ย. writes 2026-11-12 in one updateRow', async () => {
    const { api } = show()
    const card = within(day(5)).getByTestId('db-card')
    await userEvent.click(within(card).getByRole('button', { name: /^ตัวเลือกของ/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: th.database.calendar.moveTo }))
    const picker = await screen.findByRole('dialog', { name: th.database.calendar.moveTo })
    await userEvent.click(within(picker).getByRole('gridcell', { name: '12' }))
    expect(callsOf(api, 'updateRow')[0]!.slice(0, 2)).toEqual(['r1', { cells: { [C.date]: '2026-11-12' } }])
    expect(cardIds(day(12))).toEqual(['r1'])
    expect(cardIds(day(5))).toEqual([])
  })

  it('"เอาวันที่ออก" clears the date → the row moves to ไม่มีวันที่', async () => {
    const { api } = show()
    const card = within(day(5)).getByTestId('db-card')
    await userEvent.click(within(card).getByRole('button', { name: /^ตัวเลือกของ/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: th.database.calendar.clearDate }))
    expect(callsOf(api, 'updateRow')[0]!.slice(0, 2)).toEqual(['r1', { cells: { [C.date]: null } }])
    expect(cardIds(screen.getByTestId('db-calendar-nodate'))).toContain('r1')
  })

  it('+ on 20 พ.ย. → type "ตรวจรับ" Enter → a row dated 2026-11-20', async () => {
    const { api } = show()
    await userEvent.click(
      within(day(20)).getByRole('button', { name: th.database.calendar.addOnDay('20 พ.ย. 2569') }),
    )
    await userEvent.type(within(day(20)).getByRole('textbox'), 'ตรวจรับ{Enter}')
    expect(callsOf(api, 'createRows')[0]![0]).toEqual([
      { title: 'ตรวจรับ', cells: { [C.date]: '2026-11-20' } },
    ])
    expect(within(day(20)).getAllByTestId('db-card')).toHaveLength(1)
  })

  it('"ไม่มีวันที่ (N)" lists undated rows and collapses', async () => {
    show()
    const toggle = screen.getByRole('button', { name: th.database.calendar.noDate(4) })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(cardIds(screen.getByTestId('db-calendar-nodate'))).toEqual(['r2', 'r3', 'r4', 'r5'])
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(screen.getByTestId('db-calendar-nodate')).queryAllByTestId('db-card')).toHaveLength(0)
  })

  it('drop targets: a day sets that date, the no-date list clears it, the same date is a no-op', () => {
    expect(dropValue('d|2026-11-12', '2026-11-05')).toEqual({ value: '2026-11-12' })
    expect(dropValue('n', '2026-11-05')).toEqual({ value: null })
    expect(dropValue('d|2026-11-05', '2026-11-05')).toBeNull()
    expect(dropValue('n', null)).toBeNull()
    expect(dropValue('x|?', null)).toBeNull()
  })

  it('read-only: no +, no card menu, no drag handle', () => {
    show({}, { canEdit: false })
    expect(within(day(20)).queryByRole('button', { name: /^เพิ่มแถว/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^ตัวเลือกของ/ })).toBeNull()
    expect(screen.queryByRole('button', { name: th.database.kanban.dragCard })).toBeNull()
  })
})

describe('CalendarView — date column and phone (FR-1408, FR-1415, FR-1440)', () => {
  it('without a DATE column for the view: the prompt lists DATE columns; picking saves the view', async () => {
    const { api } = show({ views: [{ ...CAL, config: {} }] })
    const prompt = screen.getByTestId('db-calendar-pick')
    await userEvent.click(within(prompt).getByRole('button', { name: 'วันที่' }))
    expect(callsOf(api, 'updateView')[0]!.slice(0, 2)).toEqual([
      'v-cal',
      { config: { dateColumnId: C.date } },
    ])
  })

  it('no DATE column at all: "สร้างคอลัมน์ วันที่" creates one and uses it', async () => {
    const { api } = show({
      views: [{ ...CAL, config: {} }],
      columns: [{ id: C.title, type: 'TITLE', name: 'ชื่อ', config: {}, position: 'a0', version: 1 }],
    })
    await userEvent.click(screen.getByRole('button', { name: th.database.calendar.createDateColumn }))
    expect(callsOf(api, 'createColumn')[0]).toEqual(['DATE', { name: th.database.defaults.date }])
    const id = api.db.columns.find((c) => c.type === 'DATE')!.id
    expect(callsOf(api, 'updateView')[0]!.slice(0, 2)).toEqual(['v-cal', { config: { dateColumnId: id } }])
  })

  it('phone: a day list (today + days with rows), no grid; the no-date list stays', () => {
    show({}, { narrow: true })
    expect(screen.queryByRole('grid')).toBeNull()
    const list = screen.getByTestId('db-calendar-days')
    const days = within(list).getAllByRole('listitem', { name: /พฤศจิกายน 2569/ })
    expect(days.map((d) => d.getAttribute('data-date'))).toEqual(['2026-11-02', '2026-11-05'])
    expect(within(days[0]!).getByText(th.database.calendar.today)).toBeInTheDocument()
    expect(cardIds(days[1]!)).toEqual(['r1'])
    expect(screen.getByTestId('db-calendar-nodate')).toBeInTheDocument()
  })
})

describe('CalendarMenuItems (view ⋯)', () => {
  function MenuHarness({ api }: { api: FakeDbApi }): JSX.Element {
    useSyncExternalStore(api.subscribe, () => api.revision)
    return (
      <Menu open anchorEl={document.body}>
        <CalendarMenuItems view={api.db.views[0]!} close={() => {}} />
      </Menu>
    )
  }

  it('date column (radio over DATE columns) and card properties', async () => {
    const api = createFakeDbApi(
      makeDb({
        views: [CAL],
        columns: [
          ...makeDb().columns,
          { id: 'c-due', type: 'DATE', name: 'กำหนดส่ง', config: {}, position: 'a9', version: 1 },
        ],
      }),
      { viewerId: 'u-cindy', today: '2026-11-02' },
    )
    renderDb(<MenuHarness api={api} />, { api })
    const radios = within(screen.getByRole('menu')).getAllByRole('menuitemradio')
    expect(radios.map((r) => r.textContent)).toEqual(['วันที่', 'กำหนดส่ง'])
    await userEvent.click(radios[1]!)
    expect(callsOf(api, 'updateView')[0]![1]).toEqual({ config: { dateColumnId: 'c-due' } })
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'สถานะ' }))
    expect(callsOf(api, 'updateView')[1]![1]).toEqual({
      config: { dateColumnId: 'c-due', cardColumnIds: [C.status] },
    })
  })
})
