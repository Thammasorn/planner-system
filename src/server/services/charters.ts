// src/server/services/charters.ts — FR-402 Project Charter (X25, M4-D5/D6). createCharter runs inside createProject's
// transaction (no own audit row there: the project's single row carries after.charterPageId, M4-D5);
// ensureProjectCharters backfills older projects with one audit row each (actor null).
import { asc, sql } from 'drizzle-orm'
import type { Certainty } from '@/domain/types'
import { th } from '@/i18n/th'
import { charterTemplate } from '@/i18n/templates.th'
import { displayName } from '@/lib/display-name'
import { extractContentText } from '@/lib/editor/content-text'
import * as audit from '../audit'
import { clients, type PageRow, projectMembers, projects, user } from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'
import { pgErrorInfo } from '../errors'
import * as pagesRepo from '../repo/pages'
import { keyAt, lockPageScope } from './page-tree'

export async function createCharter(
  tx: Tx,
  a: {
    projectId: string
    projectName: string
    actorId: string
    clientName: string | null
    leadName: string | null
    certainty: Certainty
  },
): Promise<PageRow> {
  const t = charterTemplate({
    clientName: a.clientName,
    leadName: a.leadName,
    certaintyLabel: th.projects.certainty[a.certainty],
  })
  const scope = { space: 'PROJECT' as const, projectId: a.projectId, parentId: null }
  await lockPageScope(tx, scope)
  const position = await keyAt(tx, { ...scope, afterId: null }) // first root
  return pagesRepo.insertPage(tx, {
    ...scope,
    depth: 0,
    position,
    isCharter: true,
    title: t.title,
    icon: t.icon,
    content: t.content,
    contentText: extractContentText(t.content),
    createdBy: a.actorId,
    updatedBy: a.actorId,
  })
}

type MissingRow = {
  id: string
  name: string
  created_by: string
  certainty: Certainty
  client_name: string | null
}

/** Idempotent: every live project without a live charter gets one (own transaction each; a race → skip). */
export async function ensureProjectCharters(db: DbOrTx): Promise<{ created: number }> {
  const missing = await db.execute<MissingRow>(sql`
    select p.id, p.name, p.created_by, p.certainty, c.name as client_name
    from ${projects} p
    left join ${clients} c on c.id = p.client_id
    where p.deleted_at is null
      and not exists (select 1 from pages g where g.project_id = p.id and g.is_charter and g.deleted_at is null)
    order by p.created_at, p.id`)
  let created = 0
  for (const p of missing) {
    try {
      await db.transaction(async (tx) => {
        const [lead] = await tx
          .select({ name: user.name, nickname: user.nickname })
          .from(projectMembers)
          .innerJoin(user, sql`${user.id} = ${projectMembers.userId}`)
          .where(sql`${projectMembers.projectId} = ${p.id} and ${projectMembers.role} = 'LEAD'`)
          .orderBy(asc(projectMembers.addedAt))
          .limit(1)
        const page = await createCharter(tx, {
          projectId: p.id,
          projectName: p.name,
          actorId: p.created_by,
          clientName: p.client_name ?? '—',
          leadName: lead ? displayName(lead) : '—',
          certainty: p.certainty,
        })
        await audit.log(tx, null, {
          entity: 'page',
          entityId: page.id,
          action: 'create',
          projectId: p.id,
          summary: th.audit.charterCreated(p.name),
        })
      })
      created += 1
    } catch (e) {
      if (pgErrorInfo(e).code === '23505') continue // raced with another backfill / createProject
      throw e
    }
  }
  return { created }
}
