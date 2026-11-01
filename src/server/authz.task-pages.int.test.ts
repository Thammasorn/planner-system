// M6.1 S1.1 — requirePage dispatch on TASK pages and requireDocPage (SPEC §4.6.4 FR-687, §7.7, M6.1-D4).
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { toSessionUser } from '../../tests/helpers/as-user'
import { createWorld, type World } from '../../tests/helpers/world'
import { accessForPage, assertSecondPage, requireDocPage, requirePage } from './authz'
import { db } from './db/client'
import { tasks } from './db/schema'
import { ForbiddenError, NotFoundError } from './errors'

const S = toSessionUser
let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['taskBodies'] })
})

describe('requirePage on a TASK page (M6.1-D4)', () => {
  it('M / L / Me view and edit through requireTask; kind TASK and the live task are returned', async () => {
    const id = w.taskBodies.pLeafBody.id
    for (const [u, role] of [
      [w.manager, 'MANAGER'],
      [w.lead, 'LEAD'],
      [w.member, 'MEMBER'],
    ] as const) {
      for (const need of ['view', 'edit'] as const) {
        const a = await requirePage(db, S(u), id, need)
        expect(a).toMatchObject({ kind: 'TASK', role, archived: false, effectiveProtected: false })
        expect(a.task?.id).toBe(w.tasks.pLeaf.id)
        expect(a.page.id).toBe(id)
      }
    }
  })

  it('outsider → 404 (view and edit)', async () => {
    for (const need of ['view', 'edit'] as const) {
      await expect(requirePage(db, S(w.outsider), w.taskBodies.pLeafBody.id, need)).rejects.toBeInstanceOf(
        NotFoundError,
      )
    }
    // ...while the outsider's own project body is fine.
    await expect(requirePage(db, S(w.outsider), w.taskBodies.qTaskBody.id, 'edit')).resolves.toMatchObject({
      kind: 'TASK',
    })
  })

  it('archived project: view ok, edit → 403 for M / L / Me; outsider 404', async () => {
    const id = w.taskBodies.aTaskBody.id
    for (const u of [w.manager, w.lead, w.member]) {
      await expect(requirePage(db, S(u), id, 'view')).resolves.toMatchObject({ kind: 'TASK', archived: true })
      await expect(requirePage(db, S(u), id, 'edit')).rejects.toBeInstanceOf(ForbiddenError)
    }
    await expect(requirePage(db, S(w.outsider), id, 'view')).rejects.toBeInstanceOf(NotFoundError)
  })

  it("'protect' on a TASK page → 404 for everyone", async () => {
    for (const u of [w.manager, w.lead, w.member, w.outsider]) {
      await expect(requirePage(db, S(u), w.taskBodies.pLeafBody.id, 'protect')).rejects.toBeInstanceOf(
        NotFoundError,
      )
    }
  })

  it('the body of a soft-deleted task → 404 even when the page row is still live', async () => {
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, w.tasks.pLeaf.id))
    await expect(requirePage(db, S(w.manager), w.taskBodies.pLeafBody.id, 'view')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(
      accessForPage(db, S(w.manager), w.taskBodies.pLeafBody, 'view'),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('DOC pages keep M4 behaviour (kind DOC, task null)', async () => {
    const a = await requirePage(db, S(w.member), w.pages.pPage.id, 'edit')
    expect(a).toMatchObject({ kind: 'DOC', task: null, role: 'MEMBER' })
    const wiki = await requirePage(db, S(w.outsider), w.pages.wiki.id, 'view')
    expect(wiki).toMatchObject({ kind: 'DOC', task: null, role: 'WIKI' })
  })
})

describe('requireDocPage (M6.1-D4)', () => {
  it('a TASK page → 404 for everyone and every need', async () => {
    for (const u of [w.manager, w.lead, w.member, w.outsider]) {
      for (const need of ['view', 'edit', 'protect'] as const) {
        await expect(requireDocPage(db, S(u), w.taskBodies.pLeafBody.id, need)).rejects.toBeInstanceOf(
          NotFoundError,
        )
      }
    }
  })

  it('DOC pages behave like requirePage', async () => {
    await expect(requireDocPage(db, S(w.member), w.pages.pPage.id, 'edit')).resolves.toMatchObject({ kind: 'DOC' })
    await expect(requireDocPage(db, S(w.outsider), w.pages.pPage.id, 'view')).rejects.toBeInstanceOf(NotFoundError)
    await expect(requireDocPage(db, S(w.member), w.pages.aPage.id, 'edit')).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('a TASK page named as the second page (parent of create / move) → 404', async () => {
    await expect(
      assertSecondPage(db, S(w.manager), w.taskBodies.pLeafBody.id, { space: 'PROJECT', projectId: w.P.id }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
