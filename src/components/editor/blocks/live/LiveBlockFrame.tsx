'use client'
// src/components/editor/blocks/live/LiveBlockFrame.tsx — the shared frame of the M10 live blocks (FR-1301/1303,
// M10-D8 as revised by the S3.1 spike). The frame is a `contentEditable={false}` region with a header and a body.
// Event isolation: the block specs set `meta.selectable = false`, so BlockNote gives their node view
// `stopEvent() → true` and ProseMirror ignores every event from inside (keys, beforeinput, paste, mousedown, drag,
// drop). The frame therefore attaches NO native stopPropagation listener — that would also cut React's root listener
// and kill every onClick/onKeyDown inside (spike). Mod+K is untouched (the palette's window listener sees it);
// Mod+Z / Mod+Shift+Z outside form fields run the app undo stack (M1's window listener skips `.bn-editor` targets).
import Box from '@mui/material/Box'
import type { JSX, ReactNode } from 'react'
import { th } from '@/i18n/th'
import { useIslandEvents } from './island-events'

export interface LiveBlockFrameProps {
  title: string
  /** For the region's accessible name, once the embed answer is known. */
  projectName?: string | undefined
  /** Right side of the header (view toggle, links). */
  actions?: ReactNode
  children: ReactNode
}

export function LiveBlockFrame({ title, projectName, actions, children }: LiveBlockFrameProps): JSX.Element {
  const { onKeyDown, onMouseDown } = useIslandEvents()
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
