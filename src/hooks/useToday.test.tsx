import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodayProvider } from '@/components/providers/TodayProvider'
import { useToday } from './useToday'

function Probe() {
  return <span data-testid="today">{useToday()}</span>
}

describe('useToday', () => {
  it('returns the date given to TodayProvider', () => {
    render(
      <TodayProvider today="2026-09-30">
        <Probe />
      </TodayProvider>,
    )
    expect(screen.getByTestId('today')).toHaveTextContent('2026-09-30')
  })

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/TodayProvider/)
  })
})
