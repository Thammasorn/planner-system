/** Keyboard shortcut matching (SPEC §8.6, X49, M0-D12). Isomorphic; used by `useHotkeys`. */

export interface Hotkey {
  /** KeyboardEvent.code — physical key, layout-independent (Thai layout safe). */
  code: string
  /** KeyboardEvent.key fallback for layouts that move the key. */
  key?: string
  /** Cmd or Ctrl (either, every platform — M0-D12). */
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export type HotkeyEvent = Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

export function matchesHotkey(e: HotkeyEvent, hk: Hotkey): boolean {
  const mod = e.metaKey || e.ctrlKey
  if (mod !== Boolean(hk.mod) || e.shiftKey !== Boolean(hk.shift) || e.altKey !== Boolean(hk.alt))
    return false
  return e.code === hk.code || (hk.key !== undefined && e.key === hk.key)
}

const EDITABLE =
  'input,textarea,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],.bn-editor'

/** Inputs, textareas, selects, contenteditable and the BlockNote editor (M4) are editable targets. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false
  return target.closest(EDITABLE) !== null
}

/** App-wide shortcut registry; M3's `?` help dialog reads it (X07). */
export const HOTKEYS = {
  toggleSidebar: { code: 'Backslash', key: '\\', mod: true },
  /** Cmd/Ctrl+K command palette (X08, X49); listeners skip events BlockNote already handled (defaultPrevented). */
  palette: { code: 'KeyK', key: 'k', mod: true },
  /** M6.1 (FR-685, X49): Shift+Space on a focused task row opens the task page /t/<id>. */
  openPage: { code: 'Space', key: ' ', shift: true },
} as const satisfies Record<string, Hotkey>

type ModKeyEvent = Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

function isModZ(e: ModKeyEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && (e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z')
}

/** Cmd/Ctrl+Z without Shift/Alt (SPEC §8.6). Matched by `code` first so the Thai layout ('ผ') works (X49). */
export function isUndoKey(e: ModKeyEvent): boolean {
  return isModZ(e) && !e.shiftKey
}

/** Cmd/Ctrl+Shift+Z (SPEC §8.6). */
export function isRedoKey(e: ModKeyEvent): boolean {
  return isModZ(e) && e.shiftKey
}
