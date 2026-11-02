'use client'
// src/components/grid/SumModeHint.tsx — the hint at a summed read-only cell (SPEC FR-817, AC-810, BR-101, M7.1-D6).
// Typing / paste / fill / f / h / Delete on a summed cell of a parent or of ≥ 2 people changes nothing (never
// distributed, D23) and anchors this non-modal hint at the cell: th.grid.sumMode.readOnlyHint(n) + [แสดงผู้รับผิดชอบ],
// which turns the assignee column on and focuses the task's first assignee row (PlanGrid). Announced politely; closes
// on a click elsewhere, Esc or the button. Keyboard (P1, §8.9): focus stays on the cell (the hint is non-modal), and
// Alt+Enter runs the button while the hint is open (aria-keyshortcuts + the key shown on the button).
import Button from '@mui/material/Button'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import { useEffect, type JSX } from 'react'
import { th } from '@/i18n/th'
import { matchesHotkey, type Hotkey } from '@/lib/keys'
import styles from './grid.module.css'

export interface SumModeHintProps {
  /** the summed cell (null = closed) */
  anchorEl: Element | null
  /** assignees of the task (0 for a parent → the generic text) */
  people: number
  onShowAssignees: () => void
  onClose: () => void
}

/** Alt+Enter = [แสดงผู้รับผิดชอบ] while the hint is open (matched by code: Thai layout safe, X49). */
export const SHOW_ASSIGNEES_KEYS: readonly Hotkey[] = [
  { code: 'Enter', alt: true },
  { code: 'NumpadEnter', alt: true },
]

export function SumModeHint(p: SumModeHintProps): JSX.Element {
  const open = p.anchorEl !== null
  const { onClose, onShowAssignees } = p
  useEffect(() => {
    if (!open) return
    // capture: before the grid's own Enter (edit) handling on the focused cell
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (SHOW_ASSIGNEES_KEYS.some((k) => matchesHotkey(e, k))) {
        e.preventDefault()
        e.stopPropagation()
        onShowAssignees()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose, onShowAssignees])
  return (
    <Popper open={open} anchorEl={p.anchorEl} placement="bottom-start" className={styles.hintPopper}>
      <ClickAwayListener onClickAway={onClose} mouseEvent="onPointerDown">
        <Paper className={styles.sumHint} role="status" aria-live="polite" data-testid="sum-mode-hint">
          <span>{th.grid.sumMode.readOnlyHint(p.people)}</span>
          <Button
            size="small"
            variant="outlined"
            className={styles.toolbarToggle}
            onClick={onShowAssignees}
            aria-keyshortcuts="Alt+Enter"
          >
            {th.grid.sumMode.showAssignees}
            <kbd className={styles.hintKey} aria-hidden="true">
              {th.grid.sumMode.showAssigneesKey}
            </kbd>
          </Button>
        </Paper>
      </ClickAwayListener>
    </Popper>
  )
}
