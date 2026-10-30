import { screen } from '@testing-library/react'
import Button from '@mui/material/Button'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    renderWithProviders(
      <EmptyState
        title={th.home.placeholderTitle}
        description={th.home.placeholderBody}
        action={<Button>{th.common.retry}</Button>}
        icon={<svg data-testid="icon" />}
      />,
    )
    expect(screen.getByText(th.home.placeholderTitle)).toBeInTheDocument()
    expect(screen.getByText(th.home.placeholderBody)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.common.retry })).toBeInTheDocument()
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('omits the description element when absent', () => {
    const { container } = renderWithProviders(<EmptyState title={th.home.placeholderTitle} />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
