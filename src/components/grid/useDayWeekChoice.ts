'use client'
// src/components/grid/useDayWeekChoice.ts — state of the one BR-24 dialog of a grid (M7-D4, M7-D26). `ask(pairs)`
// opens it and resolves with the choice or null (Cancel / Esc); `dropAssignments(ids)` (VERSION_CONFLICT while open)
// removes those pairs and resolves null once nothing is left. While open, the pairs' cells show the typed value as
// pending (`pendingKeys`).
import { useCallback, useMemo, useRef, useState } from 'react'
import type { OnDayWeekConflict } from '@/lib/contracts/grid'
import type { ConflictPair } from '@/lib/grid/br24'

interface Open {
  pairs: ConflictPair[]
  resolve: (choice: OnDayWeekConflict | null) => void
}

export function useDayWeekChoice() {
  const [open, setOpen] = useState<Open | null>(null)
  const queue = useRef<Open[]>([])
  const current = useRef<Open | null>(null)

  const show = useCallback((next: Open | null) => {
    current.current = next
    setOpen(next)
  }, [])

  const ask = useCallback(
    (pairs: readonly ConflictPair[]): Promise<OnDayWeekConflict | null> =>
      new Promise((resolve) => {
        const req: Open = { pairs: [...pairs], resolve }
        if (current.current) queue.current.push(req)
        else show(req)
      }),
    [show],
  )

  const settle = useCallback(
    (choice: OnDayWeekConflict | null) => {
      const cur = current.current
      if (!cur) return
      cur.resolve(choice)
      show(queue.current.shift() ?? null)
    },
    [show],
  )

  const dropAssignments = useCallback(
    (ids: readonly string[]) => {
      const cur = current.current
      if (!cur) return
      const drop = new Set(ids)
      const left = cur.pairs.filter((p) => !drop.has(p.taskAssignmentId))
      if (left.length === cur.pairs.length) return
      // M7-D26: no choice is applied to stale data — the dialog closes; the gesture reverts its pairs
      settle(null)
    },
    [settle],
  )

  const pendingKeys = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of open?.pairs ?? []) m.set(`${p.taskAssignmentId}|${p.week}`, p.toCd)
    return m
  }, [open])

  return {
    ask,
    dropAssignments,
    pairs: open?.pairs ?? EMPTY,
    isOpen: open !== null,
    choose: (c: OnDayWeekConflict) => settle(c),
    cancel: () => settle(null),
    pendingKeys,
  }
}

const EMPTY: ConflictPair[] = []
