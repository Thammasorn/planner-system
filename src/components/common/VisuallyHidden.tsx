import type { ReactNode } from 'react'

/** Clip pattern: present for screen readers, invisible on screen (SPEC §8.9 — state never by colour alone). */
const HIDDEN = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
} as const

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span style={HIDDEN}>{children}</span>
}
