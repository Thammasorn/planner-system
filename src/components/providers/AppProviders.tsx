'use client'
import type { ReactNode } from 'react'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { AdapterDayjsBuddhist } from '@mui/x-date-pickers/AdapterDayjsBuddhist'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { thTH as pickersThTH } from '@mui/x-date-pickers/locales'
import { QueryClientProvider } from '@tanstack/react-query'
import 'dayjs/locale/th'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { getQueryClient } from '@/lib/query-client'
import type { Preferences } from '@/lib/schemas/preferences'
import { theme } from '@/lib/theme/theme'
import { PreferencesProvider } from './PreferencesProvider'
import { ToasterHost } from './ToasterHost'

/**
 * Order per PLAN.md §3.9 / M1 S3.1. `prefs.theme` is the initial MUI mode; `system` resolves on the client
 * (`useColorScheme`), never through localStorage (`storageManager={null}`). M3 (S0.14, X50): LocalizationProvider
 * with AdapterDayjsBuddhist ('th' → 30/09/2569) sits inside ThemeProvider, outside UndoProvider; the pickers' Thai
 * texts come from `localeText` (the theme also carries the same pickers thTH as a createTheme argument).
 */
const PICKERS_LOCALE_TEXT = pickersThTH.components.MuiLocalizationProvider.defaultProps.localeText

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
          <LocalizationProvider
            dateAdapter={AdapterDayjsBuddhist}
            adapterLocale="th"
            localeText={PICKERS_LOCALE_TEXT}
          >
            <PreferencesProvider initial={prefs} enabled={signedIn}>
              <UndoProvider>
                {children}
                <ToasterHost />
              </UndoProvider>
            </PreferencesProvider>
          </LocalizationProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
