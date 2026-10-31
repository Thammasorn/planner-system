import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ArchiveProjectButton } from './ArchiveProjectButton'

const PID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'

const mocks = vi.hoisted(() => ({ archiveProject: vi.fn(), unarchiveProject: vi.fn(), push: vi.fn() }))
vi.mock('@/server/actions/projects', () => ({
  archiveProject: mocks.archiveProject,
  unarchiveProject: mocks.unarchiveProject,
}))
vi.mock('@/components/undo/useUndo', () => ({ useUndo: () => ({ push: mocks.push }) }))

beforeEach(() => {
  mocks.archiveProject.mockReset()
  mocks.unarchiveProject.mockReset()
  mocks.push.mockReset()
})

describe('ArchiveProjectButton — keyboard focus (SPEC §8.9, KEY-03)', () => {
  it('keeps focus on the button while pending and after it re-renders as "เลิก archive"', async () => {
    const user = userEvent.setup()
    let resolve: (v: { ok: true }) => void = () => {}
    mocks.archiveProject.mockReturnValue(new Promise((r) => (resolve = r)))
    const { rerender } = renderWithProviders(
      <ArchiveProjectButton projectId={PID} name="POS Upgrade" action="archive" />,
    )
    const button = screen.getByRole('button', { name: th.projects.archive })
    button.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).not.toBeDisabled()
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}') // ignored while pending
    expect(mocks.archiveProject).toHaveBeenCalledTimes(1)

    // The action's refresh() re-renders the page with the opposite action, then the mutation settles.
    rerender(<ArchiveProjectButton projectId={PID} name="POS Upgrade" action="unarchive" />)
    await act(async () => resolve({ ok: true }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1))
    const again = screen.getByRole('button', { name: th.projects.unarchive })
    expect(again).toBe(button)
    expect(again).toHaveFocus()
    expect(again).not.toHaveAttribute('aria-disabled')
    expect(document.activeElement).not.toBe(document.body)
  })
})
