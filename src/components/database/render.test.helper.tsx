// Test-only harness for the database UI (plan/m11 S3; not imported by app code): the app providers a database
// block needs, plus the in-memory fake DbApi (S0.12) when given.
import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { AdapterDayjsBuddhist } from '@mui/x-date-pickers/AdapterDayjsBuddhist'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'dayjs/locale/th'
import { Toaster } from 'sonner'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { TodayContext } from '@/hooks/useToday'
import type { PersonOption } from '@/lib/contracts/people'
import { qk } from '@/lib/query-keys'
import { theme } from '@/lib/theme/theme'
import { type FakeDbApi, FakeDbApiProvider } from './data/fakeDbApi.test-helper'

export const PEOPLE: PersonOption[] = [
  {
    id: 'u-cindy',
    name: 'Cindy',
    nickname: null,
    positionId: null,
    positionName: null,
    color: null,
    active: true,
  },
  {
    id: 'u-ivy',
    name: 'Ivy',
    nickname: null,
    positionId: null,
    positionName: null,
    color: null,
    active: true,
  },
  {
    id: 'u-mint',
    name: 'Mint',
    nickname: null,
    positionId: null,
    positionName: null,
    color: null,
    active: true,
  },
  {
    id: 'u-old',
    name: 'Old',
    nickname: null,
    positionId: null,
    positionName: null,
    color: null,
    active: false,
  },
]

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  })
}

export function Providers({ qc, children }: { qc: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme} storageManager={null}>
        <LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">
          <TodayContext value="2026-09-30">
            <UndoProvider>
              {children}
              <Toaster />
            </UndoProvider>
          </TodayContext>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

/** Renders `ui` with the app providers; `api` wraps it in the fake DbApi provider. */
export function renderDb(ui: ReactElement, opts: { api?: FakeDbApi; qc?: QueryClient } = {}) {
  const qc = opts.qc ?? makeQueryClient()
  qc.setQueryData(qk.peopleOptions(), { people: PEOPLE })
  const content = opts.api ? <FakeDbApiProvider api={opts.api}>{ui}</FakeDbApiProvider> : ui
  const utils = render(<Providers qc={qc}>{content}</Providers>)
  return { ...utils, qc }
}
