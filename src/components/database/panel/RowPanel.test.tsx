// FR-1450…1452 (plan/m11 S3.7, M11-D26): the row side panel opened by ?db=&row=.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { RowBodyView } from '@/lib/contracts/row-pages'
import { qk } from '@/lib/query-keys'
import { DatabaseBlockContent } from '../DatabaseBlockView'
import { C, callsOf, makeApi, O, TABLE_VIEW } from '../fixtures.test.helper'
import { makeQueryClient, renderDb } from '../render.test.helper'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/server/actions/databases', () => ({}))
vi.mock('@/components/editor/RowBody', () => ({
  RowBody: (p: { view: RowBodyView; variant: string }) => (
    <div data-testid="row-body" data-variant={p.variant} data-row={p.view.rowId} />
  ),
}))

const body = (rowId: string): RowBodyView => ({
  rowId,
  databaseId: 'db-1',
  ownerPageId: 'page-1',
  space: 'PROJECT',
  projectId: 'p1',
  page: null,
  can: { edit: true },
  uploadLimits: {} as RowBodyView['uploadLimits'],
})

function setup(search: string, variant: 'page' | 'compact' = 'page', over = {}) {
  window.history.replaceState(null, '', `/p/page-1${search}`)
  const api = makeApi(over)
  const qc = makeQueryClient()
  for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) qc.setQueryData(qk.rowBody(id), body(id))
  renderDb(<DatabaseBlockContent blockId="b1" variant={variant} />, { api, qc })
  return api
}

beforeEach(() => push.mockReset())
afterEach(() => window.history.replaceState(null, '', '/'))

describe('RowPanel', () => {
  it('opens from the deep link with title, every column (hidden too), body and meta', async () => {
    setup('?db=db-1&row=r1', 'page', {
      views: [{ ...TABLE_VIEW, config: { hiddenColumnIds: [C.link] } }],
    })
    const panel = await screen.findByTestId('db-row-panel')
    expect(within(panel).getByRole('textbox', { name: th.database.types.TITLE })).toHaveValue(
      'ลูกค้าส่ง spec ช้า',
    )
    const props = within(panel).getByRole('group', { name: th.database.rowPage.propertiesLabel })
    expect(within(props).getByText('ลิงก์')).toBeInTheDocument() // hidden in the view, shown in the panel
    expect(within(props).getByText('กำลังทำ')).toBeInTheDocument()
    expect(within(panel).getByTestId('row-body')).toHaveAttribute('data-variant', 'compact')
    expect(within(panel).getByText(th.database.panel.createdBy('Cindy', '30 ก.ย. 2569'))).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: th.database.panel.openAsPage })).toHaveAttribute(
      'href',
      '/r/r1',
    )
  })

  it('˄/˅ follow the open view order; Esc closes', async () => {
    setup('?db=db-1&row=r2', 'page', {
      views: [{ ...TABLE_VIEW, config: { sorts: [{ columnId: C.num, dir: 'DESC' }] } }],
    })
    const panel = await screen.findByTestId('db-row-panel')
    // order by ผลกระทบ desc: r1 (250000), r2 (80000), r3 (5), then empties r4, r5
    await userEvent.click(within(panel).getByRole('button', { name: th.database.panel.next }))
    expect(new URLSearchParams(window.location.search).get('row')).toBe('r3')
    await userEvent.click(
      within(await screen.findByTestId('db-row-panel')).getByRole('button', { name: th.database.panel.prev }),
    )
    expect(new URLSearchParams(window.location.search).get('row')).toBe('r2')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('db-row-panel')).not.toBeInTheDocument())
    expect(window.location.search).toBe('')
  })

  it('edits a property in place and deletes the row (closes, undo toast from the data layer)', async () => {
    const api = setup('?db=db-1&row=r4')
    const panel = await screen.findByTestId('db-row-panel')
    const props = within(panel).getByRole('group', { name: th.database.rowPage.propertiesLabel })
    const status = within(props).getByRole('group', { name: 'สถานะ' })
    await userEvent.click(within(status).getByRole('button'))
    await userEvent.click(screen.getByRole('option', { name: 'เสร็จ' }))
    expect(callsOf(api, 'updateRow').at(-1)).toEqual(['r4', { cells: { [C.status]: O.done } }, undefined])
    await userEvent.click(within(panel).getByRole('button', { name: th.database.panel.deleteRow }))
    expect(callsOf(api, 'deleteRows')).toEqual([[['r4']]])
    await waitFor(() => expect(screen.queryByTestId('db-row-panel')).not.toBeInTheDocument())
  })

  it('a compact editor opens rows as /r/<id> (no panel on a panel)', async () => {
    setup('', 'compact')
    const row = within(screen.getByRole('grid'))
      .getAllByRole('row')
      .find((r) => r.getAttribute('data-row-id') === 'r1')!
    await userEvent.click(
      within(row).getByRole('button', { name: `${th.database.table.openRow} ลูกค้าส่ง spec ช้า` }),
    )
    expect(push).toHaveBeenCalledWith('/r/r1')
    expect(screen.queryByTestId('db-row-panel')).not.toBeInTheDocument()
  })

  it('?db alone focuses the block title', async () => {
    setup('?db=db-1')
    await waitFor(() => expect(screen.getByTestId('db-title')).toHaveFocus())
    expect(screen.queryByTestId('db-row-panel')).not.toBeInTheDocument()
  })
})
