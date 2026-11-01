'use client'
import { Fragment, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import { useHotkeys } from '@/hooks/useHotkeys'
import { th } from '@/i18n/th'
import type { Hotkey } from '@/lib/keys'
import {
  SHORTCUT_KEY_LABELS,
  SHORTCUT_SCOPE_LABELS,
  SHORTCUT_SCOPES,
  SHORTCUTS,
  type KeyToken,
} from '@/lib/shortcuts'

/** `?` = Shift+Slash by physical key (Thai layout), `?` by character elsewhere (X49). */
export const HELP_HOTKEY: Hotkey = { code: 'Slash', key: '?', shift: true }

function isApple(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

function keyText(token: KeyToken, apple: boolean): string {
  if (token === 'Mod') return apple ? th.shortcuts.keys.ModMac : th.shortcuts.keys.Mod
  return SHORTCUT_KEY_LABELS[token]
}

/**
 * Data-driven shortcut help (X07, SPEC §8.6): one section per SHORTCUT_SCOPES entry, each shortcut as `<kbd>` keys and
 * its label. Mounted once in AppShell; `?` opens it outside editable targets; Esc closes.
 */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false)
  useHotkeys([{ hotkey: HELP_HOTKEY, handler: () => setOpen(true) }])
  return <ShortcutHelpDialog open={open} onClose={() => setOpen(false)} />
}

export function ShortcutHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const apple = open && isApple()
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="shortcut-help-title">
      <DialogTitle id="shortcut-help-title" sx={{ pr: 6 }}>
        {th.shortcuts.title}
        <IconButton
          aria-label={th.shortcuts.close}
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseOutlined />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {SHORTCUT_SCOPES.map((scope) => (
          <Box key={scope} component="section" aria-labelledby={`shortcut-scope-${scope}`} sx={{ mb: 2 }}>
            <Typography id={`shortcut-scope-${scope}`} variant="subtitle2" component="h3" sx={{ mb: 1 }}>
              {SHORTCUT_SCOPE_LABELS[scope]}
            </Typography>
            <Box
              component="dl"
              sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1, alignItems: 'center' }}
            >
              {SHORTCUTS.filter((s) => s.scope === scope).map((s) => (
                <Fragment key={s.id}>
                  <Box component="dt" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {s.combos.map((combo, ci) => (
                      <Box
                        key={ci}
                        component="span"
                        sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}
                      >
                        {ci > 0 ? <span aria-hidden="true">/</span> : null}
                        {combo.map((k, ki) => (
                          <Fragment key={ki}>
                            {ki > 0 ? <span aria-hidden="true">+</span> : null}
                            <Box
                              component="kbd"
                              sx={{
                                px: 0.5,
                                py: 0,
                                border: 1,
                                borderColor: 'divider',
                                borderRadius: 'var(--radius-sm)',
                                fontFamily: 'inherit',
                                fontSize: 'var(--font-sm)',
                                bgcolor: 'action.hover',
                              }}
                            >
                              {keyText(k, apple)}
                            </Box>
                          </Fragment>
                        ))}
                      </Box>
                    ))}
                  </Box>
                  <Box component="dd" sx={{ m: 0 }}>
                    {s.label}
                  </Box>
                </Fragment>
              ))}
            </Box>
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  )
}
