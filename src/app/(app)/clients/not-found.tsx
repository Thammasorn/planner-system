import Button from '@mui/material/Button'
import Link from '@/components/Link'
import { EmptyState } from '@/components/common/EmptyState'
import { th } from '@/i18n/th'

/** 404 for invisible, unknown or malformed client ids (X41, X61). */
export default function ClientNotFound() {
  return (
    <EmptyState
      title={th.clients.notFound.title}
      description={th.clients.notFound.body}
      action={
        <Button variant="contained" component={Link} href="/clients">
          {th.clients.notFound.back}
        </Button>
      }
    />
  )
}
