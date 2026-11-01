'use client'
import { createTheme, type Shadows } from '@mui/material/styles'
import { thTH } from '@mui/material/locale'
import { thTH as pickersThTH } from '@mui/x-date-pickers/locales'
import type {} from '@mui/x-date-pickers/themeAugmentation'
import { SURFACE, spaceVar } from './tokens'

export type ColorScheme = 'light' | 'dark'

// The MUI theme reads the SPEC §8.12 scale (FR-1605, M6.1-D22): typography variants → var(--font-*), spacing factors →
// var(--space-n), shape 6 = --radius-md, palette hex values mirror src/app/tokens.css (theme.test.ts checks the parity),
// light shadows only, and the borderless "light form" look under [data-light-form] (FR-1604). This file defines the
// scale and is excluded from the token-scale scanner (M6.1-D24). Colour schemes switch through the `.light` / `.dark`
// class on <html> (M0-D8).

const font = (size: string, weight: string) => ({
  fontSize: `var(--font-${size})`,
  fontWeight: `var(--weight-${weight})`,
  lineHeight: 'var(--leading-ui)',
  letterSpacing: 0,
})

/** Light elevation (§8.12 "ไม่ใช้เงาหนัก"): menus and popovers get a soft shadow, nothing heavier. */
const LIGHT_SHADOW = '0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.08)'
const shadows = ['none', ...Array.from({ length: 24 }, () => LIGHT_SHADOW)] as Shadows

/** Outlined inputs inside a light form: no frame until hover / focus, hover background --hover-bg (FR-1604). */
function lightInput(notched: string, focused: string, error: string, disabled: string) {
  return {
    '[data-light-form] &': {
      backgroundColor: 'transparent',
      transition: 'background-color 120ms ease',
      [`& .${notched}`]: { borderColor: 'transparent' },
      [`&:hover:not(.${disabled})`]: { backgroundColor: 'var(--hover-bg)' },
      [`&:hover:not(.${focused}):not(.${error}) .${notched}`]: { borderColor: 'transparent' },
      [`&.${focused}`]: { backgroundColor: 'var(--surface)' },
      [`&.${error} .${notched}`]: { borderColor: 'var(--mui-palette-error-main)' },
    },
  }
}

export const theme = createTheme(
  {
    cssVariables: { colorSchemeSelector: 'class' },
    colorSchemes: {
      light: {
        palette: {
          primary: { main: '#2F5597' },
          secondary: { main: '#1F3864' },
          divider: SURFACE.light['border-subtle'],
          text: { secondary: SURFACE.light['text-secondary'] },
          background: { default: SURFACE.light.surface, paper: SURFACE.light.surface },
          action: { hover: SURFACE.light['hover-bg'] },
        },
      },
      dark: {
        palette: {
          primary: { main: '#8FAADC' },
          secondary: { main: '#D9E2F3' },
          divider: SURFACE.dark['border-subtle'],
          text: { secondary: SURFACE.dark['text-secondary'] },
          background: { default: SURFACE.dark.surface, paper: SURFACE.dark.surface },
          action: { hover: SURFACE.dark['hover-bg'] },
        },
      },
    },
    typography: {
      fontFamily: 'var(--font-plex-latin), var(--font-plex-thai), system-ui, sans-serif',
      fontSize: 14,
      h1: font('3xl', 'bold'),
      h2: font('2xl', 'bold'),
      h3: font('xl', 'bold'),
      h4: font('lg', 'bold'),
      h5: font('md', 'bold'),
      h6: font('md', 'bold'),
      subtitle1: font('md', 'medium'),
      subtitle2: font('sm', 'medium'),
      body1: font('md', 'regular'),
      body2: font('sm', 'regular'),
      caption: font('xs', 'regular'),
      overline: { ...font('xs', 'medium'), textTransform: 'none' },
      button: { ...font('md', 'medium'), textTransform: 'none' },
    },
    spacing: (factor: number) => spaceVar(factor),
    shape: { borderRadius: 6 },
    shadows,
    components: {
      MuiButton: {
        defaultProps: { size: 'small', disableElevation: true },
        styleOverrides: { root: { borderRadius: 'var(--radius-md)', textTransform: 'none' } },
      },
      MuiIconButton: { defaultProps: { size: 'small' } },
      MuiToggleButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontSize: 'var(--font-sm)', borderRadius: 'var(--radius-md)' },
        },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiChip: {
        defaultProps: { size: 'small' },
        styleOverrides: { root: { fontSize: 'var(--font-xs)', borderRadius: 'var(--radius-sm)' } },
      },
      // Tab rows that do not fit (settings on a phone) scroll with arrows instead of clipping the last tabs (SPEC §7).
      MuiTabs: {
        defaultProps: { variant: 'scrollable', scrollButtons: 'auto', allowScrollButtonsMobile: true },
        styleOverrides: {
          root: { minHeight: 40, borderBottom: '1px solid var(--border-subtle)' },
          indicator: { height: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: ({ theme: t }) => ({
            minHeight: 40,
            fontSize: 'var(--font-md)',
            fontWeight: 'var(--weight-medium)',
            textTransform: 'none',
            paddingInline: 'var(--space-3)',
            [t.breakpoints.down('sm')]: { minWidth: 64 },
          }),
        },
      },
      MuiPaper: {
        styleOverrides: {
          rounded: { borderRadius: 'var(--radius-lg)' },
          outlined: { borderColor: 'var(--border-subtle)' },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: { border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' },
        },
      },
      MuiMenuItem: { styleOverrides: { root: { fontSize: 'var(--font-md)' } } },
      MuiTooltip: { styleOverrides: { tooltip: { fontSize: 'var(--font-xs)' } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottomColor: 'var(--border-subtle)', fontSize: 'var(--font-md)' },
          head: {
            fontSize: 'var(--font-sm)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-secondary)',
          },
        },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: 'var(--radius-md)' } } },
      MuiDialogTitle: {
        styleOverrides: { root: { fontSize: 'var(--font-lg)', fontWeight: 'var(--weight-bold)' } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: lightInput('MuiOutlinedInput-notchedOutline', 'Mui-focused', 'Mui-error', 'Mui-disabled'),
        },
      },
      MuiPickersOutlinedInput: {
        styleOverrides: {
          root: lightInput(
            'MuiPickersOutlinedInput-notchedOutline',
            'Mui-focused',
            'Mui-error',
            'Mui-disabled',
          ),
        },
      },
      // Phones (SPEC §7 browser support): every non-full-screen dialog uses the screen width minus a 16 px gutter
      // and never grows past the viewport height (its content scrolls), instead of MUI's fixed 32 px margins.
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme: t }) => ({
            [t.breakpoints.down('sm')]: {
              '&:not(.MuiDialog-paperFullScreen)': {
                margin: 'var(--space-4)',
                width: 'calc(100% - 2 * var(--space-4))',
                maxWidth: 'calc(100% - 2 * var(--space-4))',
                maxHeight: 'calc(100% - 2 * var(--space-4))',
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
