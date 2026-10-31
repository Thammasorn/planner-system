import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { CertaintyToggle } from './CertaintyToggle'

const PID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'

const mocks = vi.hoisted(() => ({ updateProject: vi.fn() }))
vi.mock('@/server/actions/projects', () => ({ updateProject: mocks.updateProject }))

describe('CertaintyToggle — keyboard focus (SPEC §8.9, KEY-03)', () => {
  it('the pressed button keeps focus while pending and after the switch; changes are ignored while pending', async () => {
    const user = userEvent.setup()
    let resolve: (v: { ok: true; certaintyChanged: true }) => void = () => {}
    mocks.updateProject.mockReturnValue(new Promise((r) => (resolve = r)))
    const { rerender } = renderWithProviders(<CertaintyToggle projectId={PID} certainty="CONFIRMED" />)
    const tentative = screen.getByRole('button', { name: th.projects.certainty.TENTATIVE })
    const confirmed = screen.getByRole('button', { name: th.projects.certainty.CONFIRMED })
    tentative.focus()
    await user.keyboard(' ')
    expect(mocks.updateProject).toHaveBeenCalledWith({ projectId: PID, certainty: 'TENTATIVE' })
    await waitFor(() => expect(tentative).toHaveAttribute('aria-pressed', 'true')) // optimistic
    expect(tentative).not.toBeDisabled()
    expect(tentative).toHaveFocus()
    expect(screen.getByRole('group')).toHaveAttribute('aria-disabled', 'true')

    confirmed.focus() // still focusable: the group is not disabled while pending
    expect(confirmed).toHaveFocus()
    await user.keyboard(' ') // ignored while pending
    expect(mocks.updateProject).toHaveBeenCalledTimes(1)
    expect(tentative).toHaveAttribute('aria-pressed', 'true')

    // refresh() re-renders with the new value, then the mutation settles.
    rerender(<CertaintyToggle projectId={PID} certainty="TENTATIVE" />)
    await act(async () => resolve({ ok: true, certaintyChanged: true }))
    await waitFor(() => expect(screen.getByRole('group')).not.toHaveAttribute('aria-disabled'))
    expect(confirmed).toHaveFocus()
    expect(tentative).toHaveAttribute('aria-pressed', 'true')
    expect(document.activeElement).not.toBe(document.body)
  })
})
