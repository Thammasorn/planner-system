'use client'
import { createTheme } from '@mui/material/styles'
import { thTH } from '@mui/material/locale'
import { thTH as pickersThTH } from '@mui/x-date-pickers/locales'

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
      // Tab rows that do not fit (settings on a phone) scroll with arrows instead of clipping the last tabs (SPEC §7).
      MuiTabs: {
        defaultProps: { variant: 'scrollable', scrollButtons: 'auto', allowScrollButtonsMobile: true },
      },
      MuiTab: {
        styleOverrides: {
          root: ({ theme: t }) => ({ [t.breakpoints.down('sm')]: { minWidth: 64, paddingInline: 12 } }),
        },
      },
      // Phones (SPEC §7 browser support): every non-full-screen dialog uses the screen width minus a 16 px gutter
      // and never grows past the viewport height (its content scrolls), instead of MUI's fixed 32 px margins.
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme: t }) => ({
            [t.breakpoints.down('sm')]: {
              '&:not(.MuiDialog-paperFullScreen)': {
                margin: 16,
                width: 'calc(100% - 32px)',
                maxWidth: 'calc(100% - 32px)',
                maxHeight: 'calc(100% - 32px)',
              },
            },
          }),
        },
      },
    },
  },
  thTH,
  pickersThTH, // M0-D16; AppProviders also passes the same texts via LocalizationProvider localeText
)
