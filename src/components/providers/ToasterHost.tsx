'use client'
import { useColorScheme, useTheme } from '@mui/material/styles'
import { Toaster } from 'sonner'
import { th } from '@/i18n/th'

/** The single sonner <Toaster/> (PLAN.md §3.8). Colours come from the MUI CSS variables so dark mode follows the
 *  `.dark` class. `toastUndo` / `toastPromise` arrive with the undo stack in M1 (X04). */
export function ToasterHost() {
  const theme = useTheme()
  const { mode, systemMode } = useColorScheme()
  const resolved = mode === 'system' ? systemMode : mode
  const palette = (theme.vars ?? theme).palette
  return (
    <Toaster
      position="bottom-center"
      theme={resolved === 'dark' ? 'dark' : 'light'}
      duration={4000}
      visibleToasts={3}
      closeButton
      containerAriaLabel={th.common.notifications}
      toastOptions={{
        closeButtonAriaLabel: th.common.close,
        style: {
          fontFamily: theme.typography.fontFamily,
          background: palette.background.paper,
          color: palette.text.primary,
          border: `1px solid ${palette.divider}`,
        },
        actionButtonStyle: { background: palette.primary.main, color: palette.primary.contrastText },
      }}
    />
  )
}
