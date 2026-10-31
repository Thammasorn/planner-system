import Button from '@mui/material/Button'
import Link from '@/components/Link'
import { EmptyState } from '@/components/common/EmptyState'
import { th } from '@/i18n/th'

/** 404 for invisible, deleted, unknown or malformed page ids (X41) — the same answer for all of them. */
export default function PageNotFound() {
  return (
    <EmptyState
      title={th.pages.notFound.title}
      description={th.pages.notFound.body}
      action={
        <Button variant="contained" component={Link} href="/home">
          {th.pages.notFound.back}
        </Button>
      }
    />
  )
}
