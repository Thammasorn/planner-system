import { NotFoundScreen } from '@/components/common/NotFoundScreen'
import { th } from '@/i18n/th'

/** 404 for invisible, deleted, unknown or malformed page ids (X41) — the same answer for all of them. */
export default function PageNotFound() {
  return (
    <NotFoundScreen
      title={th.pages.notFound.title}
      description={th.pages.notFound.body}
      backHref="/home"
      backLabel={th.pages.notFound.back}
    />
  )
}
