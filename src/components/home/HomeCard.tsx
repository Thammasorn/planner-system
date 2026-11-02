'use client'
import type { ReactNode } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import type { SxProps, Theme } from '@mui/material/styles'

/**
 * Shared link styles for /home cards (SPEC §4.16 / §8.12): never the browser-default blue/purple underline.
 * `homeActionLinkSx` — a card-header action ("ดูทั้งหมด…"): accent colour, underline only on hover/focus.
 * `homeItemLinkSx` — an item title inside a card: primary text, underline only on hover/focus.
 */
const underlineOnInteract = {
  textDecoration: 'none',
  '&:hover, &:focus-visible': { textDecoration: 'underline' },
} as const

export const homeActionLinkSx: SxProps<Theme> = {
  ...underlineOnInteract,
  color: 'primary.main',
  fontSize: 'var(--font-sm)',
  fontWeight: 'var(--weight-medium)',
  '&:visited': { color: 'primary.main' },
}

export const homeItemLinkSx: SxProps<Theme> = {
  ...underlineOnInteract,
  color: 'text.primary',
  fontWeight: 'var(--weight-medium)',
  overflowWrap: 'anywhere',
  '&:visited': { color: 'text.primary' },
}

/**
 * One card of /home (FR-1101, SPEC §8.2 / §8.12): 1 px `--border-subtle` border, `--radius-lg`, no heavy shadow; the
 * title is an <h2> (headings are what screen readers and e2e use). `section` + aria-labelledby names the region.
 */
export function HomeCard({
  id,
  title,
  action,
  children,
  testId,
}: {
  id: string
  title: string
  action?: ReactNode
  children: ReactNode
  testId?: string
}) {
  const headingId = `home-card-${id}`
  return (
    <Card
      variant="outlined"
      component="section"
      aria-labelledby={headingId}
      data-testid={testId ?? `home-card-${id}`}
      sx={{
        height: '100%',
        minWidth: 0,
        borderColor: 'var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <CardHeader
        title={title}
        action={action}
        slotProps={{
          title: {
            id: headingId,
            component: 'h2',
            sx: { fontSize: 'var(--font-lg)', fontWeight: 'var(--weight-bold)', m: 0 },
          },
          action: { sx: { alignSelf: 'center', m: 0 } },
        }}
        sx={{ pb: 0, gap: 1, flexWrap: 'wrap' }}
      />
      <CardContent sx={{ minWidth: 0, overflowWrap: 'anywhere', '&:last-child': { pb: 2 } }}>
        {children}
      </CardContent>
    </Card>
  )
}
