// M6.1-D22 spike (plan/m06.1 S4.1): MUI components render with the string spacing function (var(--space-n)) and the
// var(--font-*) typography without emitting NaN / undefined into their styles. If this fails, the theme falls back to
// numeric `spacing: 8` and the scale is enforced by the token-scale scanner only (record the fallback).
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Grid from '@mui/material/Grid'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Toolbar from '@mui/material/Toolbar'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjsBuddhist } from '@mui/x-date-pickers/AdapterDayjsBuddhist'
import { render, screen } from '@testing-library/react'
import 'dayjs/locale/th'
import { describe, expect, it } from 'vitest'
import { DateField } from '@/components/common/DateField'
import { theme } from './theme'

function allStyles(): string {
  return Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n')
}

describe('theme spike: spacing function + token typography (M6.1-D22)', () => {
  it('Stack, Grid, Dialog, Menu, Autocomplete, Tabs, Toolbar and DateField emit no NaN / undefined', () => {
    const anchor = document.createElement('div')
    document.body.appendChild(anchor)
    render(
      <ThemeProvider theme={theme} storageManager={null}>
        <LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">
          <Toolbar>
            <Stack direction="row" spacing={1.5} sx={{ p: 2, gap: 1 }}>
              <Button variant="contained">ok</Button>
              <Chip label="chip" />
            </Stack>
          </Toolbar>
          <Grid container spacing={2}>
            <Grid size={6}>a</Grid>
            <Grid size={6}>b</Grid>
          </Grid>
          <Tabs value={0}>
            <Tab label="t1" />
          </Tabs>
          <Autocomplete
            open
            options={['หนึ่ง', 'สอง']}
            renderInput={(params) => <TextField {...params} label="ac" />}
          />
          <div data-light-form="">
            <DateField label="วันที่" value="2026-09-30" onChange={() => undefined} />
          </div>
          <Menu open anchorEl={anchor}>
            <MenuItem>m</MenuItem>
          </Menu>
          <Dialog open>
            <DialogTitle>title</DialogTitle>
            <DialogContent>content</DialogContent>
            <DialogActions>
              <Button>x</Button>
            </DialogActions>
          </Dialog>
        </LocalizationProvider>
      </ThemeProvider>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const css = allStyles()
    expect(css.length).toBeGreaterThan(1000)
    expect(css).toContain('var(--space-')
    // MUI's own palette vars carry `var(--…Channel, undefined)` fallbacks (default theme too) — not spacing output.
    const ours = css.replaceAll(/, undefined\)/g, ')')
    const bad = ours.split('}').filter((r) => /NaN|undefined/.test(r))
    expect(bad).toEqual([])
  })
})
