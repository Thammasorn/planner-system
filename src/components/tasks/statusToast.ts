// src/components/tasks/statusToast.ts — BR-52 toast text for every path that moves tasks into DONE (X19, X71, M6-D16).
import { formatCd } from '@/domain/units'
import { th } from '@/i18n/th'
import type { SetTaskStatusResult } from '@/lib/contracts/tasks'

/** BR-52: released load replaces the path's own message ("ติ๊กเสร็จแล้ว", "เปลี่ยน … เป็น 'เสร็จ' แล้ว", …). */
export function statusToastMessage(result: Pick<SetTaskStatusResult, 'released'>, fallback: string): string {
  const released = result.released
  if (!released || released.cd <= 0) return fallback
  return th.tasks.toast.released(formatCd(released.cd, { unit: 'DAYS', decimals: 1 }), released.weeks)
}
