// src/components/tasks/task-ids.ts — temp id → server id map and the default error text of task writes. Split out of
// useTaskMutations so other write hooks (milestones, M8 S4.1) use them without importing every task action.
import { th } from '@/i18n/th'

/** temp id → server id, filled by create's onSuccess; shared by every hook instance (R9). Scoped mutations
 *  guarantee the create has resolved before a later mutation's mutationFn reads it. */
export const idMap = new Map<string, string>()
export const resolveId = (id: string): string => idMap.get(id) ?? id

export function errorMessage(err: unknown): string {
  return err instanceof Error && err.message !== '' ? err.message : th.tasks.toast.saveFailed
}
