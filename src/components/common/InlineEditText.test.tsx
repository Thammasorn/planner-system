import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../tests/helpers/render'
import { InlineEditText } from './InlineEditText'

const LABEL = 'ชื่อโปรเจค'

describe('InlineEditText', () => {
  it('commits the trimmed value once on Enter', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn(() => Promise.resolve())
    renderWithProviders(<InlineEditText value="Old" label={LABEL} onCommit={onCommit} />)
    await user.click(screen.getByRole('button', { name: 'Old' }))
    const input = screen.getByRole('textbox', { name: LABEL })
    await user.clear(input)
    await user.type(input, '  New  {Enter}')
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('New')
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
  })

  it('Esc cancels without calling onCommit', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn(() => Promise.resolve())
    renderWithProviders(<InlineEditText value="Old" label={LABEL} onCommit={onCommit} />)
    screen.getByRole('button', { name: 'Old' }).focus()
    await user.keyboard('{Enter}')
    const input = screen.getByRole('textbox', { name: LABEL })
    await user.type(input, 'xyz')
    await user.keyboard('{Escape}')
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Old' })).toHaveFocus()
  })

  it('F2 opens the editor; an empty value reverts without a call', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn(() => Promise.resolve())
    renderWithProviders(<InlineEditText value="Old" label={LABEL} onCommit={onCommit} />)
    screen.getByRole('button', { name: 'Old' }).focus()
    await user.keyboard('{F2}')
    const input = screen.getByRole('textbox', { name: LABEL })
    await user.clear(input)
    await user.keyboard('{Enter}')
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Old' })).toBeInTheDocument()
  })

  it('reverts to the original value and keeps focus when the commit is rejected', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn(() => Promise.reject(new Error('nope')))
    renderWithProviders(<InlineEditText value="Old" label={LABEL} onCommit={onCommit} />)
    await user.click(screen.getByRole('button', { name: 'Old' }))
    const input = screen.getByRole('textbox', { name: LABEL })
    await user.clear(input)
    await user.type(input, 'Bad{Enter}')
    const display = await screen.findByRole('button', { name: 'Old' })
    expect(display).toHaveFocus()
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('commits on blur', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn(() => Promise.resolve())
    renderWithProviders(
      <>
        <InlineEditText value="Old" label={LABEL} onCommit={onCommit} />
        <button type="button">other</button>
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Old' }))
    await user.type(screen.getByRole('textbox', { name: LABEL }), '2')
    await user.click(screen.getByRole('button', { name: 'other' }))
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('Old2'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('is plain text when disabled', () => {
    renderWithProviders(<InlineEditText value="Old" label={LABEL} onCommit={vi.fn()} disabled />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Old')).toBeInTheDocument()
  })
})
