'use client'
// src/components/editor/math/EquationPopover.tsx — the popover editor of an equation (FR-1503, M11-D29): monospace
// LaTeX field (≤ 2,000 chars) + live preview (debounced 150 ms) + key hint. Keys match `e.code` (X49): inline
// `Enter` = confirm; block `Cmd/Ctrl+Enter` = confirm and `Enter` = new line in the source; `Esc` = cancel (the
// stored source is unchanged). A click outside confirms (Notion/AFFiNE behaviour; nothing is lost). Rendered in a
// portal, so ProseMirror never sees its keys.
import Box from '@mui/material/Box'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import { type JSX, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import { th } from '@/i18n/th'
import { EQUATION_LATEX_MAX } from '@/lib/schemas/page-content'
import { EquationView } from './EquationView'

/** Live preview delay after typing (FR-1503 "แบบสด" without a KaTeX run per keystroke). */
export const PREVIEW_DEBOUNCE_MS = 150

export interface EquationPopoverProps {
  anchorEl: HTMLElement | null
  /** The stored source when the popover opened. */
  initial: string
  display: boolean
  onConfirm: (latex: string) => void
  onCancel: () => void
}

const E = th.editor.equation

export function EquationPopover(p: EquationPopoverProps): JSX.Element {
  const open = p.anchorEl !== null
  const value = useRef(p.initial) // what the open form holds (a click outside confirms it)
  return (
    <Popover
      open={open}
      anchorEl={p.anchorEl}
      anchorOrigin={{ vertical: 'bottom', horizontal: p.display ? 'center' : 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: p.display ? 'center' : 'left' }}
      slotProps={{ paper: { 'data-testid': 'equation-popover', className: 'app-equation-popover' } as object }}
      onClose={(_e, reason) => {
        if (reason === 'escapeKeyDown') p.onCancel()
        else p.onConfirm(value.current)
      }}
    >
      {open ? <EquationForm {...p} valueRef={value} /> : null}
    </Popover>
  )
}

/** Mounted per opening: the field starts from the stored source every time. */
function EquationForm(p: EquationPopoverProps & { valueRef: RefObject<string> }): JSX.Element {
  const [value, setValue] = useState(p.initial)
  const [preview, setPreview] = useState(p.initial)
  const { valueRef } = p
  useEffect(() => {
    valueRef.current = value
  }, [valueRef, value])
  useEffect(() => {
    const t = setTimeout(() => setPreview(value), PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [value])

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (e.code === 'Escape' || e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      p.onCancel()
      return
    }
    const enter = e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter'
    if (!enter) return
    const mod = e.metaKey || e.ctrlKey
    if (p.display ? mod : !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      p.onConfirm(value)
    }
  }

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, width: 'min(90vw, 480px)' }}>
      <TextField
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={E.placeholder}
        multiline={p.display}
        minRows={p.display ? 2 : undefined}
        size="small"
        fullWidth
        autoFocus
        slotProps={{
          htmlInput: {
            maxLength: EQUATION_LATEX_MAX,
            'aria-label': E.label,
            spellCheck: false,
            className: 'app-equation-popover__input',
          },
        }}
      />
      <Box className="app-equation-popover__preview" aria-live="polite">
        <EquationView latex={preview} display={p.display} testId="equation-preview" />
      </Box>
      <Box component="p" sx={{ m: 0, fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>
        {p.display ? E.confirmHintBlock : E.confirmHintInline}
      </Box>
    </Box>
  )
}
