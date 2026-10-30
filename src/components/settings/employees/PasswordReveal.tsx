'use client'
import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ContentCopy from '@mui/icons-material/ContentCopy'
import { th } from '@/i18n/th'
import { copyText } from '@/lib/copy-text'

/**
 * The one-time password view after create/reset (FR-202, AC-201, AC-202). The password lives only in the parent
 * dialog's state — never in a URL, query cache, toast or storage — and disappears when the dialog closes.
 */
export function PasswordReveal({ email, password }: { email: string; password: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const onCopy = async () => {
    const ok = await copyText(password)
    setStatus(ok ? 'copied' : 'failed')
    if (!ok) inputRef.current?.select()
  }
  return (
    <Stack spacing={2}>
      <Alert severity="warning">{th.employees.passwordShownOnce}</Alert>
      <Typography variant="body2">{th.employees.createdHint(email)}</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          label={th.auth.password}
          value={password}
          fullWidth
          slotProps={{
            htmlInput: {
              readOnly: true,
              ref: inputRef,
              spellCheck: false,
              style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '1.05rem' },
            },
          }}
        />
        {/* autoFocus: this view replaces the form whose focused submit button just unmounted — keep keyboard focus
            (and Esc) inside the dialog, on the one action the user needs here. */}
        <Button
          autoFocus
          variant="contained"
          startIcon={<ContentCopy />}
          sx={{ flex: 'none' }}
          onClick={() => void onCopy()}
        >
          {th.employees.copyPassword}
        </Button>
      </Stack>
      <Typography
        role="status"
        variant="body2"
        sx={{ minHeight: '1.5em', color: status === 'failed' ? 'error.main' : 'text.secondary' }}
      >
        {status === 'copied' ? th.common.copied : status === 'failed' ? th.employees.copyFailed : ''}
      </Typography>
    </Stack>
  )
}
