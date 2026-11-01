'use client'
import { useState, type KeyboardEvent, type Ref } from 'react'
import TextField from '@mui/material/TextField'
import { th } from '@/i18n/th'
import { TREE_INDENT } from '@/components/tree/SortableTree'

export interface QuickAddProps {
  depth: number
  disabled: boolean
  inputRef: Ref<HTMLInputElement>
  onCreate: (name: string) => void
  onEscape: () => void
  /** Accessible name (default th.tasks.quickAdd.label; board columns pass their own). */
  label?: string | undefined
  autoFocus?: boolean | undefined
  onBlur?: (() => void) | undefined
  /** Left inset before the depth indent (list rows: handle + toggle + checkbox = 56 px). */
  inset?: number | undefined
}

/**
 * "+ เพิ่มงาน…" (FR-602, AC-601, M3-D15): Enter creates a task with the trimmed name and keeps the cursor for the
 * next one; an empty name is a no-op (no request); Escape hands focus back to the list. Only the name is asked.
 */
export function QuickAdd({
  depth,
  disabled,
  inputRef,
  onCreate,
  onEscape,
  label,
  autoFocus,
  onBlur,
  inset = 56,
}: QuickAddProps) {
  const [name, setName] = useState('')
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = name.trim()
      if (trimmed === '') return
      onCreate(trimmed)
      setName('')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setName('')
      onEscape()
    }
  }
  return (
    <TextField
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      inputRef={inputRef}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={th.tasks.quickAdd.placeholder}
      variant="standard"
      fullWidth
      size="small"
      data-testid="task-quick-add"
      sx={{ pl: `${depth * TREE_INDENT + inset}px`, py: 0.5, fontSize: 'var(--font-md)' }} // token-scale-ok: tree-row indent (layout constant)
      slotProps={{
        htmlInput: { 'aria-label': label ?? th.tasks.quickAdd.label, maxLength: 500, autoComplete: 'off' },
        input: { disableUnderline: true },
      }}
    />
  )
}
