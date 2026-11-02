import { NotFoundScreen } from '@/components/common/NotFoundScreen'
import { th } from '@/i18n/th'

/** 404 for invisible, deleted, unknown or malformed row ids (X41, X86, FR-1464) — the same answer for all of them. */
export default function RowNotFound() {
  return (
    <NotFoundScreen
      title={th.database.rowPage.notFound}
      description={th.database.rowPage.notFoundBody}
      backHref="/home"
      backLabel={th.database.rowPage.notFoundBack}
    />
  )
}
