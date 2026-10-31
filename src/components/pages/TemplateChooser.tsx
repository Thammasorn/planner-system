'use client'
import { useId } from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { ApplyTemplateResult, PageView } from '@/lib/contracts/pages'
import { qk } from '@/lib/query-keys'
import { applyTemplate } from '@/server/actions/pages'
import { errorMessage } from './usePageActions'

export type TemplateId = 'charter' | 'meeting' | 'sop'

/** FR-507 order: ว่าง · Project Charter · บันทึกการประชุม · คู่มือ/SOP. */
const CHOICES = [
  { id: 'blank', label: th.pages.templates.blank },
  { id: 'charter', label: th.pages.templates.charter },
  { id: 'meeting', label: th.pages.templates.meeting },
  { id: 'sop', label: th.pages.templates.sop },
] as const

export interface TemplateChooserProps {
  pageId: string
  /** The content version the page was loaded with. */
  version: number
  onApplied: (r: ApplyTemplateResult & { template: TemplateId }) => void
  /** ว่าง, a conflict, or the page is no longer blank: hide the row. */
  onDismiss: () => void
}

/**
 * Template row on a blank page (FR-507, M4-D7; no dialog — P1). Right before applying, the page is re-read so the
 * call sends the latest saved version (the editor may have autosaved since load) and is skipped when the page
 * already has content.
 */
export function TemplateChooser({ pageId, version, onApplied, onDismiss }: TemplateChooserProps) {
  const headingId = useId()
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (v: { baseVersion: number; template: TemplateId }) =>
      unwrap(applyTemplate({ pageId, baseVersion: v.baseVersion, template: v.template })),
  })

  const latest = async (): Promise<{ version: number; blank: boolean }> => {
    try {
      const view = await qc.query({
        queryKey: qk.page(pageId),
        queryFn: ({ signal }) => getJson<PageView>(`/api/pages/${pageId}`, { signal }),
        staleTime: 0,
      })
      return { version: view.page.version, blank: view.page.isBlank }
    } catch {
      return { version, blank: true } // the server re-checks the version anyway
    }
  }

  const choose = async (template: TemplateId) => {
    const cur = await latest()
    if (!cur.blank) {
      onDismiss()
      return
    }
    try {
      const r = await m.mutateAsync({ baseVersion: cur.version, template })
      onApplied({ ...r, template })
    } catch (e) {
      if (e instanceof ActionFailure && e.code === 'VERSION_CONFLICT') {
        toast.error(th.editor.conflict.banner)
        onDismiss()
        return
      }
      toast.error(errorMessage(e, th.pages.toasts.actionFailed))
    }
  }

  return (
    <Stack
      component="section"
      aria-labelledby={headingId}
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1}
      sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap', py: 1 }}
    >
      <Typography id={headingId} component="h2" variant="body2" sx={{ color: 'text.secondary', mr: 1 }}>
        {th.pages.templates.heading}
      </Typography>
      {CHOICES.map((c) => (
        <Button
          key={c.id}
          size="small"
          variant="outlined"
          disabled={m.isPending}
          onClick={() => (c.id === 'blank' ? onDismiss() : void choose(c.id))}
        >
          {c.label}
        </Button>
      ))}
    </Stack>
  )
}
