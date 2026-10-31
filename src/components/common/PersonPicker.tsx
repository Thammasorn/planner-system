'use client'
import { useMemo, useState, type ReactNode } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import { displayName } from '@/lib/display-name'
import { filterPeople } from '@/lib/people/filter'
import { UserAvatar } from './UserAvatar'

export interface PersonPickerProps {
  options: readonly PersonOption[]
  /** Already chosen people (e.g. current members) — not offered. */
  excludeIds?: ReadonlySet<string>
  onSelect: (p: PersonOption) => void
  label: string
  disabled?: boolean
  /**
   * Controlled selection (e.g. the LEAD field). When omitted the picker is an "add" field: it stays empty and is
   * cleared after every pick (members panel).
   */
  value?: PersonOption | null
  /** Controlled mode: the selection was cleared. */
  onClear?: () => void
  helperText?: ReactNode
  /** The field holds an invalid value (sets aria-invalid; used for server field errors). */
  error?: boolean
  /** The directory is still loading — shows "กำลังโหลด…" instead of "ไม่พบพนักงาน". */
  loading?: boolean
  /** The directory failed to load (P4: never shown as "nobody matches") — shows the error and a retry button. */
  loadError?: boolean
  onRetry?: () => void
  placeholder?: string
  /** Browser id of the input (for e2e / label wiring). */
  id?: string
}

/**
 * Person picker (FR-403, PLAN §3.9): searches name, nickname and position (`filterPeople`); offers only active
 * people (AC-203 / X12) who are not in `excludeIds`. Rows show avatar, display name and full name · position.
 * M3 reuses it for assignees.
 */
export function PersonPicker({
  options,
  excludeIds,
  onSelect,
  label,
  disabled,
  value,
  onClear,
  helperText,
  error,
  loading,
  loadError,
  onRetry,
  placeholder,
  id,
}: PersonPickerProps) {
  const controlled = value !== undefined
  const [addInput, setAddInput] = useState('')
  const available = useMemo(
    () => options.filter((o) => o.active && !excludeIds?.has(o.id)),
    [options, excludeIds],
  )

  return (
    <Autocomplete<PersonOption, false, false, false>
      id={id}
      options={available}
      value={controlled ? value : null}
      onChange={(_e, next) => {
        if (next) onSelect(next)
        else onClear?.()
      }}
      {...(controlled
        ? {}
        : {
            inputValue: addInput,
            onInputChange: (_e: unknown, v: string, reason: string) =>
              setAddInput(reason === 'input' ? v : ''),
          })}
      disabled={disabled}
      filterOptions={(opts, state) => filterPeople(opts, state.inputValue)}
      getOptionLabel={(o) => displayName(o)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={loadError ? th.members.pickerLoadError : th.members.pickerEmpty}
      loading={Boolean(loading)}
      loadingText={th.common.loading}
      autoHighlight
      size="small"
      renderOption={(props, option) => {
        const { key, ...rest } = props
        return (
          <Box component="li" key={key} {...rest} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <UserAvatar user={option} size={24} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" component="span" sx={{ display: 'block', fontWeight: 500 }}>
                {displayName(option)}
              </Typography>
              <Typography
                variant="caption"
                component="span"
                sx={{ display: 'block', color: 'text.secondary' }}
              >
                {th.users.tooltip(option.name, option.positionName)}
              </Typography>
            </Box>
          </Box>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={error}
          helperText={
            loadError ? (
              <>
                {th.members.pickerLoadError}
                {onRetry ? (
                  <Button size="small" onClick={onRetry} sx={{ ml: 1, py: 0, minWidth: 0 }}>
                    {th.common.retry}
                  </Button>
                ) : null}
              </>
            ) : (
              helperText
            )
          }
        />
      )}
    />
  )
}
