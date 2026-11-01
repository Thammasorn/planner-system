'use client'
// src/components/grid/useExpansion.ts — in-memory expansion state of one grid (FR-802/803, M7-D10/D11, X53): reset when
// the grid context changes; the zoom is persisted by the caller in the `grid.zoom` preference. View only.
import { useCallback, useState } from 'react'
import type { ISODate } from '@/domain/types'
import type { GridZoom } from '@/lib/contracts/grid'
import { collapseWeek, expandWeek, toggleWeek, type ExpansionState } from '@/lib/grid/expansion'
import type { GridCtx } from '@/lib/query-keys'

export function useExpansion(ctx: GridCtx, initialZoom: GridZoom) {
  const [s, setS] = useState<{ id: string; state: ExpansionState }>(() => ({
    id: ctx.id,
    state: { zoom: initialZoom, expanded: new Set() },
  }))
  // reset on a context change (render-time adjustment, no effect)
  let state = s.state
  if (s.id !== ctx.id) {
    state = { zoom: initialZoom, expanded: new Set() }
    setS({ id: ctx.id, state })
  }
  const update = useCallback(
    (f: (x: ExpansionState) => ExpansionState) => setS((prev) => ({ ...prev, state: f(prev.state) })),
    [],
  )
  const toggle = useCallback((w: ISODate) => update((x) => toggleWeek(x, w)), [update])
  const expand = useCallback((w: ISODate) => update((x) => expandWeek(x, w)), [update])
  const collapse = useCallback((w: ISODate) => update((x) => collapseWeek(x, w)), [update])
  const setZoom = useCallback((zoom: GridZoom) => update((x) => (x.zoom === zoom ? x : { ...x, zoom })), [update])
  return { state, toggle, expand, collapse, setZoom }
}
