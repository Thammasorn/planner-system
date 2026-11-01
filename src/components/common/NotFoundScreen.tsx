'use client'
// src/components/common/NotFoundScreen.tsx — a signed-in 404 screen (X41): the header bar names it (<h1>, M6.1-D19) and
// the body explains it with one way back. Used by the not-found.tsx files of /projects, /clients, /p (and /t).
import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined'
import Button from '@mui/material/Button'
import type { JSX } from 'react'
import Link from '@/components/Link'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { EmptyState } from './EmptyState'

export function NotFoundScreen(p: {
  title: string
  description: string
  backHref: string
  backLabel: string
}): JSX.Element {
  return (
    <>
      <PageHeaderBar crumbs={[{ label: p.title, asHeading: true }]} />
      <EmptyState
        icon={<SearchOffOutlined fontSize="inherit" />}
        description={p.description}
        action={
          <Button variant="contained" component={Link} href={p.backHref}>
            {p.backLabel}
          </Button>
        }
      />
    </>
  )
}
