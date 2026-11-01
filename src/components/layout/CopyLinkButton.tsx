'use client'
// src/components/layout/CopyLinkButton.tsx — 🔗 of a document header (FR-1603, SPEC §8.12, M6.1-D26): copies the
// absolute URL of `href` (default: the current page) with `copyText()` (works over plain HTTP, X53) and confirms in a toast.
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import type { JSX } from 'react'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { copyText } from '@/lib/copy-text'

export async function copyLink(href?: string): Promise<void> {
  const url = href ? new URL(href, window.location.origin).toString() : window.location.href
  if (await copyText(url)) toast(th.layout.linkCopied)
  else toast.error(th.layout.copyLinkFailed)
}

export function CopyLinkButton({ href }: { href?: string }): JSX.Element {
  return (
    <Tooltip title={th.layout.copyLink}>
      <IconButton aria-label={th.layout.copyLink} onClick={() => void copyLink(href)}>
        <LinkOutlined fontSize="small" />
      </IconButton>
    </Tooltip>
  )
}
