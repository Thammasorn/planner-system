import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { UndoToastButton } from './UndoToastButton'

describe('UndoToastButton (React 19 + MUI 9 + jsdom)', () => {
  it('calls onUndo once and disables while pending', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const onUndo = vi.fn(() => new Promise<void>((r) => { resolve = r }))
    render(<UndoToastButton onUndo={onUndo} />)
    const btn = screen.getByRole('button', { name: th.common.undo })
    await user.click(btn)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(btn).toBeDisabled()
    resolve()
    await vi.waitFor(() => expect(btn).toBeEnabled())
  })
  it('previous render was cleaned up', () => {
    render(<UndoToastButton onUndo={async () => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
