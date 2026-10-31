// Test-only harness for the calendar UI (not imported by app code): theme, pickers (Buddhist era), QueryClient
// seeded with leave types and the people directory, today, the current user, undo + toaster and the dialog provider.
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { AdapterDayjsBuddhist } from '@mui/x-date-pickers/AdapterDayjsBuddhist'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'dayjs/locale/th'
import { Toaster } from 'sonner'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { CurrentUserContext } from '@/hooks/useCurrentUser'
import { TodayContext } from '@/hooks/useToday'
import type { CurrentUserDTO } from '@/lib/contracts/users'
import { qk } from '@/lib/query-keys'
import { theme } from '@/lib/theme/theme'
import { LeaveDialogProvider } from './LeaveDialogProvider'
import { PEOPLE_OPTIONS, SICK, VACATION, WORKER_USER } from './test-data.test.helper'

export function renderCalendarUi(
  ui: ReactElement,
  opts: { user?: CurrentUserDTO; today?: string; seed?: (qc: QueryClient) => void } = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  })
  qc.setQueryData(qk.leaveTypes(), { leaveTypes: [VACATION, SICK] })
  qc.setQueryData(qk.peopleOptions(), { people: PEOPLE_OPTIONS })
  opts.seed?.(qc)
  const utils = render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme} storageManager={null}>
        <LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">
          <TodayContext value={opts.today ?? '2026-09-30'}>
            <CurrentUserContext value={opts.user ?? WORKER_USER}>
              <UndoProvider>
                <LeaveDialogProvider>{ui}</LeaveDialogProvider>
                <Toaster />
              </UndoProvider>
            </CurrentUserContext>
          </TodayContext>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...utils, qc }
}

/** The hidden native inputs of the DateFields inside `root` (MUI X keeps the formatted value there). */
export function dateInputs(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('input[aria-hidden="true"]')]
}
