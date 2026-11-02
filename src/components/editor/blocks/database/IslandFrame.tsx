'use client'
// src/components/editor/blocks/database/IslandFrame.tsx — the frame of the database island (FR-1407, M11-D21, X89):
// a `contentEditable={false}` element with the live-block event rules (useIslandEvents: Mod+Z / Mod+Shift+Z outside
// a field inside → the database undo stack via useUndo(); fields keep their native undo; presses on the surface keep
// the caret out of the page). ProseMirror isolation comes from the spec's `meta.selectable = false`. Full content
// width; whatever is wider (table columns, kanban groups) scrolls inside the database view, never the page.
import type { JSX, ReactNode } from 'react'
import { useIslandEvents } from '../live/island-events'

export function IslandFrame({ children }: { children: ReactNode }): JSX.Element {
  const { onKeyDown, onMouseDown } = useIslandEvents()
  return (
    <div
      className="app-db-island"
      data-db-island=""
      contentEditable={false}
      suppressContentEditableWarning
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  )
}
