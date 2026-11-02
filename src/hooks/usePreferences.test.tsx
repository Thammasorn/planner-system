import { act, fireEvent, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { DEFAULT_PREFERENCES, type PreferenceInput } from '@/lib/schemas/preferences'
import { renderWithProviders } from '../../tests/helpers/render'
import { PreferencesProvider } from '@/components/providers/PreferencesProvider'
import { ToasterHost } from '@/components/providers/ToasterHost'
import { usePreferences } from './usePreferences'

const mocks = vi.hoisted(() => ({ setPreference: vi.fn<(i: PreferenceInput) => Promise<unknown>>() }))
vi.mock('@/server/actions/preferences', () => ({ setPreference: mocks.setPreference }))

function Probe() {
  const { prefs, setPreference } = usePreferences()
  return (
    <>
      <span data-testid="theme">{prefs.theme}</span>
      <button onClick={() => setPreference('theme', 'dark')}>dark</button>
      <button onClick={() => setPreference('theme', 'light')}>light</button>
      <button onClick={() => setPreference('sidebar.collapsed', true)}>collapse</button>
      <button onClick={() => setPreference('theme', 'dark', { immediate: true })}>dark now</button>
    </>
  )
}

function setup(enabled = true) {
  return renderWithProviders(
    <PreferencesProvider initial={DEFAULT_PREFERENCES} enabled={enabled}>
      <Probe />
      <ToasterHost />
    </PreferencesProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.setPreference.mockReset()
  mocks.setPreference.mockResolvedValue({ ok: true })
})
afterEach(() => {
  toast.dismiss() // sonner keeps toasts in a module-level store between tests
  vi.useRealTimers()
})

describe('usePreferences', () => {
  it('U-PREF-01 two calls within 300 ms send one action call with the last value', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'dark' }))
    act(() => {
      vi.advanceTimersByTime(100)
    })
    fireEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(screen.getByTestId('theme')).toHaveTextContent('light') // optimistic
    expect(mocks.setPreference).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(mocks.setPreference).toHaveBeenCalledTimes(1)
    expect(mocks.setPreference).toHaveBeenCalledWith({ key: 'theme', value: 'light' })
  })

  it('debounces per key: different keys are each sent', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'dark' }))
    fireEvent.click(screen.getByRole('button', { name: 'collapse' }))
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(mocks.setPreference).toHaveBeenCalledTimes(2)
    expect(mocks.setPreference).toHaveBeenCalledWith({ key: 'sidebar.collapsed', value: true })
  })

  it('immediate sends the save at once, without waiting for the debounce', async () => {
    setup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'dark now' }))
      await Promise.resolve()
    })
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(mocks.setPreference).toHaveBeenCalledTimes(1)
    expect(mocks.setPreference).toHaveBeenCalledWith({ key: 'theme', value: 'dark' })
  })

  it('flushes pending saves on pagehide', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'dark' }))
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await Promise.resolve()
    })
    expect(mocks.setPreference).toHaveBeenCalledWith({ key: 'theme', value: 'dark' })
  })

  it('U-PREF-02 a failed save shows th.prefs.saveFailed', async () => {
    mocks.setPreference.mockResolvedValue({ ok: false, code: 'INTERNAL', message: 'x' })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'dark' }))
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(await screen.findByText(th.prefs.saveFailed)).toBeInTheDocument()
  })

  it('anonymous pages keep local state and never call the action', async () => {
    setup(false)
    fireEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })
    expect(mocks.setPreference).not.toHaveBeenCalled()
  })
})
