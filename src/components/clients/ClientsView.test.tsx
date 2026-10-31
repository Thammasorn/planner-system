import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { ClientListItem } from '@/lib/contracts/clients'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ClientsView } from './ClientsView'

const mocks = vi.hoisted(() => ({ archive: vi.fn(), unarchive: vi.fn() }))
vi.mock('./useClientArchive', () => ({
  useClientArchive: () => ({ archive: mocks.archive, unarchive: mocks.unarchive }),
}))
vi.mock('./ClientFormDialog', () => ({ ClientFormDialog: () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }))

const client = (id: string, name: string, archived = false): ClientListItem => ({
  id,
  name,
  code: null,
  color: null,
  archived,
  projectCount: 0,
})

const items = [client('a', 'Alpha'), client('b', 'Bravo'), client('c', 'Charlie')]

const archiveButtonOf = (id: string) =>
  within(screen.getByTestId(`client-row-${id}`)).getByRole('button', { name: th.clients.archive })

beforeEach(() => {
  mocks.archive.mockReturnValue(new Promise(() => {})) // keep the optimistic removal on screen
})

describe('ClientsView — archive focus (SPEC §8.9)', () => {
  it('archiving a row with the keyboard focuses the next row, else the previous row (never <body>)', async () => {
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(<ClientsView items={items} canManage showingArchived={false} />)
    archiveButtonOf('b').focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByTestId('client-row-b')).not.toBeInTheDocument())
    expect(archiveButtonOf('c')).toHaveFocus()
    expect(mocks.archive).toHaveBeenCalledWith(items[1])
    unmount()

    renderWithProviders(<ClientsView items={items} canManage showingArchived={false} />)
    archiveButtonOf('c').focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByTestId('client-row-c')).not.toBeInTheDocument())
    expect(archiveButtonOf('b')).toHaveFocus()
  })

  it('archiving the last listed client focuses "เพิ่มลูกค้า"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ClientsView items={[client('a', 'Alpha')]} canManage showingArchived={false} />)
    archiveButtonOf('a').focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText(th.clients.empty)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.clients.create })).toHaveFocus()
  })

  it('with archived shown the row stays and focus stays on its toggle', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ClientsView items={items} canManage showingArchived />)
    archiveButtonOf('b').focus()
    await user.keyboard('{Enter}')
    const row = screen.getByTestId('client-row-b')
    const unarchive = await within(row).findByRole('button', { name: th.clients.unarchive })
    expect(unarchive).toHaveFocus()
  })
})
