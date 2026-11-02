'use client'
// src/lib/math/useLatex.ts — renders LaTeX with the lazily loaded KaTeX runtime (FR-1504/1505, M11-D29/D30).
// An empty source never loads KaTeX (the placeholder needs no math), so a page without equations — or with only
// empty ones — never requests the chunk. Until the chunk arrives the state is 'loading' (the view shows a sized
// skeleton); afterwards rendering is synchronous. A chunk that fails to load reads as 'failed' (retried on the next
// mount: loadKatex forgets a failed import).
import { useEffect, useMemo, useState } from 'react'
import { type KatexRuntime, loadedKatex, loadKatex } from './load-katex'

export type LatexState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'ok'; html: string }
  | { status: 'error'; message: string }
  | { status: 'failed' }

export function useLatex(src: string, displayMode: boolean): LatexState {
  const empty = src.trim() === ''
  const [rt, setRt] = useState<KatexRuntime | null>(loadedKatex)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (empty || rt !== null) return
    let alive = true
    loadKatex().then(
      (r) => {
        if (alive) setRt(r)
      },
      () => {
        if (alive) setFailed(true)
      },
    )
    return () => {
      alive = false
    }
  }, [empty, rt])

  return useMemo<LatexState>(() => {
    if (empty) return { status: 'empty' }
    if (rt === null) return failed ? { status: 'failed' } : { status: 'loading' }
    const r = rt.renderLatex(src, displayMode)
    return r.ok ? { status: 'ok', html: r.html } : { status: 'error', message: r.message }
  }, [empty, rt, failed, src, displayMode])
}
