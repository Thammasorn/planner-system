// M4 S1.9 — FR-402 Project Charter in createProject's transaction + idempotent backfill (X25, X70, M4-D5/D6/D37c).
import { and, asc, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { createProject } from '../actions/projects'
import { asUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makePage, makeProject } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { pages, taskStatuses } from '../db/schema'
import { ensureProjectCharters } from './charters'

async function chartersOf(projectId: string) {
  return db
    .select()
    .from(pages)
    .where(and(eq(pages.projectId, projectId), eq(pages.isCharter, true), isNull(pages.deletedAt)))
}

describe('createProject → charter', () => {
  it('exactly one pre-filled charter, the 5 default statuses and still one audit row', async () => {
    const w = await createWorld()
    asUser(w.manager)
    const mark = await auditCount()
    const res = await createProject({
      name: 'โปรเจคเอกสาร',
      clientId: w.C1.id,
      certainty: 'CONFIRMED',
      leadUserId: w.lead.id,
    })
    if (!res.ok) throw new Error(res.message)
    const charters = await chartersOf(res.projectId)
    expect(charters).toHaveLength(1)
    const c = charters[0]!
    expect(c).toMatchObject({
      title: th.pages.charterTitle,
      icon: '📋',
      space: 'PROJECT',
      depth: 0,
      parentId: null,
      version: 1,
      createdBy: w.manager.id,
    })
    expect(c.contentText).toContain(w.C1.name)
    expect(c.contentText).toContain(w.lead.nickname!)
    expect(c.contentText).toContain(th.projects.certainty.CONFIRMED)
    const statuses = await db.select().from(taskStatuses).where(eq(taskStatuses.projectId, res.projectId))
    expect(statuses).toHaveLength(5)
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ entity: 'project', action: 'create', after: { charterPageId: c.id } })
  })

  it('without client or LEAD the cells read "—"', async () => {
    const w = await createWorld()
    asUser(w.manager)
    const res = await createProject({ name: 'ไม่มีลูกค้า' })
    if (!res.ok) throw new Error(res.message)
    const [c] = await chartersOf(res.projectId)
    expect(c!.contentText).toContain('—')
  })
})

describe('ensureProjectCharters', () => {
  it('backfills P/Q/A once (actor-null audit rows), then is a no-op; a soft-deleted charter is replaced', async () => {
    const w = await createWorld()
    const mark = await auditCount()
    expect(await ensureProjectCharters(db)).toEqual({ created: 3 })
    expect(await ensureProjectCharters(db)).toEqual({ created: 0 })
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(3)
    for (const a of audits) expect(a).toMatchObject({ entity: 'page', action: 'create', actorId: null })
    expect(audits.map((a) => a.summary)).toContain(th.audit.charterCreated(w.P.name))
    const [pc] = await chartersOf(w.P.id)
    expect(pc).toMatchObject({ createdBy: w.P.createdBy, updatedBy: w.P.createdBy })
    expect(pc!.contentText).toContain(w.C1.name)
    expect(pc!.contentText).toContain(w.lead.nickname!)
    await db.update(pages).set({ deletedAt: new Date(), deletedBatch: pc!.id }).where(eq(pages.id, pc!.id))
    expect(await ensureProjectCharters(db)).toEqual({ created: 1 })
    expect(await chartersOf(w.P.id)).toHaveLength(1)
  })

  it('the backfilled charter is the first root of its project', async () => {
    const w = await createWorld({ with: ['pages'] })
    const p = await makeProject({ name: 'มีหน้าอยู่แล้ว', lead: w.lead })
    await makePage({ project: p, title: 'หน้าเดิม', createdBy: w.manager })
    await ensureProjectCharters(db)
    const roots = await db
      .select({ isCharter: pages.isCharter })
      .from(pages)
      .where(and(eq(pages.projectId, p.id), isNull(pages.parentId), isNull(pages.deletedAt)))
      .orderBy(asc(pages.position), asc(pages.id))
    expect(roots.map((r) => r.isCharter)).toEqual([true, false])
  })
})
