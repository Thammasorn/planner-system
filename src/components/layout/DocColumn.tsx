'use client'
// src/components/layout/DocColumn.tsx — the document reading column (FR-1602, SPEC §8.12, M6.1-D20): max
// `--doc-column` (760 px, editor gutter included) centred. Full width → no max-width; the content stays `--space-12`
// from both edges through the shared gutter (`--page-gutter`), which the editor (editor-theme.css) and `DocInset`
// read, so the title, the properties and the body text line up at every width. Phones use a narrow gutter.
import type { JSX, ReactNode } from 'react'
import styles from './DocColumn.module.css'

export function DocColumn(p: { fullWidth: boolean; children: ReactNode }): JSX.Element {
  return (
    <div data-testid="page-column" data-full-width={String(p.fullWidth)} className={styles.column}>
      {p.children}
    </div>
  )
}

/** Non-editor content of the column (cover row, title, properties, banners) inset by the editor's gutter. */
export function DocInset({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.inset}>{children}</div>
}
