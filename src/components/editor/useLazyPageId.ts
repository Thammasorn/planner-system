'use client'
// src/components/editor/useLazyPageId.ts — the page id of a task body that may not have a row yet (FR-681, M6.1-D8).
// `getPageId()` returns the known id, or calls `ensurePageId` ONCE (memoised promise shared by focus, autosave and
// uploads) and remembers the result. A failure toasts once per attempt, clears the memo and leaves the editor
// editable: the next focus / change / upload tries again. Read-only editors never create a row.
import { useCallback, useEffect, useRef, useState } from 'react'
import { th } from '@/i18n/th'

export interface LazyPageId {
  /** The known id (props or ensured), null until the row exists. */
  pageId: string | null
  /** Known id, or the (memoised) ensure call; rejects when it cannot be created (already notified). */
  getPageId: () => Promise<string>
}

export function useLazyPageId(o: {
  pageId: string | null
  ensurePageId?: () => Promise<string>
  canEdit: boolean
  notify: (message: string) => void
}): LazyPageId {
  const [ensured, setEnsured] = useState<string | null>(null)
  const pageId = o.pageId ?? ensured
  const idRef = useRef(pageId)
  const opts = useRef(o)
  const pending = useRef<Promise<string> | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    idRef.current = pageId
    opts.current = o
  })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const getPageId = useCallback((): Promise<string> => {
    if (idRef.current !== null) return Promise.resolve(idRef.current)
    const { ensurePageId, canEdit } = opts.current
    if (!canEdit || !ensurePageId) return Promise.reject(new Error('page id unavailable'))
    pending.current ??= ensurePageId().then(
      (id) => {
        idRef.current = id
        if (alive.current) setEnsured(id)
        return id
      },
      (err: unknown) => {
        pending.current = null
        const message = err instanceof Error && err.message !== '' ? err.message : th.errors.INTERNAL
        opts.current.notify(message)
        throw err instanceof Error ? err : new Error(message)
      },
    )
    return pending.current
  }, [])

  return { pageId, getPageId }
}
