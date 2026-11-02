// FR-1426…1428 (plan/m11 S3.3): sort (≤ 3), filter (≤ 10, per-type ops, incomplete dimmed, clear) and columns menus.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { DbViewDTO } from '@/lib/contracts/databases'
import { C, callsOf, makeApi, O, TABLE_VIEW } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'
import { ColumnsMenu } from './ColumnsMenu'
import { DatabaseToolbar } from './DatabaseToolbar'
import { FilterMenu } from './FilterMenu'
import { SortMenu } from './SortMenu'

vi.mock('@/server/actions/databases', () => ({}))

const view = (config: DbViewDTO['config']): DbViewDTO => ({ ...TABLE_VIEW, config })
const lastConfig = (api: ReturnType<typeof makeApi>) =>
  (callsOf(api, 'updateView').at(-1)![1] as { config: DbViewDTO['config'] }).config

describe('DatabaseToolbar', () => {
  it('shows live counts; read-only viewers get no toolbar', () => {
    const v = view({
      sorts: [
        { columnId: C.num, dir: 'DESC' },
        { columnId: 'c-gone', dir: 'ASC' },
      ],
      filters: [
        { columnId: C.status, op: 'isAnyOf', value: [O.doing] },
        { columnId: C.done, op: 'unchecked' },
      ],
    })
    const { unmount } = renderDb(<DatabaseToolbar view={v} narrow={false} filterRequest={0} />, {
      api: makeApi(),
    })
    expect(screen.getByRole('button', { name: th.database.toolbar.sort(1) })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.database.toolbar.filter(2) })).toBeInTheDocument()
    unmount()
    renderDb(<DatabaseToolbar view={v} narrow={false} filterRequest={0} />, {
      api: makeApi({}, { canEdit: false }),
    })
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('collapses into ⋯ below 600 px (M11-D31)', async () => {
    renderDb(<DatabaseToolbar view={view({})} narrow filterRequest={0} />, { api: makeApi() })
    expect(screen.queryByRole('button', { name: th.database.toolbar.sort(0) })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: th.database.toolbar.more }))
    await userEvent.click(screen.getByRole('menuitem', { name: th.database.toolbar.filter(0) }))
    expect(await screen.findByTestId('db-filter-menu')).toBeInTheDocument()
  })
})

describe('SortMenu', () => {
  it('adds up to 3 sorts, changes direction and removes', async () => {
    const api = makeApi()
    renderDb(<SortMenu anchorEl={document.body} view={view({})} onClose={() => {}} />, { api })
    await userEvent.click(screen.getByRole('button', { name: th.database.toolbar.addSort }))
    expect(lastConfig(api).sorts).toEqual([{ columnId: C.title, dir: 'ASC' }])
  })

  it('at 3 sorts the add button is disabled with the limit text', () => {
    const v = view({
      sorts: [
        { columnId: C.num, dir: 'DESC' },
        { columnId: C.date, dir: 'ASC' },
        { columnId: C.title, dir: 'ASC' },
      ],
    })
    renderDb(<SortMenu anchorEl={document.body} view={v} onClose={() => {}} />, { api: makeApi() })
    expect(screen.getByRole('button', { name: th.database.errors.limit.sorts(3) })).toBeDisabled()
  })

  it('direction select writes the view', async () => {
    const api = makeApi()
    renderDb(
      <SortMenu
        anchorEl={document.body}
        view={view({ sorts: [{ columnId: C.num, dir: 'ASC' }] })}
        onClose={() => {}}
      />,
      { api },
    )
    await userEvent.click(screen.getByRole('combobox', { name: th.database.toolbar.sortDir }))
    await userEvent.click(screen.getByRole('option', { name: th.database.toolbar.desc }))
    expect(lastConfig(api).sorts).toEqual([{ columnId: C.num, dir: 'DESC' }])
    await userEvent.click(screen.getByRole('button', { name: th.database.toolbar.removeSort }))
    expect(lastConfig(api).sorts).toEqual([])
  })
})

describe('FilterMenu', () => {
  it('new filter is incomplete and dimmed; operators follow the column type', async () => {
    const api = makeApi()
    const v = view({ filters: [{ columnId: C.status, op: 'isAnyOf' }] })
    renderDb(<FilterMenu anchorEl={document.body} view={v} onClose={() => {}} />, { api })
    const row = screen.getByTestId('db-filter-row')
    expect(row).toHaveAttribute('data-incomplete', 'true')
    expect(within(row).getByText(th.database.filters.incomplete)).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('combobox', { name: th.database.filters.op }))
    const ops = screen.getAllByRole('option').map((o) => o.textContent)
    expect(ops).toEqual(
      ['isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'].map((k) => th.database.filters.ops[k as 'isEmpty']),
    )
  })

  it('picks option ids as the value; "ล้างตัวกรอง" clears every filter', async () => {
    const api = makeApi()
    const v = view({ filters: [{ columnId: C.status, op: 'isAnyOf' }] })
    renderDb(<FilterMenu anchorEl={document.body} view={v} onClose={() => {}} />, { api })
    await userEvent.click(screen.getByRole('combobox', { name: th.database.filters.value }))
    await userEvent.click(screen.getByRole('option', { name: 'กำลังทำ' }))
    expect(lastConfig(api).filters).toEqual([{ columnId: C.status, op: 'isAnyOf', value: [O.doing] }])
    await userEvent.click(screen.getByRole('button', { name: th.database.toolbar.clearFilters }))
    expect(lastConfig(api).filters).toEqual([])
  })

  it('person filters offer "ฉัน" (@me)', async () => {
    const api = makeApi()
    const v = view({ filters: [{ columnId: C.people, op: 'hasAny' }] })
    renderDb(<FilterMenu anchorEl={document.body} view={v} onClose={() => {}} />, { api })
    await userEvent.click(screen.getByRole('combobox', { name: th.database.filters.value }))
    await userEvent.click(screen.getByRole('option', { name: th.database.filters.me }))
    expect(lastConfig(api).filters).toEqual([{ columnId: C.people, op: 'hasAny', value: ['@me'] }])
  })

  it('text value commits on Enter; date filter takes "วันนี้" or a typed date', async () => {
    const api = makeApi()
    const v = view({
      filters: [
        { columnId: C.title, op: 'contains' },
        { columnId: C.date, op: 'is' },
      ],
    })
    renderDb(<FilterMenu anchorEl={document.body} view={v} onClose={() => {}} />, { api })
    await userEvent.type(
      screen.getAllByRole('textbox', { name: th.database.filters.value })[0]!,
      'API{Enter}',
    )
    expect(lastConfig(api).filters![0]).toEqual({ columnId: C.title, op: 'contains', value: 'API' })
    await userEvent.type(
      screen.getByRole('textbox', { name: th.database.filters.specificDate }),
      '5/11/2569{Enter}',
    )
    expect(lastConfig(api).filters![1]).toEqual({
      columnId: C.date,
      op: 'is',
      value: { kind: 'date', date: '2026-11-05' },
    })
  })

  it('at 10 filters "เพิ่มตัวกรอง" is disabled', () => {
    const v = view({
      filters: Array.from({ length: 10 }, () => ({ columnId: C.done, op: 'checked' as const })),
    })
    renderDb(<FilterMenu anchorEl={document.body} view={v} onClose={() => {}} />, { api: makeApi() })
    expect(screen.getByRole('button', { name: th.database.errors.limit.filters(10) })).toBeDisabled()
  })
})

describe('ColumnsMenu', () => {
  it('toggles hidden columns; TITLE cannot be hidden', async () => {
    const api = makeApi()
    renderDb(<ColumnsMenu anchorEl={document.body} view={view({})} onClose={() => {}} />, { api })
    expect(screen.getByRole('checkbox', { name: 'ชื่อ' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: 'ลิงก์' }))
    expect(lastConfig(api).hiddenColumnIds).toEqual([C.link])
    await userEvent.click(screen.getByRole('button', { name: th.database.toolbar.hideAll }))
    expect(lastConfig(api).hiddenColumnIds).not.toContain(C.title)
  })
})
