import { useState } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { PROJECT_COLORS } from '@/lib/project-colors'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ColorSwatchPicker } from './ColorSwatchPicker'

function Controlled({
  initial,
  allowNone,
  onChange,
}: {
  initial: string | null
  allowNone?: boolean
  onChange?: (v: string | null) => void
}) {
  const [v, setV] = useState(initial)
  return (
    <ColorSwatchPicker
      label={th.projects.fields.color}
      value={v}
      allowNone={allowNone}
      onChange={(next) => {
        setV(next)
        onChange?.(next)
      }}
    />
  )
}

describe('ColorSwatchPicker', () => {
  it('renders 12 labelled radios in a named group; the selected one is aria-checked', () => {
    renderWithProviders(<Controlled initial="#2f5597" />)
    expect(screen.getByRole('radiogroup', { name: th.projects.fields.color })).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(12)
    const first = screen.getByRole('radio', { name: th.projects.colorOption(PROJECT_COLORS[0]) })
    expect(first).toHaveAttribute('aria-checked', 'true')
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    // roving tabindex: only the selected radio is in the tab order
    expect(first).toHaveAttribute('tabindex', '0')
    expect(radios[1]).toHaveAttribute('tabindex', '-1')
  })

  it('arrow keys move and select; space selects the focused radio', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<Controlled initial={PROJECT_COLORS[0]} onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole('radio', { name: th.projects.colorOption(PROJECT_COLORS[0]) })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    const second = screen.getByRole('radio', { name: th.projects.colorOption(PROJECT_COLORS[1]) })
    expect(second).toHaveFocus()
    expect(second).toHaveAttribute('aria-checked', 'true')
    expect(onChange).toHaveBeenLastCalledWith(PROJECT_COLORS[1])
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    const last = screen.getByRole('radio', { name: th.projects.colorOption(PROJECT_COLORS[11]) })
    expect(last).toHaveAttribute('aria-checked', 'true')
    await user.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith(PROJECT_COLORS[11])
  })

  it('click selects; allowNone adds a "no colour" radio', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<Controlled initial={null} allowNone onChange={onChange} />)
    const none = screen.getByRole('radio', { name: th.clients.fields.noColor })
    expect(none).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByRole('radio')).toHaveLength(13)
    await user.click(screen.getByRole('radio', { name: th.projects.colorOption(PROJECT_COLORS[3]) }))
    expect(onChange).toHaveBeenLastCalledWith(PROJECT_COLORS[3])
    await user.click(none)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
