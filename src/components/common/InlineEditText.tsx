'use client'
import { useEffect, useRef, useState, type ElementType, type KeyboardEvent } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { TypographyVariant } from '@mui/material/styles'

export interface InlineEditTextProps {
  value: string
  /** Receives the trimmed, changed, non-empty value. Reject to revert. */
  onCommit: (next: string) => Promise<void>
  /** Accessible name of the text field. */
  label: string
  disabled?: boolean
  maxLength?: number
  variant?: TypographyVariant
  /** Element of the display text (e.g. 'h1' for a page title). */
  component?: ElementType
  /** Tab order of the display text; -1 inside a roving-focus container (treegrid rows, M3-D22). */
  tabIndex?: number
  /**
   * Called instead of focusing the display text when editing ends with Enter / Esc / a failed save — lets a
   * roving-focus container take focus back (the display text is then not a tab stop).
   */
  onRefocus?: () => void
}

/**
 * Click / Enter / F2 to edit in place (SPEC §1.3 P1 "ทุก field แก้ inline"); Enter or blur saves the trimmed value,
 * Esc cancels, an empty value reverts without saving. While saving the field is disabled; a rejected save reverts
 * to the original text and returns focus to it. Shared from M2 on (PLAN §3.9).
 */
export function InlineEditText({
  value,
  onCommit,
  label,
  disabled,
  maxLength,
  variant = 'body1',
  component,
  tabIndex = 0,
  onRefocus,
}: InlineEditTextProps) {
  // `shown` follows the prop, and holds a successful commit until the server's refresh() delivers it.
  const [prevValue, setPrevValue] = useState(value)
  const [shown, setShown] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setShown(value)
  }
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [committing, setCommitting] = useState(false)
  const displayRef = useRef<HTMLElement>(null)
  const settled = useRef(false) // Enter, then the blur caused by disabling/unmounting, must commit once
  const refocus = useRef(false)

  useEffect(() => {
    if (editing || !refocus.current) return
    refocus.current = false
    if (onRefocus) onRefocus()
    else displayRef.current?.focus()
  }, [editing, onRefocus])

  const start = () => {
    if (disabled) return
    settled.current = false
    setDraft(shown)
    setEditing(true)
  }

  const close = (focusDisplay: boolean) => {
    refocus.current = focusDisplay
    setEditing(false)
  }

  const commit = async (focusDisplay: boolean) => {
    if (settled.current) return
    settled.current = true
    const next = draft.trim()
    if (next === '' || next === shown) {
      close(focusDisplay)
      return
    }
    setCommitting(true)
    try {
      await onCommit(next)
      setShown(next)
      close(focusDisplay)
    } catch {
      setShown(value)
      close(true)
    } finally {
      setCommitting(false)
    }
  }

  const onFieldKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commit(true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      settled.current = true
      close(true)
    }
  }

  const onDisplayKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === 'F2' || e.key === ' ') {
      e.preventDefault()
      start()
    }
  }

  if (editing) {
    return (
      <TextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onFieldKeyDown}
        onBlur={() => void commit(false)}
        disabled={committing}
        autoFocus
        fullWidth
        size="small"
        slotProps={{
          htmlInput: { maxLength, 'aria-label': label },
          input: { sx: { typography: variant } },
        }}
      />
    )
  }

  if (disabled) {
    return (
      <Typography variant={variant} {...(component ? { component } : {})}>
        {shown}
      </Typography>
    )
  }

  return (
    <Typography variant={variant} {...(component ? { component } : {})}>
      <Box
        component="span"
        ref={displayRef}
        role="button"
        tabIndex={tabIndex}
        onClick={start}
        onKeyDown={onDisplayKeyDown}
        data-inline-edit=""
        sx={{
          borderRadius: 1,
          px: 0.5,
          mx: -0.5,
          cursor: 'text',
          '&:hover': { bgcolor: 'action.hover' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        {shown}
      </Box>
    </Typography>
  )
}
