'use client'
import type { ReactNode } from 'react'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { QueryClientProvider } from '@tanstack/react-query'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { getQueryClient } from '@/lib/query-client'
import type { Preferences } from '@/lib/schemas/preferences'
import { theme } from '@/lib/theme/theme'
import { PreferencesProvider } from './PreferencesProvider'
import { ToasterHost } from './ToasterHost'

/**
 * Order per PLAN.md §3.9 / M1 S3.1. `prefs.theme` is the initial MUI mode; `system` resolves on the client
 * (`useColorScheme`), never through localStorage (`storageManager={null}`). The DatePicker milestone inserts
 * LocalizationProvider after QueryClientProvider.
 */
export function AppProviders({
  nonce,
  prefs,
  signedIn,
  children,
}: {
  nonce: string | undefined
  prefs: Preferences
  /** false on anonymous pages (/login): preferences stay local and are never saved */
  signedIn: boolean
  children: ReactNode
}) {
  const queryClient = getQueryClient() // browser singleton; never useState(new QueryClient()) (r4 fact 8)
  return (
    <AppRouterCacheProvider options={{ key: 'mui', enableCssLayer: true, ...(nonce ? { nonce } : {}) }}>
      <ThemeProvider theme={theme} defaultMode={prefs.theme} storageManager={null}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <PreferencesProvider initial={prefs} enabled={signedIn}>
            <UndoProvider>
              {children}
              <ToasterHost />
            </UndoProvider>
          </PreferencesProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
