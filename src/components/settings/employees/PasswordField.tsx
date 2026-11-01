'use client'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { helperText } from '@/components/forms/field-errors'
import { th } from '@/i18n/th'
import { randomPassword } from '@/lib/random-password'

/**
 * Initial/reset password (FR-202): typed, or "สุ่มรหัส" (12 characters, crypto.getRandomValues). Plain text on
 * purpose so the manager can read a generated value; autocomplete off so browsers do not save it.
 */
export function PasswordField({
  label,
  value,
  onChange,
  errors,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  errors?: string[] | undefined
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <TextField
        label={label}
        name="initial-password"
        required
        fullWidth
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={Boolean(errors?.length)}
        helperText={helperText(errors, th.account.policyHint)}
        slotProps={{
          htmlInput: {
            autoComplete: 'off',
            spellCheck: false,
            autoCapitalize: 'none',
            'data-1p-ignore': true,
            style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
          },
        }}
      />
      <Button variant="outlined" sx={{ flex: 'none' }} onClick={() => onChange(randomPassword())}>
        {th.employees.generatePassword}
      </Button>
    </Stack>
  )
}
