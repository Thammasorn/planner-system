import { NotFoundScreen } from '@/components/common/NotFoundScreen'
import { th } from '@/i18n/th'

/** 404 for invisible, unknown or malformed project ids (X41, §12 M2) — same answer for all three. */
export default function ProjectNotFound() {
  return (
    <NotFoundScreen
      title={th.projects.notFound.title}
      description={th.projects.notFound.body}
      backHref="/projects"
      backLabel={th.projects.notFound.back}
    />
  )
}
