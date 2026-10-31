// Test-only helpers for the editor's component tests (not imported by app code).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

/** A QueryClient that never refetches by itself; seed it with setQueryData before rendering. */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
}

export function renderWithClient(ui: ReactElement, qc: QueryClient = makeTestQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return { qc, ...render(ui, { wrapper: Wrapper }) }
}
