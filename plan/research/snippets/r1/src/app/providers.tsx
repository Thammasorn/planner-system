'use client'
import * as React from 'react'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjsBuddhist } from '@mui/x-date-pickers/AdapterDayjsBuddhist'
import 'dayjs/locale/th'
import { theme } from '@/theme'

export function Providers({ nonce, mode, children }: { nonce: string | undefined; mode: 'light' | 'dark'; children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui', enableCssLayer: true, ...(nonce ? { nonce } : {}) }}>
      <ThemeProvider theme={theme} defaultMode={mode} storageManager={null}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">
          {children}
        </LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
