'use client'
import { createTheme } from '@mui/material/styles'
import { thTH } from '@mui/material/locale'

export type ColorScheme = 'light' | 'dark'

/** App theme (PLAN.md §3.9). Colour schemes switch through the `.light` / `.dark` class on <html> (M0-D8). */
export const theme = createTheme(
  {
    cssVariables: { colorSchemeSelector: 'class' },
    colorSchemes: {
      light: { palette: { primary: { main: '#2F5597' }, secondary: { main: '#1F3864' } } },
      dark: { palette: { primary: { main: '#8FAADC' }, secondary: { main: '#D9E2F3' } } },
    },
    typography: { fontFamily: 'var(--font-plex-latin), var(--font-plex-thai), system-ui, sans-serif' },
    components: {
      MuiButton: { defaultProps: { size: 'small' } },
      MuiIconButton: { defaultProps: { size: 'small' } },
      MuiTextField: { defaultProps: { size: 'small' } },
    },
  },
  thTH, // pickers' thTH is added with @mui/x-date-pickers (M0-D16)
)
