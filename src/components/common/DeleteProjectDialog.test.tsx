import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { DeleteProjectDialog } from './DeleteProjectDialog'

const NAME = 'POS Upgrade'

describe('DeleteProjectDialog', () => {
  it('enables the confirm button only for the exact (trimmed) project name', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(() => Promise.resolve())
    renderWithProviders(
      <DeleteProjectDialog open projectName={NAME} onClose={vi.fn()} onConfirm={onConfirm} />,
    )
    const dialog = screen.getByRole('dialog', { name: th.projects.deleteDialog.title })
    expect(dialog).toHaveTextContent(th.projects.deleteDialog.body(NAME))
    expect(dialog).toHaveTextContent(th.projects.deleteDialog.prompt(NAME))
    const confirm = screen.getByRole('button', { name: th.projects.deleteDialog.confirm })
    expect(confirm).toBeDisabled()
    const input = screen.getByRole('textbox', { name: th.projects.deleteDialog.inputLabel })
    await user.type(input, 'POS')
    expect(confirm).toBeDisabled()
    await user.keyboard('{Enter}')
    expect(onConfirm).not.toHaveBeenCalled()
    await user.type(input, ' Upgrade ')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledWith('POS Upgrade ')
  })

  it('Esc calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<DeleteProjectDialog open projectName={NAME} onClose={onClose} onConfirm={vi.fn()} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('disables both buttons while pending and re-enables them after a failure', async () => {
    const user = userEvent.setup()
    let reject: (e: Error) => void = () => {}
    const onConfirm = vi.fn(() => new Promise<void>((_res, rej) => (reject = rej)))
    renderWithProviders(
      <DeleteProjectDialog open projectName={NAME} onClose={vi.fn()} onConfirm={onConfirm} />,
    )
    await user.type(screen.getByRole('textbox', { name: th.projects.deleteDialog.inputLabel }), NAME)
    await user.keyboard('{Enter}')
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const confirm = screen.getByRole('button', { name: th.projects.deleteDialog.confirm })
    expect(confirm).toBeDisabled()
    expect(screen.getByRole('button', { name: th.projects.cancel })).toBeDisabled()
    reject(new Error('x'))
    await waitFor(() => expect(confirm).toBeEnabled())
  })

  it('a failed delete returns focus to the name field (never <body>) so Esc closes at once (KEY-03)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    let reject: (e: Error) => void = () => {}
    const onConfirm = vi.fn(() => new Promise<void>((_res, rej) => (reject = rej)))
    renderWithProviders(
      <DeleteProjectDialog open projectName={NAME} onClose={onClose} onConfirm={onConfirm} />,
    )
    const input = screen.getByRole('textbox', { name: th.projects.deleteDialog.inputLabel })
    await user.type(input, NAME)
    screen.getByRole('button', { name: th.projects.deleteDialog.confirm }).focus()
    await user.keyboard('{Enter}')
    expect(input).toBeDisabled()
    reject(new Error('x'))
    await waitFor(() => expect(input).toBeEnabled())
    expect(input).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
