'use client'
// src/lib/nav/useScrollRestore.ts — list views restore their scroll position after a history return (FR-686,
// M6.1-D18). Call with `ready` = the view's data has rendered; runs once per mount.
import { useEffect, useRef } from 'react'
import { consumePopNavigation, currentScrollKey, installPopListener, takeScroll } from './scroll-memory'

export function useScrollRestore(ready: boolean): void {
  const done = useRef(false)
  useEffect(() => {
    installPopListener()
  }, [])
  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    const y = takeScroll(currentScrollKey())
    const popped = consumePopNavigation()
    if (y === null || !popped) return
    // after the rows are laid out (this effect runs right after the commit that rendered them)
    const raf = window.requestAnimationFrame(() => window.scrollTo({ top: y }))
    return () => window.cancelAnimationFrame(raf)
  }, [ready])
}
