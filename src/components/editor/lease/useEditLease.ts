'use client'
// src/components/editor/lease/useEditLease.ts — one-editor-at-a-time lease (FR-540…542, X63, M4-D3, PLAN §3.11).
// canEdit: POST /lock on mount, every 30 s and when the tab becomes visible again (FR-541); the server upserts the
// lease when it is mine or expired. Someone else holds it → read-only "held" (+ takeover). Lost it while editing →
// flush our unsaved work first, then read-only "displaced"; a flush that left the document dirty (save failed) sets
// `unsaved` — the banner then never claims the work was saved and PageEditor keeps autosave (and its retries) running
// for that work (X63: the save is accepted while our version is current) until a save leaves it clean. Mine again with a newer version → fresh content before
// editing (the taker edits only after a fresh fetch). !canEdit (protected for workers, archived): GET /lock every
// 30 s, "viewOnly"; a newer version reloads the content silently (M4-D3).
// Release: DELETE (keepalive) on pagehide / unmount while editing. Effects are idempotent (StrictMode double mount).
// Failures are never silent (SPEC P4): the first acquire failing → "lost" (banner + "แก้ต่อ" retries at once); a
// failed takeover → error toast, still read-only.
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import type { LeaseState } from '@/lib/contracts/pages'

/** `lost`: the lease could not be requested at all (network / server error before any answer); read-only. */
export type LeaseMode = 'loading' | 'editing' | 'held' | 'displaced' | 'viewOnly' | 'lost'

export const LEASE_HEARTBEAT_MS = 30_000

export interface EditLeaseOptions {
  pageId: string
  canEdit: boolean
  getVersion: () => number
  isDirty: () => boolean
  flush: () => Promise<void>
  /** Re-create the editor from a fresh GET /api/pages/:id (the argument is the version the lease reported). */
  onRemoteVersion: (version: number) => Promise<void>
}

export interface EditLease {
  mode: LeaseMode
  lease: LeaseState | null
  takeover: () => Promise<void>
  /** Ask for the lease again now (the "lost" banner button; the heartbeat also retries). */
  retry: () => Promise<void>
  /** Feed a lease state from elsewhere (the save result carries one). */
  report: (lease: LeaseState) => void
  /** Displaced while our last edits are still unsaved (FR-542: read-only only after the save). */
  unsaved: boolean
  /** Try to save the unsaved work again now (the displaced banner button; autosave also retries). */
  retrySave: () => Promise<void>
}

const lockUrl = (pageId: string, takeover = false): string =>
  `/api/pages/${pageId}/lock${takeover ? '?takeover=1' : ''}`

export function useEditLease(o: EditLeaseOptions): EditLease {
  const { pageId, canEdit } = o
  const [mode, setModeState] = useState<LeaseMode>(canEdit ? 'loading' : 'viewOnly')
  const [lease, setLease] = useState<LeaseState | null>(null)
  const [unsaved, setUnsaved] = useState(false)

  const modeRef = useRef<LeaseMode>(mode)
  const opts = useRef(o)
  /** Only the response of the latest request is applied (a poll answered after a takeover is stale). */
  const seq = useRef(0)
  const alive = useRef(false)
  const viewerVersion = useRef(o.getVersion())

  useEffect(() => {
    opts.current = o
  })

  const setMode = useCallback((m: LeaseMode) => {
    modeRef.current = m
    setModeState(m)
  }, [])

  /** Apply a lease answer for a user who may edit. */
  const applyEditable = useCallback(
    async (l: LeaseState, mySeq: number): Promise<void> => {
      if (!alive.current || mySeq !== seq.current) return
      setLease(l)
      const { getVersion, isDirty, flush, onRemoteVersion } = opts.current
      if (l.mine) {
        if (modeRef.current !== 'editing' && l.version > getVersion() && !isDirty())
          await onRemoteVersion(l.version)
        if (!alive.current || mySeq !== seq.current) return
        setUnsaved(false)
        setMode('editing')
        return
      }
      if (modeRef.current === 'editing') {
        await flush() // accepted while our version is current (X63)
        if (!alive.current) return
        setUnsaved(isDirty()) // the save failed → never claim it worked (SPEC P4)
        setMode('displaced')
        return
      }
      if (modeRef.current === 'displaced') setUnsaved(isDirty()) // a later save (retry) may have cleaned it
      else setMode('held')
    },
    [setMode],
  )

  const poll = useCallback(async (): Promise<void> => {
    const mySeq = ++seq.current
    try {
      if (opts.current.canEdit) {
        const l = await getJson<LeaseState>(lockUrl(pageId), { method: 'POST' })
        await applyEditable(l, mySeq)
      } else {
        const l = await getJson<LeaseState>(lockUrl(pageId))
        if (!alive.current || mySeq !== seq.current) return
        setLease(l)
        if (l.version > viewerVersion.current) {
          viewerVersion.current = l.version
          await opts.current.onRemoteVersion(l.version)
        }
      }
    } catch {
      // Network / server error: keep an answered mode (the next heartbeat retries); with no answer yet the editor
      // would stay read-only without a word → "lost".
      if (alive.current && mySeq === seq.current && opts.current.canEdit && modeRef.current === 'loading')
        setMode('lost')
    }
  }, [pageId, applyEditable, setMode])

  const takeover = useCallback(async (): Promise<void> => {
    const mySeq = ++seq.current
    try {
      const l = await getJson<LeaseState>(lockUrl(pageId, true), { method: 'POST' })
      if (!alive.current || mySeq !== seq.current) return
      setLease(l)
      await opts.current.onRemoteVersion(l.version) // always re-create from fresh content
      if (!alive.current || mySeq !== seq.current) return
      setMode('editing')
    } catch {
      // stays read-only; the user can press the button again
      if (alive.current && mySeq === seq.current) toast.error(th.editor.lease.takeoverFailed)
    }
  }, [pageId, setMode])

  const report = useCallback(
    (l: LeaseState) => {
      if (!opts.current.canEdit) return
      const mySeq = ++seq.current
      void applyEditable(l, mySeq)
    },
    [applyEditable],
  )

  const retrySave = useCallback(async (): Promise<void> => {
    const { flush, isDirty } = opts.current
    await flush()
    if (alive.current && modeRef.current === 'displaced') setUnsaved(isDirty())
  }, [])

  useEffect(() => {
    alive.current = true
    modeRef.current = canEdit ? 'loading' : 'viewOnly'
    viewerVersion.current = opts.current.getVersion()
    const first = setTimeout(() => void poll(), 0) // first acquire right after mount
    const timer = setInterval(() => void poll(), LEASE_HEARTBEAT_MS)
    const release = (): void => {
      if (modeRef.current !== 'editing') return
      void fetch(lockUrl(pageId), { method: 'DELETE', keepalive: true }).catch(() => {})
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', release)
    return () => {
      alive.current = false
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [pageId, canEdit, poll])

  return {
    mode: canEdit ? mode : 'viewOnly',
    lease,
    takeover,
    retry: poll,
    report,
    unsaved: canEdit && mode === 'displaced' && unsaved,
    retrySave,
  }
}
