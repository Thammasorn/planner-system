'use client'
import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { UploadedFileDTO } from '@/lib/contracts/files'
import type { PageDTO } from '@/lib/contracts/pages'
import { IMAGE_MIME, precheckFile, type UploadLimits } from '@/lib/files/upload-rules'
import { invalidatePage } from '@/lib/invalidate'
import { setPageCover } from '@/server/actions/pages'
import { errorMessage } from './usePageActions'

type Cover = PageDTO['cover']

const MB = 1024 * 1024

export interface CoverImageProps {
  pageId: string
  cover: Cover
  canEdit: boolean
  uploadLimits: UploadLimits
  onChange: (cover: Cover) => void
}

/** Thai message for a failed `POST /api/files` (413 too large, 415 type, anything else). */
async function uploadError(res: Response, limits: UploadLimits): Promise<string> {
  if (res.status === 413) return th.editor.upload.tooLargeImage(Math.floor(limits.imageBytes / MB))
  if (res.status === 415) return th.editor.upload.typeNotAllowed
  const body: unknown = await res.json().catch(() => null)
  const msg = body && typeof body === 'object' ? (body as Record<string, unknown>).message : undefined
  return typeof msg === 'string' && msg !== '' ? msg : th.editor.upload.failed
}

/**
 * Optional cover image (FR-504): full width, 200 px, object-fit cover. Editors upload a png/jpg/gif/webp through
 * `POST /api/files` (purpose 'cover') and attach it with `setPageCover`; remove sets it to null.
 * Focus: "ลบรูปปก" unmounts itself (optimistic) → focus goes to the "เพิ่มรูปปก" that replaces it, and back to
 * "ลบรูปปก" on rollback — never to <body> (SPEC §8.9; M1 fix-r1 rule).
 */
export function CoverImage({ pageId, cover, canEdit, uploadLimits, onChange }: CoverImageProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  /** The button to focus when it mounts after the cover branch switched. */
  const focusNext = useRef<'add' | 'remove' | null>(null)
  const focusOnMount =
    (which: 'add' | 'remove') =>
    (el: HTMLButtonElement | null): void => {
      if (el && focusNext.current === which) {
        focusNext.current = null
        el.focus()
      }
    }

  const attach = async (fileId: string | null) => {
    const r = await unwrap(setPageCover({ pageId, fileId }))
    onChange(r.cover)
    void invalidatePage(qc, pageId)
  }

  const upload = async (file: File) => {
    const pre = precheckFile(file, uploadLimits)
    if ('error' in pre || pre.kind !== 'IMAGE') {
      toast.error(
        'error' in pre && pre.error === 'tooLargeImage'
          ? th.editor.upload.tooLargeImage(Math.floor(uploadLimits.imageBytes / MB))
          : th.editor.upload.typeNotAllowed,
      )
      return
    }
    setBusy(true)
    try {
      const body = new FormData()
      body.set('file', file)
      body.set('pageId', pageId)
      body.set('purpose', 'cover')
      const res = await fetch('/api/files', { method: 'POST', body })
      if (!res.ok) {
        toast.error(await uploadError(res, uploadLimits))
        return
      }
      const uploaded = (await res.json()) as UploadedFileDTO
      await attach(uploaded.id)
    } catch (e) {
      toast.error(errorMessage(e, th.editor.upload.failed))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const prev = cover
    focusNext.current = 'add'
    onChange(null)
    try {
      await attach(null)
    } catch (e) {
      // Back to the remove button only when the user is still where we put them (never steal focus).
      const active = document.activeElement
      const onAdd = active instanceof HTMLElement && active.dataset.coverControl === 'add'
      if (onAdd || active === document.body || active === null) focusNext.current = 'remove'
      onChange(prev)
      toast.error(errorMessage(e, th.pages.toasts.actionFailed))
    }
  }

  const input = canEdit ? (
    <input
      ref={inputRef}
      type="file"
      hidden
      accept={IMAGE_MIME.join(',')}
      data-testid="cover-input"
      onChange={(e) => {
        const f = e.currentTarget.files?.[0]
        e.currentTarget.value = ''
        if (f) void upload(f)
      }}
    />
  ) : null
  const pickFile = () => inputRef.current?.click()

  if (!cover) {
    if (!canEdit) return null
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 32 }}>
        <Button
          ref={focusOnMount('add')}
          data-cover-control="add"
          size="small"
          startIcon={<ImageOutlined />}
          onClick={pickFile}
          disabled={busy}
          sx={{ color: 'text.secondary' }}
        >
          {th.pages.cover.add}
        </Button>
        {busy ? (
          <Typography role="status" variant="body2" sx={{ color: 'text.secondary' }}>
            {th.pages.cover.uploading}
          </Typography>
        ) : null}
        {input}
      </Stack>
    )
  }

  return (
    <Box sx={{ position: 'relative', mx: { xs: 'calc(-1 * var(--page-gutter))', sm: 0 } }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- authorised same-origin /api/files URL; next/image would proxy it */}
      <img
        src={cover.url}
        alt={th.pages.cover.alt}
        style={{
          display: 'block',
          width: '100%',
          height: 200,
          objectFit: 'cover',
          borderRadius: 'var(--radius-lg)',
        }}
      />
      {canEdit ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ position: 'absolute', right: 'var(--space-2)', bottom: 'var(--space-2)' }}
        >
          {busy ? (
            <Typography
              role="status"
              variant="body2"
              sx={{ bgcolor: 'background.paper', px: 1, borderRadius: 1 }}
            >
              {th.pages.cover.uploading}
            </Typography>
          ) : null}
          <Button size="small" variant="contained" color="inherit" onClick={pickFile} disabled={busy}>
            {th.pages.cover.change}
          </Button>
          <Button
            ref={focusOnMount('remove')}
            size="small"
            variant="contained"
            color="inherit"
            onClick={() => void remove()}
            disabled={busy}
          >
            {th.pages.cover.remove}
          </Button>
          {input}
        </Stack>
      ) : null}
    </Box>
  )
}
