'use client'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { getQueryClient } from '@/lib/query-client'

// Mounted once in app/(app)/layout.tsx. NOTE: do not useState(() => new QueryClient()) here — if the tree suspends
// during the initial render React may throw that state away; getQueryClient() returns a browser singleton.
export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
