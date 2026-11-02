import { NotFoundScreen } from '@/components/common/NotFoundScreen'
import { th } from '@/i18n/th'

/** 404 of /people/[id]/** for invisible, unknown or malformed user ids (X86) — the same answer for all three. */
export default function PersonNotFound() {
  return (
    <NotFoundScreen
      title={th.errors.notFoundPage.title}
      description={th.errors.notFoundPage.body}
      backHref="/people"
      backLabel={th.people.title}
    />
  )
}
