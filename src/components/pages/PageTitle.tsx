'use client'
import { useRef, type Ref } from 'react'
import InputBase from '@mui/material/InputBase'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { PageSpace } from '@/lib/contracts/pages'
import { invalidatePage, invalidatePages } from '@/lib/invalidate'
import { PAGE_TITLE_MAX } from '@/lib/schemas/pages'
import { renamePage } from '@/server/actions/pages'
import { errorMessage } from './usePageActions'

/** FR-504: the title commits 600 ms after typing stops, on blur and on Enter (M4-D4: never bumps the content version). */
export const TITLE_DEBOUNCE_MS = 600

export interface PageTitleProps {
  pageId: string
  value: string
  canEdit: boolean
  scope: { space: PageSpace; projectId: string | null }
  onChange: (title: string) => void
  /** Enter: commit and move the caret into the editor. */
  onEnter?: () => void
  inputRef?: Ref<HTMLTextAreaElement>
}

/** Borderless page title; read-only unless the viewer can edit. IME-safe (Enter while composing Thai is ignored). */
export function PageTitle({ pageId, value, canEdit, scope, onChange, onEnter, inputRef }: PageTitleProps) {
  const qc = useQueryClient()
  const saved = useRef(value)
  const m = useMutation({ mutationFn: (title: string) => unwrap(renamePage({ pageId, title })) })

  const commit = async (raw: string) => {
    const title = raw.trim()
    if (title === saved.current) return
    const prev = saved.current
    saved.current = title
    try {
      const r = await m.mutateAsync(title)
      saved.current = r.title
      void invalidatePages(qc, scope)
      void invalidatePage(qc, pageId)
    } catch (e) {
      saved.current = prev
      onChange(prev)
      toast.error(errorMessage(e, th.pages.toasts.renameFailed))
    }
  }
  const debounced = useDebouncedCallback((t: string) => void commit(t), TITLE_DEBOUNCE_MS)

  return (
    <InputBase
      value={value}
      readOnly={!canEdit}
      placeholder={th.pages.untitled}
      fullWidth
      multiline
      inputRef={inputRef}
      onChange={(e) => {
        const next = e.target.value.replace(/\n/g, '')
        onChange(next)
        debounced.call(next)
      }}
      onBlur={() => {
        debounced.cancel()
        void commit(value)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
        e.preventDefault()
        debounced.cancel()
        void commit(value)
        onEnter?.()
      }}
      slotProps={{ input: { 'aria-label': th.pages.titleLabel, maxLength: PAGE_TITLE_MAX } }}
      sx={{
        fontSize: { xs: '1.75rem', sm: '2.25rem' },
        fontWeight: 700,
        lineHeight: 1.25,
        '& textarea::placeholder': { color: 'text.disabled', opacity: 1 },
      }}
    />
  )
}
