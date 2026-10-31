'use client'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useHotkeys } from '@/hooks/useHotkeys'
import { HOTKEYS } from '@/lib/keys'

export interface PaletteApi {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const noop = () => {}

/** A non-empty text selection inside the BlockNote editor (`.bn-editor`): Cmd+K there is the link shortcut. */
function isEditorTextSelection(e: KeyboardEvent): boolean {
  if (!(e.target instanceof Element) || !e.target.closest('.bn-editor')) return false
  const sel = window.getSelection()
  return sel !== null && !sel.isCollapsed
}

/** Outside a provider (isolated component tests) the palette is closed and the controls do nothing. */
const PaletteContext = createContext<PaletteApi>({ isOpen: false, open: noop, close: noop, toggle: noop })

/**
 * Open state of the command palette (FR-1102, X08) and the global Cmd/Ctrl+K toggle — also while typing (inputs,
 * the editor). `useHotkeys` matches `e.code` first (Thai layout, X49) and skips events someone already handled
 * (`defaultPrevented`). BlockNote's Cmd+K link shortcut wins while text is selected in the editor (r3 G16): its
 * listener exists only once the formatting toolbar has mounted, so a selection inside the editor is skipped here too.
 */
export function PaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const api = useMemo<PaletteApi>(
    () => ({
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen((o) => !o),
    }),
    [isOpen],
  )
  useHotkeys([
    {
      hotkey: HOTKEYS.palette,
      handler: () => setOpen((o) => !o),
      allowInEditable: true,
      skip: isEditorTextSelection,
    },
  ])
  return <PaletteContext value={api}>{children}</PaletteContext>
}

export function usePalette(): PaletteApi {
  return useContext(PaletteContext)
}
