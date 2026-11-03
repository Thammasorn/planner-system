'use client'
// src/components/editor/side-menu.tsx — BlockNote's side menu (+ / ⠿) with the app's vertical placement: centred on
// the block's measured first line (src/lib/editor/side-menu-offset.ts) instead of core's per-type constants, so it
// lines up with token-sized headings and with the title of database / equation / live blocks (owner bug 2026-11-03).
// Only `middleware` is overridden; placement, open state and the scroll-hide behaviour stay core's. `overlap` (compact
// panel body, no start gutter) positions it `fixed` so it overlaps the panel's padding instead of being clipped by it.
import { type FloatingUIOptions, SideMenuController, useBlockNoteEditor } from '@blocknote/react'
import { type JSX, useMemo } from 'react'
import { coreBlockOffset, sideMenuOffsetMiddleware } from '@/lib/editor/side-menu-offset'

export function AppSideMenuController({ overlap = false }: { overlap?: boolean }): JSX.Element {
  const editor = useBlockNoteEditor()
  const options = useMemo<Partial<FloatingUIOptions>>(() => {
    /** Core's constant for a block without a measurable first line (table, image, file, audio). */
    const fallback = (reference: Element): number => {
      const id = reference.closest('[data-id]')?.getAttribute('data-id')
      const block = id ? editor.getBlock(id) : undefined
      if (!block) return 0
      const accept = editor.schema.blockSpecs[block.type]?.implementation.meta?.fileBlockAccept
      const props: Record<string, unknown> = block.props
      return coreBlockOffset(block.type, Boolean(accept) && !props.url)
    }
    return {
      useFloatingOptions: {
        middleware: [sideMenuOffsetMiddleware(fallback)],
        ...(overlap ? { strategy: 'fixed' as const } : {}),
      },
    }
  }, [editor, overlap])
  return <SideMenuController floatingUIOptions={options} />
}
