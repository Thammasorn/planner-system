'use client'
// src/components/editor/blocks/live/island-events.ts — the event rules every non-text island inside the editor shares
// (M10-D8 as revised by the M10 S3.1 spike; reused by the M11 database island, M11-D21, X89).
// Isolation from ProseMirror comes from the block spec (`meta.selectable = false` → the node view's `stopEvent()`
// returns true, so keys, beforeinput, paste, mousedown, drag and drop from inside never reach ProseMirror: Backspace
// in a cell input edits the input, never deletes the block). No native stopPropagation: it would also cut React's
// root listener and kill every handler inside.
// - Mod+Z / Mod+Shift+Z outside a form field inside the island → the app undo stack (`useUndo()`); inside a field →
//   the field's own text undo. Outside the island BlockNote's undo applies (M1's window listener skips `.bn-editor`).
// - Mod+K is untouched (the palette's window listener).
// - A press on the island's own surface keeps the caret out of the page next to it (e2e B7); interactive targets
//   (fields, buttons, links, menus, drag handles) keep their default.
import type { KeyboardEvent, MouseEvent } from 'react'
import { useUndo } from '@/components/undo/useUndo'
import { isRedoKey, isUndoKey } from '@/lib/keys'

const FORM_FIELD = 'input,textarea,select,[contenteditable="true"],[contenteditable=""]'
/** Targets that take focus or act on mousedown themselves (cards, handles, menus, fields, links). */
const INTERACTIVE =
  'a[href],button,input,select,textarea,label,[tabindex],[role="button"],[role="combobox"],[role="checkbox"],[role="switch"]'

export interface IslandEvents {
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
  onMouseDown: (e: MouseEvent<HTMLElement>) => void
}

export function useIslandEvents(): IslandEvents {
  const undo = useUndo()
  return {
    onKeyDown: (e) => {
      if (e.defaultPrevented) return
      // only fields inside the island count: the BlockNote root around it is contenteditable="true" itself
      const field = (e.target as Element).closest(FORM_FIELD)
      if (field !== null && e.currentTarget.contains(field)) return // the field's own text undo
      const redo = isRedoKey(e.nativeEvent)
      if (!redo && !isUndoKey(e.nativeEvent)) return
      e.preventDefault() // listeners after us (palette, M1 undo) skip prevented events
      void (redo ? undo.redo() : undo.undo())
    },
    onMouseDown: (e) => {
      const target = e.target as Element
      if (!e.currentTarget.contains(target)) return // React-bubbled from a portal (popover, menus)
      const hit = target.closest(INTERACTIVE)
      if (hit === null || !e.currentTarget.contains(hit)) e.preventDefault()
    },
  }
}
