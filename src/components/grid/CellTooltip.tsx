'use client'
// src/components/grid/CellTooltip.tsx — the ONE shared tooltip of the grid (r5 M6-30, PLAN §3.9: no MUI Tooltip per
// cell). Delegated pointerover / focusin on [data-tip] elements inside the root; content from a pure builder
// (src/lib/grid/tooltip.ts) through `contentFor`. While shown, the anchor points at it with aria-describedby, so a
// screen reader focusing a cell also hears what only the tooltip holds (exact value, DAY breakdown, leave, holidays).
import Popper from '@mui/material/Popper'
import { useEffect, useId, useState, type RefObject } from 'react'
import styles from './grid.module.css'

export function CellTooltip({
  rootRef,
  contentFor,
}: {
  rootRef: RefObject<HTMLElement | null>
  contentFor: (el: HTMLElement) => string[] | null
}) {
  const [tip, setTip] = useState<{ el: HTMLElement; lines: string[] } | null>(null)
  const id = useId()

  useEffect(() => {
    const el = tip?.el
    if (!el) return
    const previous = el.getAttribute('aria-describedby')
    el.setAttribute('aria-describedby', previous ? `${previous} ${id}` : id)
    return () => {
      if (previous) el.setAttribute('aria-describedby', previous)
      else el.removeAttribute('aria-describedby')
    }
  }, [tip, id])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let current: HTMLElement | null = null
    const show = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null
      if (el === current) return
      current = el
      const lines = el ? contentFor(el) : null
      setTip(el && lines && lines.length > 0 ? { el, lines } : null)
    }
    const hide = () => {
      current = null
      setTip(null)
    }
    const onOver = (e: Event) => show(e.target)
    const onFocus = (e: Event) => show(e.target)
    const onLeave = () => hide()
    const onKey = () => hide()
    root.addEventListener('pointerover', onOver)
    root.addEventListener('focusin', onFocus)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('keydown', onKey)
    root.addEventListener('scroll', onLeave, true)
    return () => {
      root.removeEventListener('pointerover', onOver)
      root.removeEventListener('focusin', onFocus)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('keydown', onKey)
      root.removeEventListener('scroll', onLeave, true)
    }
  }, [rootRef, contentFor])

  if (!tip || !tip.el.isConnected) return null
  return (
    <Popper open anchorEl={tip.el} placement="top" style={{ zIndex: 1500 }} role="tooltip" id={id}>
      <div className={styles.tooltip} data-testid="grid-tooltip">
        {tip.lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </Popper>
  )
}
