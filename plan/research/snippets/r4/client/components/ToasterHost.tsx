'use client'
import { useColorScheme, useTheme } from '@mui/material/styles'
import { Toaster, toast } from 'sonner'
import { th } from '@/i18n/th'

export const UNDO_TOAST_MS = 8000

/** Single <Toaster/> in the (app) layout. Colors come from the MUI theme (tokens), not sonner defaults. */
export function ToasterHost() {
  const theme = useTheme()
  const { mode, systemMode } = useColorScheme()
  const resolved = mode === 'system' ? systemMode : mode
  return (
    <Toaster
      position="bottom-center"
      theme={resolved === 'dark' ? 'dark' : 'light'}
      duration={4000}
      visibleToasts={3}
      closeButton
      containerAriaLabel={th.common.undo}
      toastOptions={{
        style: {
          fontFamily: theme.typography.fontFamily,
          background: theme.palette.background.paper,
          color: theme.palette.text.primary,
          border: `1px solid ${theme.palette.divider}`,
        },
        actionButtonStyle: { background: theme.palette.primary.main, color: theme.palette.primary.contrastText },
      }}
    />
  )
}

/** "Deleted X · Undo" (SPEC P2 / §7.5): 8 s, clickable; Cmd+Z uses the same undo() from the undo stack. */
export function toastUndo(message: string, undo: () => Promise<void> | void): string | number {
  return toast(message, {
    duration: UNDO_TOAST_MS,
    action: {
      label: th.common.undo,
      onClick: () => {
        void undo()
      },
    },
  })
}

/** Promise toast for slower actions (e.g. CSV holiday import). `unwrap()` re-exposes the promise. */
export async function toastPromise<T>(p: Promise<T>, msgs: { loading: string; success: string; error: string }): Promise<T> {
  return toast.promise(p, msgs).unwrap()
}
