import 'server-only'
import { formatThaiInstantDate } from '@/lib/format'

/** M0 only: request-time date in Asia/Bangkok. M1 replaces the call site with formatThaiDate(serverToday()) (X45). */
export function requestDateLabel(): string {
  return formatThaiInstantDate(new Date())
}
