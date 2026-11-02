// FR-1401 / FR-1464 (M11-D20): one query per database shared by every consumer; a 404 shows the not-found box.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DatabaseResponse } from '@/lib/contracts/databases'
import { makeQueryClient, Providers } from '../render.test.helper'
import { useDbApi } from './contract'
import { DbApiProvider } from './DbApiProvider'
import { makeFakeDatabase } from './fakeDbApi.test-helper'

const a = vi.hoisted(() => ({ updateDatabaseRow: vi.fn() }))
vi.mock('@/server/actions/databases', () => a)

const base = makeFakeDatabase()
const DB: DatabaseResponse = {
  ...base,
  rows: [
    {
      id: 'r1',
      title: 'เดิม',
      cells: {},
      position: 'a0',
      version: 1,
      hasBody: false,
      createdBy: 'u',
      createdAt: 'x',
      updatedBy: 'u',
      updatedAt: 'x',
    },
  ],
}

function Consumer({ name }: { name: string }) {
  const api = useDbApi()
  return (
    <div>
      <span data-testid={`title-${name}`}>{api.db.rows[0]?.title}</span>
      <button type="button" onClick={() => api.updateRow('r1', { title: `จาก ${name}` })}>
        {name}
      </button>
    </div>
  )
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  a.updateDatabaseRow.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )

it('two views of one database share the cache (an edit shows in both at once)', async () => {
  fetchMock.mockImplementation(() => json(200, DB))
  a.updateDatabaseRow.mockReturnValue(new Promise(() => {}))
  const qc = makeQueryClient()
  render(
    <Providers qc={qc}>
      {['A', 'B'].map((n) => (
        <DbApiProvider key={n} pageId={DB.pageId} databaseId={DB.id} loading="…" notFound="nf">
          <Consumer name={n} />
        </DbApiProvider>
      ))}
    </Providers>,
  )
  expect(await screen.findByTestId('title-B')).toHaveTextContent('เดิม')
  await userEvent.click(screen.getByRole('button', { name: 'A' }))
  expect(screen.getByTestId('title-B')).toHaveTextContent('จาก A')
  expect(fetchMock.mock.calls[0]![0]).toBe(`/api/pages/${DB.pageId}/databases/${DB.id}`)
})

it('a 404 renders the not-found fallback (no retry)', async () => {
  fetchMock.mockImplementation(() => json(404, { code: 'NOT_FOUND', message: 'x' }))
  render(
    <Providers qc={makeQueryClient()}>
      <DbApiProvider pageId="p" databaseId="d" loading="กำลังโหลด" notFound="ไม่พบ">
        <Consumer name="A" />
      </DbApiProvider>
    </Providers>,
  )
  await waitFor(() => expect(screen.getByText('ไม่พบ')).toBeInTheDocument())
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
