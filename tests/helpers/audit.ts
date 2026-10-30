// tests/helpers/audit.ts — audit_log assertions for the matrix (X44) and suites.
import { asc, count, gt, max } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'

/** Highest audit_log id so far (0 when empty); pass it to auditRowsAfter(). */
export async function auditCount(): Promise<number> {
  const [row] = await db.select({ m: max(auditLog.id) }).from(auditLog)
  return Number(row?.m ?? 0)
}

export async function auditRowsAfter(id: number): Promise<Array<typeof auditLog.$inferSelect>> {
  return db.select().from(auditLog).where(gt(auditLog.id, id)).orderBy(asc(auditLog.id))
}

export async function auditTotal(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(auditLog)
  return Number(row?.n ?? 0)
}
