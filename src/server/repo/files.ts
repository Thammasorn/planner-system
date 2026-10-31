// src/server/repo/files.ts — file row primitives (plan/m04 S0.4 / S1). `tx` first.
import { asc, eq } from 'drizzle-orm'
import { z } from '@/lib/z'
import { files, type FileRow, type NewFile } from '../db/schema'
import type { DbOrTx } from '../db/types'

const uuidSchema = z.uuid()

export async function insertFile(tx: DbOrTx, v: NewFile): Promise<FileRow> {
  const [row] = await tx.insert(files).values(v).returning()
  return row!
}

/** Null for unknown or malformed ids (X86: no 22P02 → 500). */
export async function getFile(tx: DbOrTx, id: string): Promise<FileRow | null> {
  if (!uuidSchema.safeParse(id).success) return null
  const [row] = await tx.select().from(files).where(eq(files.id, id))
  return row ?? null
}

/** Storage keys of every file of a project (FR-407 permanent delete unlinks them after commit, X26). */
export async function listProjectFileKeys(tx: DbOrTx, projectId: string): Promise<string[]> {
  const rows = await tx
    .select({ key: files.storageKey })
    .from(files)
    .where(eq(files.projectId, projectId))
    .orderBy(asc(files.storageKey))
  return rows.map((r) => r.key)
}
