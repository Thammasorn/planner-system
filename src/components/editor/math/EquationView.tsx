'use client'
// src/components/editor/math/EquationView.tsx — how an equation (block or inline) looks (FR-1501…1506, M11-D29/D30):
// empty → the placeholder "พิมพ์สมการ (LaTeX)"; loading KaTeX → a sized skeleton; valid → KaTeX HTML + MathML (screen
// readers read the MathML); invalid → ⚠ + "สมการไม่ถูกต้อง" + the source (monospace) with a `--load-over-fg` border —
// never colour alone (FR-1504), in edit and read modes. Editable views are buttons that open the popover editor.
// KaTeX output is safe to inject: `trust: false` (no \href, \url, \includegraphics), MathML annotations escaped.
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import type { JSX, KeyboardEvent, MouseEvent } from 'react'
import { th } from '@/i18n/th'
import { useLatex } from '@/lib/math/useLatex'

export interface EquationViewProps {
  latex: string
  /** true = block (centred display math); false = inline. */
  display: boolean
  /** `equation` / `inline-equation` (M11-D2 stable ids); the popover preview uses `equation-preview`. */
  testId: string
  /** Opens the popover editor (edit mode only); undefined = read-only. */
  onOpen?: ((anchor: HTMLElement) => void) | undefined
}

const E = th.editor.equation

export function EquationView({ latex, display, testId, onOpen }: EquationViewProps): JSX.Element {
  const state = useLatex(latex, display)
  const Tag = display ? 'div' : 'span'
  const interactive = onOpen !== undefined
  const open = (el: HTMLElement): void => onOpen?.(el)

  let body: JSX.Element
  switch (state.status) {
    case 'empty':
      body = <span className="app-equation__placeholder">{E.placeholder}</span>
      break
    case 'loading':
      body = (
        <span className="app-equation__skeleton" role="status" aria-label={E.loading}>
          {latex}
        </span>
      )
      break
    case 'ok':
      body = <Tag className="app-equation__math" dangerouslySetInnerHTML={{ __html: state.html }} />
      break
    case 'error':
    case 'failed':
      body = (
        <>
          <WarningAmberRounded className="app-equation__icon" fontSize="inherit" aria-hidden />
          <span className="app-equation__error">{E.invalid}</span>
          <code className="app-equation__source">{latex}</code>
        </>
      )
      break
  }

  return (
    <Tag
      className={`app-equation app-equation--${display ? 'block' : 'inline'}`}
      data-testid={testId}
      data-state={state.status === 'failed' ? 'error' : state.status}
      data-latex={latex}
      contentEditable={false}
      suppressContentEditableWarning
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': latex === '' ? E.label : `${E.label}: ${latex}`,
            onClick: (e: MouseEvent<HTMLElement>) => {
              e.preventDefault()
              open(e.currentTarget)
            },
            onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
              if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Space') return
              e.preventDefault()
              open(e.currentTarget)
            },
          }
        : { 'aria-label': latex === '' ? E.label : undefined })}
    >
      {body}
    </Tag>
  )
}
