import type { Metadata } from 'next'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { th } from '@/i18n/th'
import { formatThaiDate } from '@/lib/format'
import { serverToday } from '@/server/clock'

export const metadata: Metadata = { title: th.home.title }

/** `/home` placeholder (X32, M0-D6). The dashboard arrives in M10; no links until other areas exist. Header bar
 *  per FR-1603 (หน้าหลัก as the <h1>), the greeting on the --font-xl step. */
export default function HomePage() {
  const today = formatThaiDate(serverToday()) // APP_NOW-aware (X45)
  return (
    <>
      <PageHeaderBar crumbs={[{ label: th.home.title, asHeading: true }]} />
      <Stack spacing={1}>
        <Typography variant="h3" component="p">
          {th.home.greeting}
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>{th.home.today(today)}</Typography>
        <EmptyState title={th.home.placeholderTitle} description={th.home.placeholderBody} />
      </Stack>
    </>
  )
}
