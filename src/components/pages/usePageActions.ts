'use client'
// Page writes shared by the page header menu, the tree rows, the sidebar "+" buttons and the project tab
// (FR-506, FR-508, FR-509, FR-510; plan/m04 S3.2/S3.3). Server actions through useMutation + unwrap(); no action
// calls refresh() (M4-D29) — TanStack queries are invalidated instead (invalidatePages / invalidatePage).
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import { ApiError } from '@/lib/api'
import type { PageSpace } from '@/lib/contracts/pages'
import { invalidatePage, invalidatePages } from '@/lib/invalidate'
import { toggleExpanded } from '@/lib/pages/tree'
import {
  createPage,
  deletePage,
  duplicatePage,
  restorePageBatch,
  setPageProtected,
} from '@/server/actions/pages'

/** What the menus need to know about a page. */
export interface PageRef {
  id: string
  title: string
  space: PageSpace
  projectId: string | null
}

export type CreatePageArgs = Parameters<typeof createPage>[0]

/** The server's Thai message for action/route failures; `fallback` for anything else (network, bugs). */
export function errorMessage(err: unknown, fallback: string): string {
  return (err instanceof ActionFailure || err instanceof ApiError) && err.message !== ''
    ? err.message
    : fallback
}

const scopeOf = (p: { space: PageSpace; projectId: string | null }) => ({
  space: p.space,
  projectId: p.projectId,
})

/** Where to go after the page on screen was deleted: its parent, the project's เอกสาร tab, or home. */
export function afterDeleteHref(r: {
  parentId: string | null
  space: PageSpace
  projectId: string | null
}): string {
  if (r.parentId) return `/p/${r.parentId}`
  if (r.space === 'PROJECT' && r.projectId) return `/projects/${r.projectId}/pages`
  return '/home'
}

/** Create a page (blank — the template chooser is offered on it, X63), expand its parent, open it. */
export function useCreatePage() {
  const qc = useQueryClient()
  const router = useRouter()
  const { prefs, setPreference } = usePreferences()
  const m = useMutation({ mutationFn: (input: CreatePageArgs) => unwrap(createPage(input)) })

  const create = async (input: CreatePageArgs): Promise<void> => {
    const stored = prefs['sidebar.expanded'] ?? []
    try {
      const r = await m.mutateAsync(input)
      if (input.parentId && !stored.includes(`page:${input.parentId}`)) {
        setPreference('sidebar.expanded', toggleExpanded(stored, input.parentId, true))
      }
      void invalidatePages(qc, scopeOf(r))
      router.push(r.href)
    } catch (e) {
      toast.error(errorMessage(e, th.pages.toasts.createFailed))
    }
  }
  return { create, pending: m.isPending }
}

/** Duplicate · delete (undo toast + Cmd+Z, no confirm — P2, X04) · protect / unprotect. */
export function usePageActions() {
  const qc = useQueryClient()
  const router = useRouter()
  const undo = useUndo()
  const dup = useMutation({ mutationFn: (pageId: string) => unwrap(duplicatePage({ pageId })) })
  const del = useMutation({ mutationFn: (pageId: string) => unwrap(deletePage({ pageId })) })
  const prot = useMutation({
    mutationFn: (v: { pageId: string; protected: boolean }) => unwrap(setPageProtected(v)),
  })

  const duplicate = async (page: PageRef): Promise<void> => {
    try {
      const r = await dup.mutateAsync(page.id)
      void invalidatePages(qc, scopeOf(r))
      toast(th.pages.toasts.duplicated(page.title), {
        action: { label: th.pages.toasts.openCopy, onClick: () => router.push(`/p/${r.root.id}`) },
      })
    } catch (e) {
      toast.error(errorMessage(e, th.pages.toasts.actionFailed))
    }
  }

  /** `navigate`: the deleted page is the one on screen → go to its parent (or the space root). `onDeleted` runs once
   *  the server deleted it, before the tree refetch removes its row (the tree moves focus off that row, §8.9). */
  const remove = async (
    page: PageRef,
    opts: { navigate: boolean; onDeleted?: () => void },
  ): Promise<void> => {
    let r
    try {
      r = await del.mutateAsync(page.id)
    } catch (e) {
      toast.error(errorMessage(e, th.pages.toasts.actionFailed))
      return
    }
    opts.onDeleted?.()
    const scope = scopeOf(r)
    let batch = r.batch
    void invalidatePages(qc, scope)
    const message = th.pages.toasts.deleted(r.title, r.count)
    undo.push(
      {
        label: message,
        undo: async () => {
          await unwrap(restorePageBatch({ batch }))
          await Promise.all([invalidatePages(qc, scope), invalidatePage(qc, page.id)])
        },
        redo: async () => {
          batch = unwrap(await deletePage({ pageId: page.id })).batch
          await invalidatePages(qc, scope)
        },
      },
      { toast: message },
    )
    if (opts.navigate) router.push(afterDeleteHref(r))
  }

  /** `onChange` is the optimistic local state of the page header (rolled back on failure). */
  const setProtected = async (
    page: PageRef,
    value: boolean,
    onChange?: (locked: boolean) => void,
    onSaved?: (locked: boolean) => void,
  ): Promise<void> => {
    onChange?.(value)
    try {
      await prot.mutateAsync({ pageId: page.id, protected: value })
      onSaved?.(value)
      toast(value ? th.pages.toasts.protected : th.pages.toasts.unprotected)
      void invalidatePages(qc, scopeOf(page))
      void invalidatePage(qc, page.id)
    } catch (e) {
      onChange?.(!value)
      toast.error(errorMessage(e, th.pages.toasts.actionFailed))
    }
  }

  return { duplicate, remove, setProtected }
}
