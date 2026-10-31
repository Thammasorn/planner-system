'use client'
import MuiBreadcrumbs from '@mui/material/Breadcrumbs'
import MuiLink from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import Link from '@/components/Link'
import { th } from '@/i18n/th'
import type { PageCrumb, PageSpace } from '@/lib/contracts/pages'

export interface PageBreadcrumbsProps {
  space: PageSpace
  projectId: string | null
  projectName: string | null
  /** Ancestors, root first (the current page is not included). */
  crumbs: readonly PageCrumb[]
  current: { title: string; icon: string | null }
}

const label = (c: { title: string; icon: string | null }) =>
  `${c.icon ? `${c.icon} ` : ''}${c.title || th.pages.untitled}`

/**
 * Where the page lives (FR-504): Wiki ทีม (plain text) or the project name (→ its เอกสาร tab), then the ancestors as
 * links, then the current page with aria-current="page".
 */
export function PageBreadcrumbs({ space, projectId, projectName, crumbs, current }: PageBreadcrumbsProps) {
  const linkSx = { color: 'text.secondary', fontSize: '0.875rem' } as const
  return (
    <MuiBreadcrumbs aria-label={th.pages.breadcrumbLabel} sx={{ fontSize: '0.875rem' }}>
      {space === 'PROJECT' && projectId ? (
        <MuiLink component={Link} href={`/projects/${projectId}/pages`} underline="hover" sx={linkSx}>
          {projectName ?? ''}
        </MuiLink>
      ) : (
        <Typography component="span" sx={linkSx}>
          {th.pages.wikiRoot}
        </Typography>
      )}
      {crumbs.map((c) => (
        <MuiLink key={c.id} component={Link} href={`/p/${c.id}`} underline="hover" sx={linkSx}>
          {label(c)}
        </MuiLink>
      ))}
      <Typography component="span" aria-current="page" sx={{ color: 'text.primary', fontSize: '0.875rem' }}>
        {label(current)}
      </Typography>
    </MuiBreadcrumbs>
  )
}
