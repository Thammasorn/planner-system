import { fireEvent, render, screen, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { SHORTCUT_SCOPE_LABELS, SHORTCUT_SCOPES, SHORTCUTS } from '@/lib/shortcuts'
import { theme } from '@/lib/theme/theme'
import { ShortcutHelp } from './ShortcutHelp'

function renderHelp() {
  return render(
    <ThemeProvider theme={theme}>
      <ShortcutHelp />
      <input aria-label="typing" />
    </ThemeProvider>,
  )
}

describe('ShortcutHelp (X07, §8.6)', () => {
  it('opens with ? (Shift+Slash, Thai layout) and lists every shortcut under its scope', async () => {
    renderHelp()
    fireEvent.keyDown(document.body, { code: 'Slash', key: 'ฦ', shiftKey: true })
    const dialog = await screen.findByRole('dialog', { name: th.shortcuts.title })
    for (const scope of SHORTCUT_SCOPES) {
      const section = within(dialog).getByRole('region', { name: SHORTCUT_SCOPE_LABELS[scope] })
      for (const s of SHORTCUTS.filter((x) => x.scope === scope)) {
        expect(within(section).getByText(s.label)).toBeInTheDocument()
      }
    }
    await userEvent.keyboard('{Escape}')
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
  })

  it('ignores ? while typing', () => {
    renderHelp()
    const input = screen.getByRole('textbox', { name: 'typing' })
    fireEvent.keyDown(input, { code: 'Slash', key: '?', shiftKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
