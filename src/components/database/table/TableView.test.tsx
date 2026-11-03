// FR-1420…1429 (plan/m11 S3.5): table rendering, virtualisation, selection + delete, new rows inheriting filters,
// footer counts, read-only, column header menu / add column.
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { DbRowDTO } from '@/lib/contracts/databases'
import { dbIdMap } from '@/lib/database/optimistic'
import { DatabaseBlockContent } from '../DatabaseBlockView'
import { C, callsOf, makeApi, O, row, TABLE_VIEW } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/databases', () => ({}))
vi.mock('@/components/editor/RowBody', () => ({ RowBody: () => null }))

const block = () => <DatabaseBlockContent blockId="b1" variant="page" />
const grid = () => screen.getByRole('grid', { name: th.database.table.label })
const dataRows = () =>
  within(grid())
    .getAllByRole('row')
    .filter((r) => r.hasAttribute('data-row-id'))

describe('TableView', () => {
  it('renders the columns with type names, rows, and the footer count', () => {
    renderDb(block(), { api: makeApi() })
    const headers = within(grid()).getAllByRole('columnheader')
    expect(headers.map((h) => h.textContent)).toEqual([
      'ชื่อ',
      'สถานะ',
      'วันที่',
      'ผลกระทบ',
      'ปิดแล้ว',
      'คน',
      'ป้าย',
      'ลิงก์',
      'หมายเหตุ',
    ])
    expect(dataRows()).toHaveLength(5)
    // number display (thousands default on) and Thai date
    expect(within(dataRows()[0]!).getByText('250,000')).toBeInTheDocument()
    expect(within(dataRows()[0]!).getByText('5 พ.ย. 2569')).toBeInTheDocument()
    expect(within(dataRows()[0]!).getByText('กำลังทำ')).toBeInTheDocument()
    expect(screen.getByText(th.database.table.count(5))).toBeInTheDocument()
  })

  it('AC-1403: sort desc + two filters → matching rows only, empties last, "2 จาก 5 แถว"; a new row inherits the filter', async () => {
    const api = makeApi({
      views: [
        {
          ...TABLE_VIEW,
          config: {
            sorts: [{ columnId: C.num, dir: 'DESC' }],
            filters: [
              { columnId: C.status, op: 'isAnyOf', value: [O.doing] },
              { columnId: C.done, op: 'unchecked' },
            ],
          },
        },
      ],
    })
    renderDb(block(), { api })
    expect(dataRows().map((r) => r.getAttribute('data-row-id'))).toEqual(['r1', 'r2'])
    expect(screen.getByText(th.database.table.countOf(2, 5))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('gridcell', { name: th.database.table.newRow }))
    expect(callsOf(api, 'createRows')[0]![0]).toEqual([{ cells: { [C.status]: O.doing } }])
    await waitFor(() => expect(screen.getByText(th.database.table.countOf(3, 6))).toBeInTheDocument())
  })

  it('selects rows (Shift = range) and deletes them from the toolbar', async () => {
    const api = makeApi()
    const user = userEvent.setup()
    renderDb(block(), { api })
    const box = (i: number) => within(dataRows()[i]!).getByRole('checkbox')
    await user.click(box(0))
    await user.keyboard('{Shift>}')
    await user.click(box(2))
    await user.keyboard('{/Shift}')
    expect(screen.getByText(th.database.table.selected(3))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: th.database.table.deleteSelected }))
    expect(callsOf(api, 'deleteRows')).toEqual([[['r1', 'r2', 'r3']]])
    expect(dataRows()).toHaveLength(2)
  })

  it('read-only: no checkboxes, handles, "+" or new row; header names are not menus (FR-1461)', () => {
    renderDb(block(), { api: makeApi({ canEdit: false }, { canEdit: false }) })
    expect(within(grid()).queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: th.database.table.addColumn })).not.toBeInTheDocument()
    expect(screen.queryByRole('gridcell', { name: th.database.table.newRow })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.database.table.dragRow })).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /ตาราง/ })).toBeInTheDocument()
  })

  it('"+" column → type → created with the default name and its menu opens with the name focused (FR-1411)', async () => {
    const api = makeApi()
    renderDb(block(), { api })
    await userEvent.click(screen.getByRole('button', { name: th.database.table.addColumn }))
    await userEvent.click(screen.getByRole('menuitem', { name: th.database.types.NUMBER }))
    expect(callsOf(api, 'createColumn')[0]![0]).toBe('NUMBER')
    const name = await screen.findByRole('textbox', { name: th.database.columnMenu.rename })
    expect(name).toHaveValue(api.db.columns.at(-1)!.name)
    expect(name).toHaveFocus()
  })

  it('owner bug 2026-11-03: the new column’s menu stays under its header through the temp → server id swap', async () => {
    // jsdom has no layout: every column header sits at x 300, y 100 (34 high); anything else is at 0,0
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const head = this.getAttribute('role') === 'columnheader' && this.isConnected
      const r = head
        ? { top: 100, left: 300, width: 180, height: 34 }
        : { top: 0, left: 0, width: 0, height: 0 }
      return {
        ...r,
        bottom: r.top + r.height,
        right: r.left + r.width,
        x: r.left,
        y: r.top,
        toJSON: () => r,
      }
    })
    try {
      const api = makeApi()
      renderDb(block(), { api })
      await userEvent.click(screen.getByRole('button', { name: th.database.table.addColumn }))
      await userEvent.click(screen.getByRole('menuitem', { name: th.database.types.NUMBER }))
      const dialog = await screen.findByRole('dialog', {
        name: th.database.columnMenu.label(api.db.columns.at(-1)!.name),
      })
      // the server answers: the column (and its header element) gets a new id
      const tmp = api.db.columns.at(-1)!.id
      const server = '00000000-0000-4000-8000-0000000fffff'
      dbIdMap.set(tmp, server)
      act(() =>
        api.setDb({
          ...api.db,
          columns: api.db.columns.map((c) => (c.id === tmp ? { ...c, id: server } : c)),
        }),
      )
      expect(screen.getByRole('dialog')).toBe(dialog)
      // any later positioning (window resize, content change) must still find the live header, never a detached one
      act(() => {
        dialog.style.left = '0px'
        dialog.style.top = '0px'
        window.dispatchEvent(new Event('resize'))
      })
      await waitFor(() => {
        expect(dialog.style.left).toBe('300px')
        expect(dialog.style.top).toBe('134px')
      })
      // the column disappears (rolled back / deleted elsewhere) → the menu closes
      act(() => api.setDb({ ...api.db, columns: api.db.columns.filter((c) => c.id !== server) }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    } finally {
      rect.mockRestore()
      dbIdMap.clear()
    }
  })

  it('the new column’s menu opens even when the column reaches the cache after createColumn answered (e2e D2c)', async () => {
    const api = makeApi()
    let arrive: () => void = () => {}
    api.createColumn = (type) => {
      const id = 'tmp_late_column'
      arrive = () =>
        api.setDb({
          ...api.db,
          columns: [
            ...api.db.columns,
            { id, type, name: 'ตัวเลือกใหม่', config: { options: [] }, position: 'zz', version: 1 },
          ],
        })
      return Promise.resolve(id)
    }
    renderDb(block(), { api })
    await userEvent.click(screen.getByRole('button', { name: th.database.table.addColumn }))
    await userEvent.click(screen.getByRole('menuitem', { name: th.database.types.SELECT }))
    act(() => arrive())
    expect(
      await screen.findByRole('dialog', { name: th.database.columnMenu.label('ตัวเลือกใหม่') }),
    ).toBeInTheDocument()
  })

  it('typing into a new row’s title survives its temp id becoming the server id (e2e D8)', async () => {
    const api = makeApi()
    const tmp = 'tmp_new_row'
    const server = '00000000-0000-4000-8000-00000000abcd'
    act(() => api.setDb({ ...api.db, rows: [...api.db.rows, row(tmp, '', 'zz')] }))
    try {
      renderDb(block(), { api })
      const titles = screen.getAllByRole('gridcell').filter((c) => c.getAttribute('data-type') === 'TITLE')
      await userEvent.dblClick(titles.at(-1)!)
      const input = await screen.findByRole('textbox', { name: th.database.types.TITLE })
      await userEvent.type(input, 'นโ')
      // the create answers mid-typing
      dbIdMap.set(tmp, server)
      act(() =>
        api.setDb({ ...api.db, rows: api.db.rows.map((r) => (r.id === tmp ? { ...r, id: server } : r)) }),
      )
      await userEvent.type(screen.getByRole('textbox', { name: th.database.types.TITLE }), 'ยบาย{Enter}')
      expect(callsOf(api, 'updateRow').at(-1)!.slice(0, 2)).toEqual([server, { title: 'นโยบาย' }])
    } finally {
      dbIdMap.clear()
    }
  })

  describe('virtualisation (> 50 rows)', () => {
    const many: DbRowDTO[] = Array.from({ length: 60 }, (_, i) =>
      row(`v${i}`, `แถว ${i}`, `a${String(i).padStart(3, '0')}`),
    )
    let restore: (() => void) | null = null
    beforeEach(() => {
      // jsdom has no layout: give the scroll container a height of ~10 rows
      const spy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(340)
      restore = () => spy.mockRestore()
    })
    afterEach(() => restore?.())

    it('renders fewer DOM rows than data rows and keeps the count', () => {
      renderDb(block(), { api: makeApi({ rows: many }) })
      expect(dataRows().length).toBeLessThan(60)
      expect(dataRows().length).toBeGreaterThan(0)
      expect(grid()).toHaveAttribute('aria-rowcount', '61')
      expect(screen.getByText(th.database.table.count(60))).toBeInTheDocument()
    })
  })
})
