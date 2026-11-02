// FR-1420…1429 (plan/m11 S3.5): table rendering, virtualisation, selection + delete, new rows inheriting filters,
// footer counts, read-only, column header menu / add column.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { DbRowDTO } from '@/lib/contracts/databases'
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
