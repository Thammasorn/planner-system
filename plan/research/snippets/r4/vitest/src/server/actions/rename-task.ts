'use server'
import { revalidatePath, updateTag } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { sql } from '../db'

const Input = z.object({ taskId: z.uuid(), name: z.string().trim().min(1).max(200) })

export async function renameTask(raw: unknown) {
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { ok: false as const, code: 'VALIDATION' as const, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  const session = (await cookies()).get('session')?.value
  if (!session) return { ok: false as const, code: 'UNAUTHENTICATED' as const }
  const rows = await sql<{ project_id: string }[]>`update tasks set name = ${parsed.data.name} where id = ${parsed.data.taskId} returning project_id`
  const row = rows[0]
  if (!row) return { ok: false as const, code: 'NOT_FOUND' as const }
  updateTag(`project:${row.project_id}`)
  revalidatePath(`/projects/${row.project_id}`)
  return { ok: true as const }
}
