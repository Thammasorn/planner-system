import { NotFoundScreen } from '@/components/common/NotFoundScreen'
import { th } from '@/i18n/th'

/** 404 for invisible, deleted, unknown or malformed task ids (X41, FR-687) — the same answer for all of them. */
export default function TaskNotFound() {
  return (
    <NotFoundScreen
      title={th.taskPage.notFound}
      description={th.taskPage.notFoundBody}
      backHref="/my"
      backLabel={th.taskPage.notFoundBack}
    />
  )
}
