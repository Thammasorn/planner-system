import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ClientFormDialog } from './ClientFormDialog'

const CID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), updateClient: vi.fn() }))
vi.mock('@/server/actions/clients', () => ({
  createClient: mocks.createClient,
  updateClient: mocks.updateClient,
}))

describe('ClientFormDialog', () => {
  it('requires the name and does not call the action without it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ClientFormDialog open mode="create" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: th.clients.createTitle })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    expect(await screen.findByText(th.clients.errors.nameRequired)).toBeInTheDocument()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('shows a CONFLICT (name taken) under the name field', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.createClient.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      message: th.clients.errors.nameTaken,
    })
    renderWithProviders(<ClientFormDialog open mode="create" onClose={onClose} />)
    const name = screen.getByRole('textbox', { name: th.clients.fields.name })
    await user.type(name, 'Coral')
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    expect(await screen.findByText(th.clients.errors.nameTaken)).toBeInTheDocument()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a failed save with only a toast focuses the name field so Esc closes at once (KEY-03)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.createClient.mockResolvedValue({ ok: false, code: 'INTERNAL', message: th.errors.INTERNAL })
    renderWithProviders(<ClientFormDialog open mode="create" onClose={onClose} />)
    const name = screen.getByRole('textbox', { name: th.clients.fields.name })
    await user.type(name, 'Coral')
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    await waitFor(() => expect(mocks.createClient).toHaveBeenCalled())
    await waitFor(() => expect(name).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
    expect(name).not.toHaveAttribute('aria-invalid', 'true')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('creates with name, code, colour and note', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.createClient.mockResolvedValue({ ok: true, clientId: CID })
    renderWithProviders(<ClientFormDialog open mode="create" onClose={onClose} />)
    await user.type(screen.getByRole('textbox', { name: th.clients.fields.name }), ' SCB ')
    await user.type(screen.getByRole('textbox', { name: th.clients.fields.code }), 'SCB')
    await user.click(screen.getByRole('radio', { name: th.projects.colorOption('#0F766E') }))
    await user.type(screen.getByRole('textbox', { name: th.clients.fields.note }), 'ธนาคาร')
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mocks.createClient).toHaveBeenCalledWith({
      name: 'SCB',
      code: 'SCB',
      color: '#0F766E',
      note: 'ธนาคาร',
    })
  })

  it('edit sends only the changed fields; the note field is hidden when the note is not loaded', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.updateClient.mockResolvedValue({ ok: true })
    renderWithProviders(
      <ClientFormDialog
        open
        mode="edit"
        client={{ id: CID, name: 'Bluebird', code: null, color: null, archived: false }}
        onClose={onClose}
      />,
    )
    expect(screen.queryByRole('textbox', { name: th.clients.fields.note })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: th.clients.fields.noColor })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.type(screen.getByRole('textbox', { name: th.clients.fields.code }), 'BB')
    await user.click(screen.getByRole('button', { name: th.projects.save }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mocks.updateClient).toHaveBeenCalledWith({ clientId: CID, code: 'BB' })
  })
})
