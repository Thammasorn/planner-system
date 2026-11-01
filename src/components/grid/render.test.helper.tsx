// Test-only harness for the grid UI (not imported by app code). Server actions and fetches are mocked per test file.
import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { vi } from 'vitest'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { PreferencesContext, type PreferencesApi } from '@/hooks/usePreferences'
import { TodayContext } from '@/hooks/useToday'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/schemas/preferences'
import { theme } from '@/lib/theme/theme'

function Prefs({ initial, children }: { initial: Preferences; children: ReactNode }) {
  const [prefs, setPrefs] = useState(initial)
  const api = useMemo<PreferencesApi>(
    () => ({ prefs, setPreference: (key, value) => setPrefs((p) => ({ ...p, [key]: value })) }),
    [prefs],
  )
  return <PreferencesContext value={api}>{children}</PreferencesContext>
}

export function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  })
}

export function Providers({
  qc,
  prefs,
  children,
}: {
  qc: QueryClient
  prefs?: Partial<Preferences>
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme} storageManager={null}>
        <TodayContext value="2026-09-30">
          <Prefs initial={{ ...DEFAULT_PREFERENCES, ...prefs }}>
            <UndoProvider>
              {children}
              <Toaster />
            </UndoProvider>
          </Prefs>
        </TodayContext>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export function renderGrid(ui: ReactElement, opts: { prefs?: Partial<Preferences>; qc?: QueryClient } = {}) {
  const qc = opts.qc ?? newQueryClient()
  const utils = render(
    <Providers qc={qc} {...(opts.prefs ? { prefs: opts.prefs } : {})}>
      {ui}
    </Providers>,
  )
  return { ...utils, qc }
}

/** Virtualizers read offsetWidth/offsetHeight (r4 §16): give the scroll element a real-looking viewport. */
export function stubViewport(width = 1600, height = 900) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)
}
