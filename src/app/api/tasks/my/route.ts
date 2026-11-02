// GET /api/tasks/my — my open assigned leaf tasks in non-archived projects grouped into the FR-1009 buckets
// สัปดาห์นี้ / สัปดาห์หน้า / หลังจากนั้น / ยังไม่วางแผน (M9-D17, X95 — replaces M3's MyTasksResponse). Authz:
// services.myTasks.listMyTaskBuckets calls authz.requireUser; only the caller's own rows are selected (no masking
// involved). `today` = serverToday() (X45); one read-only REPEATABLE READ transaction (PLAN §3.4.5).
import type { MyTaskBucketsResponse } from '@/lib/contracts/tasks'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route((_req, { user }): Promise<MyTaskBucketsResponse> => {
  authz.requireUser(user)
  const today = serverToday()
  return db.transaction((tx) => services.myTasks.listMyTaskBuckets(tx, user, today), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
})
