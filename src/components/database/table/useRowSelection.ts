'use client'
// src/components/database/table/useRowSelection.ts — row checkboxes of the table (FR-1424): toggle one, Shift = the
// range from the last toggled row (in the view's order), select all, and pruning when rows disappear.
import { useCallback, useMemo, useRef, useState } from 'react'

export interface RowSelection {
  selected: ReadonlySet<string>
  isSelected: (id: string) => boolean
  /** Toggles `id`; with `range` selects every row between the anchor and `id` (inclusive). */
  toggle: (id: string, range: boolean) => void
  setAll: (on: boolean) => void
  clear: () => void
  allSelected: boolean
  someSelected: boolean
}

export function useRowSelection(order: readonly string[]): RowSelection {
  const [raw, setRaw] = useState<ReadonlySet<string>>(new Set())
  const anchor = useRef<string | null>(null)
  // rows that left the view (deleted, filtered out) are no longer selected
  const selected = useMemo(() => {
    const live = new Set(order)
    const next = new Set([...raw].filter((id) => live.has(id)))
    return next.size === raw.size ? raw : next
  }, [raw, order])

  const toggle = useCallback(
    (id: string, range: boolean) => {
      const a = anchor.current // read now: the updater runs later, after the anchor moved
      setRaw((prev) => {
        const next = new Set(prev)
        if (range && a !== null && a !== id) {
          const i = order.indexOf(a)
          const j = order.indexOf(id)
          if (i >= 0 && j >= 0) {
            const on = !prev.has(id) || prev.has(a)
            for (const x of order.slice(Math.min(i, j), Math.max(i, j) + 1)) {
              if (on) next.add(x)
              else next.delete(x)
            }
            return next
          }
        }
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      anchor.current = id
    },
    [order],
  )
  const setAll = useCallback((on: boolean) => setRaw(on ? new Set(order) : new Set()), [order])
  const clear = useCallback(() => setRaw(new Set()), [])
  return {
    selected,
    isSelected: (id) => selected.has(id),
    toggle,
    setAll,
    clear,
    allSelected: order.length > 0 && selected.size === order.length,
    someSelected: selected.size > 0 && selected.size < order.length,
  }
}
