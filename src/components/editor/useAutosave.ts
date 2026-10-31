'use client'
// src/components/editor/useAutosave.ts — autosave (FR-531, FR-543, M4-D2/D26, PLAN §3.11, r3 §12).
// - Dirty check against a baseline serialised from the editor itself (never the DB JSON: jsonb reorders keys), so
//   `editable` toggles and selection-only changes never save (r3 G11).
// - Debounce 800 ms; flush on blur (incl. editor UI), tab hidden and unmount; one save in flight at a time.
// - Every save sends `baseVersion`; VERSION_CONFLICT never overwrites: the editor is blocked (banner + reload).
// - Leaving the page: a dirty document of ≤ 60 KB goes out as a keepalive PUT (M4-D2); larger → beforeunload prompt.
// - `pending` is true from a scheduled change until a save leaves the editor clean, so "saved" alone never stands
//   for an edit still waiting out its debounce (SaveStatus renders it as `data-dirty` for e2e, M4-D26).
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type { LeaseState } from '@/lib/contracts/pages'
import { savePageContent } from '@/server/actions/pages'
import type { AppEditor } from './schema'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
export type SaveBlock = false | 'conflict' | 'deleted' | 'forbidden'

export const AUTOSAVE_DEBOUNCE_MS = 800
export const AUTOSAVE_RETRY_MS = 5_000
/** keepalive bodies are capped at 64 KiB by browsers; keep a margin (M4-D2). */
export const KEEPALIVE_MAX_BYTES = 60_000

/** The part of the editor autosave reads (a structural subset, so tests can pass a fake). */
export type AutosaveEditor = Pick<AppEditor, 'document' | 'onFocusChange'>

export interface AutosaveOptions {
  editor: AutosaveEditor
  pageId: string
  /** Version the current editor instance was created from. */
  version: number
  /** false while read-only (no lease, protected, archived): nothing is scheduled or flushed. */
  enabled: boolean
  onLease: (lease: LeaseState) => void
}

export interface Autosave {
  status: SaveState
  /** A change is scheduled / in flight / awaiting retry and not yet saved. */
  pending: boolean
  schedule: () => void
  flush: () => Promise<void>
  isDirty: () => boolean
  getVersion: () => number
  blocked: SaveBlock
}

const blockFor = (code: string): SaveBlock =>
  code === 'VERSION_CONFLICT'
    ? 'conflict'
    : code === 'NOT_FOUND'
      ? 'deleted'
      : code === 'FORBIDDEN'
        ? 'forbidden'
        : false

const byteLength = (s: string): number => new TextEncoder().encode(s).length

export function useAutosave(o: AutosaveOptions): Autosave {
  const { editor, pageId } = o
  // State is keyed by the editor instance: a re-created editor (reload) starts clean without a reset effect.
  const [state, setState] = useState<{
    editor: AutosaveEditor
    status: SaveState
    blocked: SaveBlock
    pending: boolean
  }>({ editor, status: 'idle', blocked: false, pending: false })
  const current =
    state.editor === editor
      ? state
      : { editor, status: 'idle' as const, blocked: false as const, pending: false }

  const editorRef = useRef(editor)
  const baseline = useRef<string>('')
  const versionRef = useRef(o.version)
  const enabledRef = useRef(o.enabled)
  const blockedRef = useRef<SaveBlock>(false)
  const onLeaseRef = useRef(o.onLease)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // A (re)created editor: new baseline, version and an unblocked state.
  useEffect(() => {
    editorRef.current = editor
    baseline.current = JSON.stringify(editor.document)
    versionRef.current = o.version
    blockedRef.current = false
  }, [editor, o.version]) // the version always arrives together with its editor (PageEditor `doc` state)

  useEffect(() => {
    enabledRef.current = o.enabled
    onLeaseRef.current = o.onLease
  })

  const clearTimer = (): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }

  const set = useCallback(
    (patch: { status?: SaveState; blocked?: SaveBlock; pending?: boolean }) =>
      setState((s) => {
        const base =
          s.editor === editorRef.current
            ? s
            : { editor: editorRef.current, status: 'idle' as const, blocked: false as const, pending: false }
        const next = { ...base, ...patch }
        const same =
          next.editor === s.editor &&
          next.status === s.status &&
          next.blocked === s.blocked &&
          next.pending === s.pending
        return same ? s : next // blur flushes of a clean document must not re-render
      }),
    [],
  )

  const isDirty = useCallback(() => JSON.stringify(editorRef.current.document) !== baseline.current, [])
  const getVersion = useCallback(() => versionRef.current, [])

  const save = useCallback(
    async (json: string): Promise<void> => {
      const forEditor = editorRef.current
      set({ status: 'saving' })
      try {
        const res = await unwrap(
          savePageContent({
            pageId,
            baseVersion: versionRef.current,
            content: JSON.parse(json) as unknown[],
          }),
        )
        if (editorRef.current !== forEditor) return // re-created meanwhile; the new editor has its own baseline
        baseline.current = json
        versionRef.current = res.version
        // A newer change typed while this save was in flight keeps `pending` (its own timer saves it next).
        set({ status: 'saved', pending: JSON.stringify(forEditor.document) !== json })
        onLeaseRef.current(res.lease)
      } catch (err) {
        if (editorRef.current !== forEditor) return
        const blocked = err instanceof ActionFailure ? blockFor(err.code) : false
        if (blocked) {
          clearTimer()
          blockedRef.current = blocked
          set({ status: 'idle', blocked, pending: false })
          return
        }
        set({ status: 'error' })
        clearTimer()
        timer.current = setTimeout(() => void flushRef.current(), AUTOSAVE_RETRY_MS)
      }
    },
    [pageId, set],
  )

  const flush = useCallback(async (): Promise<void> => {
    clearTimer()
    if (inFlight.current) {
      await inFlight.current
      return flushRef.current()
    }
    if (blockedRef.current || !enabledRef.current) return
    const json = JSON.stringify(editorRef.current.document)
    if (json === baseline.current) {
      set({ pending: false }) // e.g. an editable toggle or a change undone before the debounce ran out
      return
    }
    const p = save(json)
    inFlight.current = p
    try {
      await p
    } finally {
      inFlight.current = null
    }
  }, [save, set])

  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  const schedule = useCallback(() => {
    if (blockedRef.current || !enabledRef.current) return
    clearTimer()
    set({ pending: true })
    timer.current = setTimeout(() => void flushRef.current(), AUTOSAVE_DEBOUNCE_MS)
  }, [set])

  // Blur (content area or its own UI) → flush.
  useEffect(
    () =>
      editor.onFocusChange(
        (_e, { focused }) => {
          if (!focused) void flushRef.current()
        },
        { includeEditorUI: true },
      ),
    [editor],
  )

  // Tab hidden → flush; leaving → keepalive PUT (≤ 60 KB) or the browser prompt (larger).
  useEffect(() => {
    const leaveBody = (): string | null => {
      if (blockedRef.current || !enabledRef.current) return null
      const json = JSON.stringify(editorRef.current.document)
      if (json === baseline.current) return null
      return `{"baseVersion":${versionRef.current},"content":${json}}`
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') void flushRef.current()
    }
    const onPageHide = (): void => {
      const body = leaveBody()
      if (body === null || byteLength(body) > KEEPALIVE_MAX_BYTES) return
      clearTimer()
      void fetch(`/api/pages/${pageId}/content`, {
        method: 'PUT',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body,
      }).catch(() => {})
    }
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      const body = leaveBody()
      if (body !== null && byteLength(body) > KEEPALIVE_MAX_BYTES) e.preventDefault()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [pageId])

  // In-app navigation (unmount): fire-and-forget flush; the server action completes in the same JS context.
  useEffect(
    () => () => {
      clearTimer()
      void flushRef.current()
    },
    [],
  )

  return {
    status: current.status,
    pending: current.pending,
    blocked: current.blocked,
    schedule,
    flush,
    isDirty,
    getVersion,
  }
}
