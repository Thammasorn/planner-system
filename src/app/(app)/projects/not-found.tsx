import Button from '@mui/material/Button'
import Link from '@/components/Link'
import { EmptyState } from '@/components/common/EmptyState'
import { th } from '@/i18n/th'

/** 404 for invisible, unknown or malformed project ids (X41, §12 M2) — same answer for all three. */
export default function ProjectNotFound() {
  return (
    <EmptyState
      title={th.projects.notFound.title}
      description={th.projects.notFound.body}
      action={
        <Button variant="contained" component={Link} href="/projects">
          {th.projects.notFound.back}
        </Button>
      }
    />
  )
}
