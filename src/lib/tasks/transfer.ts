// src/lib/tasks/transfer.ts — undo of an assignment transfer (FR-610, M3-D3): the same ids, the other direction.
import type { AssignmentTransfer } from '@/lib/contracts/tasks'

export const reverseTransfer = (t: AssignmentTransfer): AssignmentTransfer => ({
  assignmentIds: t.assignmentIds,
  fromTaskId: t.toTaskId,
  toTaskId: t.fromTaskId,
})
