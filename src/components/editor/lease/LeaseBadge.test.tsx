// M6.1 S2.6 — LeaseBadge (FR-540/688, M6.1-D26): holder chip with text (never colour only) + takeover when held.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { LeaseState } from '@/lib/contracts/pages'
import { LeaseBadge } from './LeaseBadge'

const theirs: LeaseState = {
  mine: false,
  holder: { userId: 'u-cindy', name: 'Cindy' },
  expiresAt: null,
  version: 1,
}
const mine: LeaseState = { mine: true, holder: { userId: 'me', name: 'Me' }, expiresAt: null, version: 1 }

describe('LeaseBadge', () => {
  it('held: "Cindy กำลังแก้" + "แก้ต่อจากนี้" that takes over', () => {
    const onTakeover = vi.fn()
    render(<LeaseBadge mode="held" lease={theirs} onTakeover={onTakeover} />)
    const badge = screen.getByTestId('lease-badge')
    expect(badge).toHaveTextContent(th.editor.lease.badge('Cindy'))
    expect(badge).toHaveAttribute('role', 'status')
    fireEvent.click(screen.getByRole('button', { name: th.editor.lease.takeover }))
    expect(onTakeover).toHaveBeenCalledOnce()
  })

  it('view-only (cannot edit): the holder text without a takeover button', () => {
    render(<LeaseBadge mode="viewOnly" lease={theirs} onTakeover={vi.fn()} />)
    expect(screen.getByTestId('lease-badge')).toHaveTextContent(th.editor.lease.badge('Cindy'))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('nothing while editing / idle / mine / no lease', () => {
    const { container, rerender } = render(<LeaseBadge mode="editing" lease={mine} onTakeover={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<LeaseBadge mode="idle" lease={null} onTakeover={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<LeaseBadge mode="held" lease={mine} onTakeover={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
