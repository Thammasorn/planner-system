'use client'
import type { ReactNode } from 'react'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query-client'
import { theme, type ColorScheme } from '@/lib/theme/theme'
import { ToasterHost } from './ToasterHost'

/** Order per PLAN.md §3.9. M1 inserts UndoProvider; the DatePicker milestone inserts LocalizationProvider. */
export function AppProviders({
  nonce,
  scheme,
  children,
}: {
  nonce: string | undefined
  scheme: ColorScheme
  children: ReactNode
}) {
  const queryClient = getQueryClient() // browser singleton; never useState(new QueryClient()) (r4 fact 8)
  return (
    <AppRouterCacheProvider options={{ key: 'mui', enableCssLayer: true, ...(nonce ? { nonce } : {}) }}>
      <ThemeProvider theme={theme} defaultMode={scheme} storageManager={null}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          {children}
          <ToasterHost />
        </QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
