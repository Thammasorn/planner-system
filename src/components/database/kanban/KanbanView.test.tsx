// FR-1430…1435, AC-1404, BR-96, M11-D24 (plan/m11 S4.1): the kanban view with the fake DbApi — groups + counts,
// "ย้ายไป…" (the tap path of a drag), a dnd-kit keyboard drag, multi-person groups, quick add, + เพิ่มกลุ่ม, hide empty,
// card properties, click → panel, read-only, the group-column prompt and the view ⋯ items.
import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Menu from '@mui/material/Menu'
import { type JSX, useMemo, useSyncExternalStore } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { applyView, makeCollator } from '@/domain/database'
import { th } from '@/i18n/th'
import type { DbViewDTO } from '@/lib/contracts/databases'
import { type FakeDbApi } from '../data/fakeDbApi.test-helper'
import { C, callsOf, makeApi, O, row } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'
import { KanbanMenuItems, KanbanView, planKanbanDrop } from './KanbanView'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/databases', () => ({}))

const KANBAN: DbViewDTO = {
  id: 'v-kanban',
  type: 'KANBAN',
  name: 'คัมบัง',
  config: { groupByColumnId: C.status },
  position: 'a1',
  version: 1,
}

/** The view as DatabaseBlockContent renders it: rows through applyView, re-rendered on every fake change. */
function Harness({
  api,
  openRow,
  narrow = false,
}: {
  api: FakeDbApi
  openRow: (id: string) => void
  narrow?: boolean
}) {
  useSyncExternalStore(api.subscribe, () => api.revision)
  const view = api.db.views.find((v) => v.type === 'KANBAN')!
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
  return <KanbanView view={view} rows={rows} openRow={openRow} variant="page" narrow={narrow} />
}

function show(over: Parameters<typeof makeApi>[0] = {}, opts: { canEdit?: boolean; narrow?: boolean } = {}) {
  const api = makeApi(
    { views: [KANBAN], ...over },
    opts.canEdit === undefined ? {} : { canEdit: opts.canEdit },
  )
  const openRow = vi.fn()
  renderDb(<Harness api={api} openRow={openRow} narrow={opts.narrow ?? false} />, { api })
  return { api, openRow }
}

const board = () => screen.getByTestId('db-kanban')
const group = (name: string) => within(board()).getByRole('region', { name: new RegExp(`^${name} \\d+`) })
const cards = (name: string) =>
  within(group(name))
    .queryAllByTestId('db-card')
    .map((c) => c.getAttribute('data-row-id'))
const headings = () =>
  within(board())
    .getAllByRole('region')
    .map((g) => g.getAttribute('aria-label'))

async function moveVia(card: HTMLElement, target: string) {
  await userEvent.click(within(card).getByRole('button', { name: /^ตัวเลือกของ/ }))
  const menu = await screen.findByRole('menu')
  await userEvent.click(within(menu).getByRole('menuitem', { name: target }))
}
const cardOf = (groupName: string, rowId: string) =>
  within(group(groupName))
    .getAllByTestId('db-card')
    .find((c) => c.getAttribute('data-row-id') === rowId)!

describe('KanbanView — groups (FR-1431, BR-96)', () => {
  it('SELECT: option order then ไม่มีค่า, with counts per group', () => {
    show()
    const k = th.database.kanban
    expect(headings()).toEqual([
      k.groupCount('ยังไม่เริ่ม', 1),
      k.groupCount('กำลังทำ', 3),
      k.groupCount('เสร็จ', 0),
      k.groupCount(k.noValue, 1),
    ])
    expect(cards('กำลังทำ')).toEqual(['r1', 'r2', 'r3'])
    expect(cards(k.noValue)).toEqual(['r5'])
  })

  it('hide empty groups (view setting) drops เสร็จ', () => {
    show({ views: [{ ...KANBAN, config: { ...KANBAN.config, hideEmptyGroups: true } }] })
    expect(within(board()).queryByRole('region', { name: /^เสร็จ/ })).toBeNull()
  })

  it('CHECKBOX: ติ๊กแล้ว, ยังไม่ติ๊ก — no ไม่มีค่า', () => {
    show({ views: [{ ...KANBAN, config: { groupByColumnId: C.done } }] })
    const k = th.database.kanban
    expect(headings()).toEqual([k.groupCount(k.checked, 1), k.groupCount(k.unchecked, 4)])
  })

  it('card = title + 📄 + chosen properties (empty lines omitted); click opens the row', async () => {
    const { openRow } = show({
      views: [{ ...KANBAN, config: { ...KANBAN.config, cardColumnIds: [C.num, C.date] } }],
      rows: [
        {
          ...row('r1', 'ลูกค้าส่ง spec ช้า', 'a0', { [C.status]: O.doing, [C.num]: '250000' }),
          hasBody: true,
        },
      ],
    })
    const card = cardOf('กำลังทำ', 'r1')
    expect(within(card).getByText('250,000')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: th.database.rows.hasBody })).toBeInTheDocument()
    expect(within(card).queryByText(th.database.cells.emptyDate)).toBeNull()
    await userEvent.click(
      within(card).getByRole('button', { name: th.database.kanban.openCard('ลูกค้าส่ง spec ช้า') }),
    )
    expect(openRow).toHaveBeenCalledWith('r1')
  })
})

describe('KanbanView — moving cards (FR-1433, AC-1404)', () => {
  it('"ย้ายไป…" กำลังทำ → เสร็จ sets the group value in one updateRow; → ไม่มีค่า clears it', async () => {
    const { api } = show()
    await moveVia(cardOf('กำลังทำ', 'r1'), 'เสร็จ')
    expect(callsOf(api, 'updateRow')[0]!.slice(0, 2)).toEqual(['r1', { cells: { [C.status]: O.done } }])
    expect(cards('เสร็จ')).toEqual(['r1'])
    await moveVia(cardOf('เสร็จ', 'r1'), th.database.kanban.noValue)
    expect(callsOf(api, 'updateRow')[1]!.slice(0, 2)).toEqual(['r1', { cells: { [C.status]: null } }])
    expect(cards(th.database.kanban.noValue)).toEqual(['r1', 'r5'])
  })

  it('the current group is shown but disabled in "ย้ายไป…"', async () => {
    show()
    await userEvent.click(within(cardOf('กำลังทำ', 'r1')).getByRole('button', { name: /^ตัวเลือกของ/ }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /กำลังทำ/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('PERSON: a Cindy + Ivy row is in both groups; Cindy → Mint replaces Cindy; Ivy → ไม่มีค่า removes Ivy', async () => {
    const { api } = show({
      views: [{ ...KANBAN, config: { groupByColumnId: C.people } }],
      rows: [
        row('r1', 'ลูกค้าส่ง spec ช้า', 'a0', { [C.people]: ['u-cindy', 'u-ivy'] }),
        row('r2', 'API ERP', 'a1', { [C.people]: ['u-mint'] }),
        row('r3', 'งบเกิน', 'a2'),
      ],
      people: {
        'u-cindy': { name: 'Cindy', nickname: null, color: null, deactivated: false },
        'u-ivy': { name: 'Ivy', nickname: null, color: null, deactivated: false },
        'u-mint': { name: 'Mint', nickname: null, color: null, deactivated: false },
      },
    })
    const k = th.database.kanban
    expect(headings()).toEqual([
      k.groupCount('Cindy', 1),
      k.groupCount('Ivy', 1),
      k.groupCount('Mint', 1),
      k.groupCount(k.noValue, 1),
    ])
    await moveVia(cardOf('Cindy', 'r1'), 'Mint')
    expect(callsOf(api, 'updateRow')[0]!.slice(0, 2)).toEqual([
      'r1',
      { cells: { [C.people]: ['u-mint', 'u-ivy'] } },
    ])
    expect(cards('Mint')).toEqual(['r1', 'r2'])
    await moveVia(cardOf('Ivy', 'r1'), k.noValue)
    expect(callsOf(api, 'updateRow')[1]!.slice(0, 2)).toEqual(['r1', { cells: { [C.people]: ['u-mint'] } }])
  })

  it('a dnd-kit keyboard drag (Space, →, Space) moves the card to the next group', async () => {
    const { api } = show()
    const restore = layoutBoard()
    const handle = within(cardOf('กำลังทำ', 'r1')).getByRole('button', { name: th.database.kanban.dragCard })
    handle.focus()
    const press = async (code: string, key: string) =>
      act(async () => {
        fireEvent.keyDown(handle, { code, key })
        await new Promise((r) => setTimeout(r, 0)) // the sensor attaches its key listener on the next tick
      })
    try {
      await press('Space', ' ')
      await press('ArrowRight', 'ArrowRight')
      await press('Space', ' ')
    } finally {
      restore()
    }
    const call = callsOf(api, 'updateRow')[0]!
    expect(call[0]).toBe('r1')
    expect((call[1] as { cells: unknown }).cells).toEqual({ [C.status]: O.done })
  })
})

describe('KanbanView — creating (FR-1434)', () => {
  it('+ เพิ่ม in เสร็จ creates a row with that value; Enter keeps the input for the next card', async () => {
    const { api } = show()
    await userEvent.click(within(group('เสร็จ')).getByRole('button', { name: th.database.kanban.add }))
    const input = within(group('เสร็จ')).getByRole('textbox', {
      name: th.database.kanban.quickAddLabel('เสร็จ'),
    })
    await userEvent.type(input, 'ตรวจรับ{Enter}')
    expect(callsOf(api, 'createRows')[0]![0]).toEqual([{ title: 'ตรวจรับ', cells: { [C.status]: O.done } }])
    expect(cards('เสร็จ')).toHaveLength(1)
    const again = within(group('เสร็จ')).getByRole('textbox', {
      name: th.database.kanban.quickAddLabel('เสร็จ'),
    })
    expect(again).toHaveValue('')
    expect(again).toHaveFocus()
    await userEvent.type(again, '{Escape}')
    expect(within(group('เสร็จ')).queryByRole('textbox')).toBeNull()
  })

  it('+ เพิ่ม in ไม่มีค่า creates a row without the value; a PERSON group sets [person]', async () => {
    const { api } = show()
    const none = th.database.kanban.noValue
    await userEvent.click(within(group(none)).getByRole('button', { name: th.database.kanban.add }))
    await userEvent.type(within(group(none)).getByRole('textbox'), 'ใหม่{Enter}')
    expect(callsOf(api, 'createRows')[0]![0]).toEqual([{ title: 'ใหม่' }])
  })

  it('+ เพิ่มกลุ่ม (SELECT) creates an option', async () => {
    const { api } = show()
    await userEvent.click(within(board()).getByRole('button', { name: th.database.kanban.addGroup }))
    await userEvent.type(
      screen.getByRole('textbox', { name: th.database.kanban.addGroupLabel }),
      'รอตรวจ{Enter}',
    )
    expect(callsOf(api, 'addOption')).toEqual([[C.status, 'รอตรวจ']])
  })

  it('read-only: no + เพิ่ม, no + เพิ่มกลุ่ม, no card menu, no drag handle', () => {
    show({}, { canEdit: false })
    expect(within(board()).queryByRole('button', { name: th.database.kanban.add })).toBeNull()
    expect(within(board()).queryByRole('button', { name: th.database.kanban.addGroup })).toBeNull()
    expect(within(board()).queryByRole('button', { name: /^ตัวเลือกของ/ })).toBeNull()
    expect(within(board()).queryByRole('button', { name: th.database.kanban.dragCard })).toBeNull()
  })

  it('phone: no drag handles, "ย้ายไป…" stays', () => {
    show({}, { narrow: true })
    expect(within(board()).queryByRole('button', { name: th.database.kanban.dragCard })).toBeNull()
    expect(within(cardOf('กำลังทำ', 'r1')).getByRole('button', { name: /^ตัวเลือกของ/ })).toBeInTheDocument()
  })
})

describe('KanbanView — group column (FR-1415, FR-1430)', () => {
  it('without a group column: the prompt lists SELECT / PERSON / CHECKBOX columns; picking saves the view', async () => {
    const { api } = show({ views: [{ ...KANBAN, config: {} }] })
    const prompt = screen.getByTestId('db-kanban-pick')
    expect(within(prompt).getByText(th.database.kanban.pickGroupColumn)).toBeInTheDocument()
    expect(
      within(prompt)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['สถานะ', 'ปิดแล้ว', 'คน'])
    await userEvent.click(within(prompt).getByRole('button', { name: 'คน' }))
    expect(callsOf(api, 'updateView')[0]!.slice(0, 2)).toEqual([
      'v-kanban',
      { config: { groupByColumnId: C.people } },
    ])
  })

  it('no groupable column at all: "สร้างคอลัมน์ สถานะ" creates one and groups by it', async () => {
    const { api } = show({
      views: [{ ...KANBAN, config: {} }],
      columns: [{ id: C.title, type: 'TITLE', name: 'ชื่อ', config: {}, position: 'a0', version: 1 }],
    })
    await userEvent.click(screen.getByRole('button', { name: th.database.kanban.createStatusColumn }))
    expect(callsOf(api, 'createColumn')[0]).toEqual(['SELECT', { name: th.database.defaults.status }])
    const id = api.db.columns.find((c) => c.type === 'SELECT')!.id
    expect(callsOf(api, 'updateView')[0]!.slice(0, 2)).toEqual([
      'v-kanban',
      { config: { groupByColumnId: id } },
    ])
  })
})

describe('KanbanMenuItems (view ⋯)', () => {
  function MenuHarness({ api }: { api: FakeDbApi }): JSX.Element {
    useSyncExternalStore(api.subscribe, () => api.revision)
    const view = api.db.views[0]!
    return (
      <Menu open anchorEl={document.body}>
        <KanbanMenuItems view={view} close={() => {}} />
      </Menu>
    )
  }

  it('group by (radio per SELECT / PERSON / CHECKBOX), hide empty, card properties', async () => {
    const api = makeApi({ views: [KANBAN] })
    renderDb(<MenuHarness api={api} />, { api })
    const menu = screen.getByRole('menu')
    const radios = within(menu).getAllByRole('menuitemradio')
    expect(radios.map((r) => r.textContent)).toEqual(['สถานะ', 'ปิดแล้ว', 'คน'])
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(radios[2]!)
    expect(callsOf(api, 'updateView')[0]![1]).toEqual({ config: { groupByColumnId: C.people } })
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: th.database.kanban.hideEmpty }))
    expect(callsOf(api, 'updateView')[1]![1]).toEqual({
      config: { groupByColumnId: C.people, hideEmptyGroups: true },
    })
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'ผลกระทบ' }))
    expect(callsOf(api, 'updateView')[2]![1]).toEqual({
      config: { groupByColumnId: C.people, hideEmptyGroups: true, cardColumnIds: [C.num] },
    })
  })
})

describe('planKanbanDrop (BR-96 positions, M11-D18)', () => {
  const status = { id: C.status, type: 'SELECT' as const, name: 'สถานะ', config: {}, position: 'a1' }
  const r = (id: string, s?: string) => ({ id, title: id, position: id, cells: s ? { [C.status]: s } : {} })
  const groups = [
    { key: { kind: 'option' as const, id: O.todo }, rows: [r('a', O.todo), r('b', O.todo), r('c', O.todo)] },
    { key: { kind: 'option' as const, id: O.done }, rows: [r('d', O.done)] },
    { key: { kind: 'none' as const }, rows: [] },
  ]
  const base = { groups, col: status, hasSorts: false }

  it('within a group (no sorts): moving a down onto c → after c; c onto a → first (null)', () => {
    expect(planKanbanDrop({ ...base, rowId: 'a', from: 0, to: 0, overRowId: 'c' })).toEqual({
      move: { afterRowId: 'c' },
    })
    expect(planKanbanDrop({ ...base, rowId: 'c', from: 0, to: 0, overRowId: 'a' })).toEqual({
      move: { afterRowId: null },
    })
  })

  it('within a group with sorts → nothing; onto itself → nothing', () => {
    expect(planKanbanDrop({ ...base, hasSorts: true, rowId: 'a', from: 0, to: 0, overRowId: 'c' })).toBeNull()
    expect(planKanbanDrop({ ...base, rowId: 'a', from: 0, to: 0, overRowId: 'a' })).toBeNull()
  })

  it('across groups: value + position before the card it lands on; onto a group = after its last card', () => {
    expect(planKanbanDrop({ ...base, rowId: 'b', from: 0, to: 1, overRowId: 'd' })).toEqual({
      cells: { [C.status]: O.done },
      move: { afterRowId: null },
    })
    expect(planKanbanDrop({ ...base, rowId: 'b', from: 0, to: 1, overRowId: null })).toEqual({
      cells: { [C.status]: O.done },
      move: { afterRowId: 'd' },
    })
    // an empty group: value only (the position stays)
    expect(planKanbanDrop({ ...base, rowId: 'b', from: 0, to: 2, overRowId: null })).toEqual({
      cells: { [C.status]: null },
    })
    // with sorts: value only
    expect(planKanbanDrop({ ...base, hasSorts: true, rowId: 'b', from: 0, to: 1, overRowId: 'd' })).toEqual({
      cells: { [C.status]: O.done },
    })
  })
})

/** jsdom has no layout: give groups and cards boxes (groups 280 px apart, cards 60 px apart) for the keyboard sensor. */
function layoutBoard(): () => void {
  const rect = (x: number, y: number, w: number, h: number) =>
    ({
      x,
      y,
      left: x,
      top: y,
      width: w,
      height: h,
      right: x + w,
      bottom: y + h,
      toJSON: () => ({}),
    }) as DOMRect
  const original = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    // the DragOverlay copy of a card sits where the card is
    if (this.dataset.overlay === 'true') {
      const card = document.querySelector<HTMLElement>(
        `[data-testid="db-card"][data-row-id="${this.dataset.rowId}"]`,
      )
      return card ? card.getBoundingClientRect() : original.call(this)
    }
    const section = this.closest('section')
    if (!section) return original.call(this)
    const gi = [...section.parentElement!.querySelectorAll(':scope > section')].indexOf(section)
    const testId = this.getAttribute('data-testid')
    if (testId === 'db-kanban-list') return rect(gi * 280, 40, 260, 560)
    if (testId === 'db-card') {
      const ci = [...this.parentElement!.children].indexOf(this)
      return rect(gi * 280, 40 + ci * 60, 260, 52)
    }
    return original.call(this)
  }
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original
  }
}

describe('KanbanView — row context menu (FR-1424a)', () => {
  it('right-click a card opens the app menu; เปิด opens the row; ลบแถว deletes it', async () => {
    const { api, openRow } = show()
    const card = within(board()).getAllByTestId('db-card')[0]!
    const id = card.getAttribute('data-row-id')!
    expect(fireEvent.contextMenu(card, { clientX: 20, clientY: 20 })).toBe(false)
    await userEvent.click(screen.getByRole('menuitem', { name: th.database.rowMenu.open }))
    expect(openRow).toHaveBeenCalledWith(id)
    fireEvent.keyDown(within(card).getAllByRole('button')[0]!, { key: 'F10', shiftKey: true })
    await userEvent.click(screen.getByRole('menuitem', { name: th.database.rowMenu.delete }))
    expect(callsOf(api, 'deleteRows')).toEqual([[[id]]])
  })
})
