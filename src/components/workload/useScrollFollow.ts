'use client'
// src/components/workload/useScrollFollow.ts — keeps the load chart's horizontal scroller in lockstep with the
// workload table's (M11.2-D3), both ways, the same contract VirtualGrid gives the plan chart (ChartLayout.follow,
// M7.1-D30): `lead` is the table scroller's ref callback, `follow` the chart scroller's (AlignedScroller).
import { useCallback, useRef } from 'react'

/** Puts every follower on the leader's scrollLeft. */
function align(leader: HTMLElement | null, followers: ReadonlySet<HTMLElement>): void {
  if (!leader) return
  for (const f of followers)
    if (Math.abs(f.scrollLeft - leader.scrollLeft) >= 1) f.scrollLeft = leader.scrollLeft
}

export function useScrollFollow(): {
  lead: (el: HTMLElement | null) => (() => void) | undefined
  follow: (el: HTMLElement | null) => (() => void) | undefined
  /** puts every follower back on the table's scrollLeft (after the chart's content width changed) */
  sync: () => void
} {
  const leader = useRef<HTMLElement | null>(null)
  const followers = useRef(new Set<HTMLElement>())

  const lead = useCallback((el: HTMLElement | null) => {
    if (!el) return undefined
    leader.current = el
    const sync = () => align(el, followers.current)
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    return () => {
      el.removeEventListener('scroll', sync)
      if (leader.current === el) leader.current = null
    }
  }, [])

  const follow = useCallback((f: HTMLElement | null) => {
    if (!f) return undefined
    followers.current.add(f)
    if (leader.current) f.scrollLeft = leader.current.scrollLeft
    const back = () => {
      const g = leader.current
      if (g && Math.abs(g.scrollLeft - f.scrollLeft) >= 1) g.scrollLeft = f.scrollLeft
    }
    f.addEventListener('scroll', back, { passive: true })
    return () => {
      f.removeEventListener('scroll', back)
      followers.current.delete(f)
    }
  }, [])

  const sync = useCallback(() => align(leader.current, followers.current), [])

  return { lead, follow, sync }
}
