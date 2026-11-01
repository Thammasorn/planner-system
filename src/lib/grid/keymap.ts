// src/lib/grid/keymap.ts — grid keyboard map (SPEC §4.8, §8.6, X49, M6-D27/D32). Matched on e.code first so the
// Thai Kedmanee layout works (digits type ๅ/ภ/ถ…, f/h type ด/้). Pure.
import { isRedoKey, isUndoKey } from '@/lib/keys'

export type GridKeyAction =
  | { kind: 'move'; dr: number; dc: number; extend: boolean }
  /** char '' = edit the current value (F2) */
  | { kind: 'startEdit'; char: string }
  | { kind: 'commit'; dir: 'down' | 'right' | 'left' }
  | { kind: 'cancel' }
  | { kind: 'full' }
  | { kind: 'half' }
  | { kind: 'clear' }
  | { kind: 'shift'; dir: -1 | 1 }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'flush' }
  | { kind: 'newTask' }
  | { kind: 'deleteRow' }
  /** Shift+Space: select the focused row (keyboard path to deleteRow, M6-D19) */
  | { kind: 'selectRow' }
  /** M7 (KEY-07, M7-D11): Mod+↓ on a week cell expands that week (view only) */
  | { kind: 'expandWeek' }
  /** M7: Mod+↑ on a day / รวม cell collapses the view (never data) */
  | { kind: 'collapseWeek' }
  /** M7: Shift+F10 / ContextMenu key → the cell menu (↕ รวมเป็นรายสัปดาห์; M8 adds items) */
  | { kind: 'cellMenu' }

type KeyEv = Pick<
  KeyboardEvent,
  'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'isComposing'
>

/** Digit0–9/Numpad0–9 → '0'–'9', Period/NumpadDecimal → '.', Comma → ',', Minus → '-'. */
export function asciiForCode(code: string): string | null {
  const d = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  if (d) return d[1]!
  switch (code) {
    case 'Period':
    case 'NumpadDecimal':
      return '.'
    case 'Comma':
      return ','
    case 'Minus':
    case 'NumpadSubtract':
      return '-'
    default:
      return null
  }
}

const ARROWS: Readonly<Record<string, [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

/**
 * Maps a keydown to a grid action, or null to leave the event alone (the cell editor and the DOM copy/paste events
 * handle everything else). `sel.hasSelection === false` (after a second Esc) lets Tab leave the grid (no trap).
 */
export function gridKeyAction(
  e: KeyEv,
  mode: 'nav' | 'edit',
  sel: { rowSelected: boolean; hasSelection?: boolean },
): GridKeyAction | null {
  if (e.isComposing) return null
  const mod = e.metaKey || e.ctrlKey
  if (mod && !e.altKey && !e.shiftKey && (e.code === 'KeyS' || e.key === 's')) return { kind: 'flush' }

  if (mode === 'edit') {
    if (mod || e.altKey) return null
    if (e.code === 'Enter' || e.code === 'NumpadEnter') return { kind: 'commit', dir: 'down' }
    if (e.code === 'Tab') return { kind: 'commit', dir: e.shiftKey ? 'left' : 'right' }
    if (e.code === 'Escape') return { kind: 'cancel' }
    return null
  }

  if (isUndoKey(e)) return { kind: 'undo' }
  if (isRedoKey(e)) return { kind: 'redo' }
  if (e.altKey) return null
  if (mod) {
    if (e.shiftKey) return null
    if (e.code === 'ArrowLeft') return { kind: 'shift', dir: -1 }
    if (e.code === 'ArrowRight') return { kind: 'shift', dir: 1 }
    if (e.code === 'ArrowDown') return { kind: 'expandWeek' }
    if (e.code === 'ArrowUp') return { kind: 'collapseWeek' }
    return null // Mod+C/V → DOM copy/paste events
  }
  if ((e.code === 'F10' && e.shiftKey) || e.code === 'ContextMenu') return { kind: 'cellMenu' }

  const arrow = ARROWS[e.code]
  if (arrow) return { kind: 'move', dr: arrow[0], dc: arrow[1], extend: e.shiftKey }
  switch (e.code) {
    case 'Enter':
    case 'NumpadEnter':
      return { kind: 'move', dr: e.shiftKey ? -1 : 1, dc: 0, extend: false }
    case 'Tab':
      if (sel.hasSelection === false) return null
      return { kind: 'move', dr: 0, dc: e.shiftKey ? -1 : 1, extend: false }
    case 'Escape':
      return { kind: 'cancel' }
    case 'F2':
      return { kind: 'startEdit', char: '' }
    case 'Delete':
    case 'Backspace':
      return sel.rowSelected ? { kind: 'deleteRow' } : { kind: 'clear' }
    case 'Space':
      return e.shiftKey ? { kind: 'selectRow' } : null
  }
  if (e.shiftKey) return null
  if (e.code === 'KeyF') return { kind: 'full' }
  if (e.code === 'KeyH') return { kind: 'half' }
  if (e.code === 'KeyN') return { kind: 'newTask' }
  const ch = asciiForCode(e.code)
  return ch === null ? null : { kind: 'startEdit', char: ch }
}
