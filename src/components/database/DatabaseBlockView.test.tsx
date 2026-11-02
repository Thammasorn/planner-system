// FR-1464 / M11-D2 (plan/m11 S3.2): the block's loading and not-found states through the real data layer.
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { DatabaseBlockView } from './DatabaseBlockView'
import { makeDb } from './fixtures.test.helper'
import { renderDb } from './render.test.helper'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/databases', () => ({}))
vi.mock('@/components/editor/RowBody', () => ({ RowBody: () => null }))

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )

describe('DatabaseBlockView', () => {
  it('a foreign / missing / invisible database shows one grey box with no detail (FR-1464)', async () => {
    fetchMock.mockImplementation(() => json(404, { code: 'NOT_FOUND', message: 'x' }))
    renderDb(<DatabaseBlockView pageId="p1" databaseId="d1" blockId="b1" variant="page" editable />)
    const box = await screen.findByRole('note')
    expect(box).toHaveTextContent(th.database.notFound)
    expect(box.textContent).toBe(th.database.notFound)
    expect(box).toHaveAttribute('data-testid', 'db-block')
  })

  it('loads through the page route and renders header, tabs and the table', async () => {
    const db = makeDb()
    fetchMock.mockImplementation(() => json(200, db))
    renderDb(<DatabaseBlockView pageId="page-1" databaseId="db-1" blockId="b1" variant="page" editable />)
    expect(screen.getByRole('region', { name: th.database.loading })).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByRole('region', { name: th.database.regionLabel(db.title) })).toHaveAttribute(
      'data-database-id',
      'db-1',
    )
    const tab = screen.getByRole('tab', { name: /ตาราง/ })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    // the panel is named by the selected view's tab (not the database title), and the tab controls it
    const panel = screen.getByRole('tabpanel')
    expect(tab.id).not.toBe('')
    expect(panel).toHaveAttribute('aria-labelledby', tab.id)
    expect(tab).toHaveAttribute('aria-controls', panel.id)
    expect(screen.getByTestId('db-table')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/pages/page-1/databases/db-1')
  })

  it('editable=false (page permission) makes the block read-only even when the server allows edits (FR-1462)', async () => {
    fetchMock.mockImplementation(() => json(200, makeDb()))
    renderDb(
      <DatabaseBlockView pageId="page-1" databaseId="db-1" blockId="b1" variant="page" editable={false} />,
    )
    await screen.findByTestId('db-table')
    expect(screen.queryByRole('button', { name: th.database.table.addColumn })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: th.database.titleLabel })).not.toBeInTheDocument()
  })
})
