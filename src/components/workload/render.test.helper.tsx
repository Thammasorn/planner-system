// Test-only harness for the workload / people UI (not imported by app code).
import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { AdapterDayjsBuddhist } from '@mui/x-date-pickers/AdapterDayjsBuddhist'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'dayjs/locale/th'
import { Toaster } from 'sonner'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { PreferencesContext, type PreferencesApi } from '@/hooks/usePreferences'
import { TodayContext } from '@/hooks/useToday'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/schemas/preferences'
import { theme } from '@/lib/theme/theme'

function Prefs({
  initial,
  onSet,
  children,
}: {
  initial: Preferences
  onSet?: (key: string, value: unknown) => void
  children: ReactNode
}) {
  const [prefs, setPrefs] = useState(initial)
  const api = useMemo<PreferencesApi>(
    () => ({
      prefs,
      setPreference: (key, value) => {
        onSet?.(key, value)
        setPrefs((p) => ({ ...p, [key]: value }))
      },
    }),
    [prefs, onSet],
  )
  return <PreferencesContext value={api}>{children}</PreferencesContext>
}

export function newTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  })
}

export function renderUi(
  ui: ReactElement,
  opts: {
    prefs?: Partial<Preferences>
    onSetPreference?: (key: string, value: unknown) => void
    seed?: (qc: QueryClient) => void
    qc?: QueryClient
    today?: string
  } = {},
) {
  const qc = opts.qc ?? newTestQueryClient()
  opts.seed?.(qc)
  const utils = render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme} storageManager={null}>
        <LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">
          <TodayContext value={opts.today ?? '2026-09-30'}>
            <Prefs initial={{ ...DEFAULT_PREFERENCES, ...opts.prefs }} onSet={opts.onSetPreference}>
              <UndoProvider>
                {ui}
                <Toaster />
              </UndoProvider>
            </Prefs>
          </TodayContext>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...utils, qc }
}
