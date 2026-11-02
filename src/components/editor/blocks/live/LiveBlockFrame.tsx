'use client'
// src/components/editor/blocks/live/LiveBlockFrame.tsx — the shared frame of the M10 live blocks (FR-1301/1303,
// M10-D8 as revised by the S3.1 spike). The frame is a `contentEditable={false}` region with a header and a body.
// Event isolation: the block specs set `meta.selectable = false`, so BlockNote gives their node view
// `stopEvent() → true` and ProseMirror ignores every event from inside (keys, beforeinput, paste, mousedown, drag,
// drop). The frame therefore attaches NO native stopPropagation listener — that would also cut React's root listener
// and kill every onClick/onKeyDown inside (spike). Mod+K is untouched (the palette's window listener sees it);
// Mod+Z / Mod+Shift+Z outside form fields run the app undo stack (M1's window listener skips `.bn-editor` targets).
import Box from '@mui/material/Box'
import type { JSX, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { isRedoKey, isUndoKey } from '@/lib/keys'

const FORM_FIELD = 'input,textarea,select,[contenteditable="true"],[contenteditable=""]'
/** Targets that take focus or act on mousedown themselves (cards, handles, menus, fields, links). */
const INTERACTIVE =
  'a[href],button,input,select,textarea,label,[tabindex],[role="button"],[role="combobox"],[role="checkbox"],[role="switch"]'

export interface LiveBlockFrameProps {
  title: string
  /** For the region's accessible name, once the embed answer is known. */
  projectName?: string | undefined
  /** Right side of the header (view toggle, links). */
  actions?: ReactNode
  children: ReactNode
}

export function LiveBlockFrame({ title, projectName, actions, children }: LiveBlockFrameProps): JSX.Element {
  const undo = useUndo()
  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.defaultPrevented) return
    // only fields inside the frame count: the BlockNote root around it is contenteditable="true" itself
    const field = (e.target as Element).closest(FORM_FIELD)
    if (field !== null && e.currentTarget.contains(field)) return // the field's own text undo
    const redo = isRedoKey(e.nativeEvent)
    if (!redo && !isUndoKey(e.nativeEvent)) return
    e.preventDefault()
    void (redo ? undo.redo() : undo.undo())
  }
  // A press on the frame's own surface (text, padding, an empty column) would let the browser put the caret into the
  // editable page next to the block — BlockNote only blurs the editor 10 ms later — so typing right after it edits the
  // page. Keep the default (focus, menus, drag) only for interactive targets inside the frame (M10-D8, e2e B7).
  const onMouseDown = (e: MouseEvent<HTMLElement>): void => {
    const target = e.target as Element
    if (!e.currentTarget.contains(target)) return // React-bubbled from a portal (filter popover, menus)
    const hit = target.closest(INTERACTIVE)
    if (hit === null || !e.currentTarget.contains(hit)) e.preventDefault()
  }
  return (
    <Box
      component="section"
      contentEditable={false}
      suppressContentEditableWarning
      data-live-block=""
      aria-label={projectName ? th.editor.liveBlocks.regionLabel(title, projectName) : title}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      sx={{
        width: '100%',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        userSelect: 'text',
        cursor: 'auto',
      }}
    >
      <Box
        component="header"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minHeight: 32 }}
      >
        <Box sx={{ fontSize: 'var(--font-md)', fontWeight: 600, flex: 1 }}>{title}</Box>
        {actions}
      </Box>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  )
}
