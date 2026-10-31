import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { ClientDetail } from '@/lib/contracts/clients'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ClientDetailView } from './ClientDetailView'

const mocks = vi.hoisted(() => ({ archive: vi.fn(), unarchive: vi.fn() }))
vi.mock('./useClientArchive', () => ({
  useClientArchive: () => ({ archive: mocks.archive, unarchive: mocks.unarchive }),
}))
vi.mock('./ClientFormDialog', () => ({ ClientFormDialog: () => null }))

const detail = (archived: boolean): ClientDetail => ({
  client: { id: 'c1', name: 'Coral', code: null, color: null, archived, note: null },
  projects: [],
  can: { manage: true },
})

describe('ClientDetailView — archive focus (SPEC §8.9, KEY-03)', () => {
  it('the archive button keeps focus while pending and after it re-renders as "เลิก archive"', async () => {
    const user = userEvent.setup()
    let resolve: () => void = () => {}
    mocks.archive.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const { rerender } = renderWithProviders(<ClientDetailView detail={detail(false)} />)
    const button = screen.getByRole('button', { name: th.clients.archive })
    button.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).not.toBeDisabled()
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}') // ignored while pending
    expect(mocks.archive).toHaveBeenCalledTimes(1)

    rerender(<ClientDetailView detail={detail(true)} />)
    await act(async () => resolve())
    const again = await screen.findByRole('button', { name: th.clients.unarchive })
    expect(again).toBe(button)
    await waitFor(() => expect(again).not.toHaveAttribute('aria-disabled'))
    expect(again).toHaveFocus()
  })
})
