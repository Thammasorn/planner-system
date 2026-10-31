// Test-only harness for the tasks UI (not imported by app code).
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
import { qk } from '@/lib/query-keys'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/schemas/preferences'
import { theme } from '@/lib/theme/theme'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { PEOPLE, PID } from './fixtures.test.data'

function Prefs({ initial, children }: { initial: Preferences; children: ReactNode }) {
  const [prefs, setPrefs] = useState(initial)
  const api = useMemo<PreferencesApi>(
    () => ({ prefs, setPreference: (key, value) => setPrefs((p) => ({ ...p, [key]: value })) }),
    [prefs],
  )
  return <PreferencesContext value={api}>{children}</PreferencesContext>
}

export function renderTasks(
  ui: ReactElement,
  opts: { data?: ProjectTasksResponse; prefs?: Partial<Preferences>; seed?: (qc: QueryClient) => void } = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  })
  if (opts.data) qc.setQueryData(qk.projectTasks(PID), opts.data)
  qc.setQueryData(qk.peopleOptions(), PEOPLE)
  opts.seed?.(qc)
  const utils = render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme} storageManager={null}>
        <LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">
          <TodayContext value="2026-09-30">
            <Prefs initial={{ ...DEFAULT_PREFERENCES, ...opts.prefs }}>
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

/** An ok action result. */
export const ok = <T extends object>(v: T) => Promise.resolve({ ok: true as const, ...v })
