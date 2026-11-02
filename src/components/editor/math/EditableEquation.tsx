'use client'
// src/components/editor/math/EditableEquation.tsx — an equation with its popover editor (FR-1503, M11-D29): the view
// is a button in edit mode (no popover in read mode); confirm writes the source only when it changed (one undo
// step), cancel keeps it; afterwards the caret goes back to the editor.
import { type JSX, useLayoutEffect, useRef, useState } from 'react'
import { EquationPopover } from './EquationPopover'
import { EquationView } from './EquationView'

export interface EditableEquationProps {
  latex: string
  display: boolean
  testId: string
  editable: boolean
  onChange: (latex: string) => void
  /** Called once on mount: true = open the popover now (the slash item just inserted this equation). */
  takeAutoOpen?: () => boolean
  /** After the popover closes (focus the editor). */
  onClosed?: () => void
}

export function EditableEquation(p: EditableEquationProps): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const host = useRef<HTMLSpanElement>(null)
  const takeAutoOpen = useRef(p.takeAutoOpen)
  const editable = useRef(p.editable)
  useLayoutEffect(() => {
    const el = host.current?.firstElementChild
    // effect, not render: a request is consumed by the equation that actually mounted
    if (editable.current && takeAutoOpen.current?.() === true && el instanceof HTMLElement) setAnchor(el)
  }, [])

  const close = (): void => {
    setAnchor(null)
    p.onClosed?.()
  }
  return (
    <span ref={host} className="app-equation-host" data-display={p.display ? 'block' : 'inline'}>
      <EquationView
        latex={p.latex}
        display={p.display}
        testId={p.testId}
        onOpen={p.editable ? setAnchor : undefined}
      />
      {p.editable ? (
        <EquationPopover
          anchorEl={anchor}
          initial={p.latex}
          display={p.display}
          onCancel={close}
          onConfirm={(latex) => {
            if (latex !== p.latex) p.onChange(latex)
            close()
          }}
        />
      ) : null}
    </span>
  )
}
