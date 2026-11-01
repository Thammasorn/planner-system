'use client'
// src/components/layout/InAppHistory.tsx — "back where I was" for the task page (FR-686, M6.1-D18). The provider
// (mounted once in AppShell) keeps how deep the user is in this tab's in-app history: a client navigation (push)
// goes one deeper, a browser Back / Forward (popstate) moves one back (never below 0). `useInAppBack(fallback)` goes
// back in the app when there is somewhere to go, else to `fallback` (direct entry → the project's task tab).
import { usePathname, useRouter } from 'next/navigation'
import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'

interface InAppHistory {
  /** In-app entries behind the current one (0 = this is where the tab entered the app). */
  depth(): number
}

const Ctx = createContext<InAppHistory | null>(null)

export function InAppHistoryProvider({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname()
  const first = useRef<string | null>(null)
  const depth = useRef(0)
  const popped = useRef(false)

  useEffect(() => {
    const onPop = () => {
      popped.current = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (first.current === null) {
      first.current = pathname
      return
    }
    if (popped.current) depth.current = Math.max(0, depth.current - 1)
    else depth.current += 1
    popped.current = false
  }, [pathname])

  const value = useMemo<InAppHistory>(() => ({ depth: () => depth.current }), [])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** `router.back()` after an in-app navigation, else `router.push(fallbackHref)`. Works without the provider (push). */
export function useInAppBack(fallbackHref: string): () => void {
  const router = useRouter()
  const h = useContext(Ctx)
  return useCallback(() => {
    if (h && h.depth() > 0) router.back()
    else router.push(fallbackHref)
  }, [h, router, fallbackHref])
}
