'use client'
import { createTheme } from '@mui/material/styles'
import { thTH } from '@mui/material/locale'
import { thTH as pickersThTH } from '@mui/x-date-pickers/locales'

export const theme = createTheme(
  {
    cssVariables: { colorSchemeSelector: 'class' },
    colorSchemes: {
      light: { palette: { primary: { main: '#2F5597' }, secondary: { main: '#1F3864' } } },
      dark: { palette: { primary: { main: '#8FAADC' }, secondary: { main: '#D9E2F3' } } },
    },
    typography: {
      fontFamily: 'var(--font-plex-latin), var(--font-plex-thai), system-ui, sans-serif',
    },
  },
  thTH,
  pickersThTH,
)
