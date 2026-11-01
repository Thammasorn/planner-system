'use client'
// src/components/layout/HeaderActions.tsx — portals into the PageHeaderBar (FR-1603, M6.1-D19/D26).
import type { JSX, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useHeaderSlots } from './headerSlots'

/** Renders `children` in the right-hand actions area of the mounted header bar (nothing while there is none). */
export function HeaderActions({ children }: { children: ReactNode }): JSX.Element | null {
  const target = useHeaderSlots().actions
  return target ? createPortal(children, target) : null
}

/** Target element of the editor's save-status / lease portals; null without a header bar (inline fallback). */
export function useHeaderSlot(name: 'status' | 'lease'): HTMLElement | null {
  return useHeaderSlots()[name]
}
