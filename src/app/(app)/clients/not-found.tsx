import { NotFoundScreen } from '@/components/common/NotFoundScreen'
import { th } from '@/i18n/th'

/** 404 for invisible, unknown or malformed client ids (X41, X61). */
export default function ClientNotFound() {
  return (
    <NotFoundScreen
      title={th.clients.notFound.title}
      description={th.clients.notFound.body}
      backHref="/clients"
      backLabel={th.clients.notFound.back}
    />
  )
}
