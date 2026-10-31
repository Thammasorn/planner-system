import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { CertaintyBadge } from './CertaintyBadge'

describe('CertaintyBadge', () => {
  it('TENTATIVE shows ◐ as a labelled image (not colour only)', () => {
    renderWithProviders(<CertaintyBadge certainty="TENTATIVE" />)
    const img = screen.getByRole('img', { name: th.projects.certainty.TENTATIVE })
    expect(img).toHaveTextContent('◐')
  })

  it('CONFIRMED renders nothing by default', () => {
    const { container } = renderWithProviders(<CertaintyBadge certainty="CONFIRMED" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('CONFIRMED with showConfirmed shows the text label', () => {
    renderWithProviders(<CertaintyBadge certainty="CONFIRMED" showConfirmed />)
    expect(screen.getByText('แน่นอน')).toBeInTheDocument()
  })
})
