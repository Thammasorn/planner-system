// M11.1 (FR-1010, M11.1-D4): one per-user `load.display` preference toggled from any load screen.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PreferencesContext } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/schemas/preferences'
import { LoadDisplayToggle, useLoadDisplay } from './LoadDisplayToggle'

function Probe() {
  return <span data-testid="probe">{useLoadDisplay()}</span>
}

function setup(prefs: Preferences = DEFAULT_PREFERENCES) {
  const setPreference = vi.fn()
  render(
    <PreferencesContext value={{ prefs, setPreference }}>
      <LoadDisplayToggle />
      <Probe />
    </PreferencesContext>,
  )
  return setPreference
}

describe('LoadDisplayToggle (FR-1010)', () => {
  it('default PERCENT: a labelled group with "%" pressed and "วัน/capacity" not', () => {
    setup()
    const group = screen.getByRole('group', { name: th.loadDisplay.label })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.loadDisplay.PERCENT_long })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: th.loadDisplay.DAYS_long })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('PERCENT')
  })

  it('a click stores load.display; clicking the selected one does nothing', () => {
    const set = setup()
    fireEvent.click(screen.getByRole('button', { name: th.loadDisplay.DAYS_long }))
    expect(set).toHaveBeenCalledWith('load.display', 'DAYS')
    set.mockClear()
    fireEvent.click(screen.getByRole('button', { name: th.loadDisplay.PERCENT_long }))
    expect(set).not.toHaveBeenCalled()
  })

  it('reads the stored DAYS', () => {
    setup({ ...DEFAULT_PREFERENCES, 'load.display': 'DAYS' })
    expect(screen.getByRole('button', { name: th.loadDisplay.DAYS_long })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('DAYS')
  })
})
