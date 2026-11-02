// M6.1 S1.10 / S1.11 — task bodies seen from the task side: `hasBody` in every task list (FR-691, M6.1-D11), the
// `/my` statuses (FR-1606, M6.1-D12/D25), delete / restore carrying bodies (FR-689, AC-626, M6.1-D13) and the
// permanent project delete removing bodies and their files (FR-689).
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyTaskBucketsResponse } from '@/lib/contracts/tasks'
import { deleteProjectPermanently } from '../actions/projects'
import { deleteTaskTree, restoreTaskBatch, updateTask } from '../actions/tasks'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { makeTask, makeTaskBody } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { files, pageLocks, pages, type PageRow } from '../db/schema'
import * as services from '../services'
import { listMyTaskBuckets } from './my-tasks'
import { acquireLease } from './page-lease'
import { listProjectTasks } from './tasks'
import { listTeamTasks } from './teamTasks'

const S = toSessionUser
/** The /my "today" of these cases (X45). */
const TODAY = '2026-09-30'
/** Project ids of every task on /my, in first-seen order. */
const projectIdsOf = (r: MyTaskBucketsResponse): string[] => [
  ...new Set(r.buckets.flatMap((b) => b.tasks.map((t) => t.projectId))),
]
let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['taskBodies'] })
})

async function pageRow(id: string): Promise<PageRow> {
  const [r] = await db.select().from(pages).where(eq(pages.id, id))
  return r!
}

describe('hasBody (FR-691, M6.1-D11)', () => {
  it('text / image-only / file-only → true; none / blank / deleted body → false (project list)', async () => {
    const by = { createdBy: w.manager }
    const blank = await makeTask({ project: w.P, name: 'ว่าง', ...by })
    await makeTaskBody({ task: blank, content: [{ type: 'paragraph' }], ...by })
    const empty = await makeTask({ project: w.P, name: 'ไม่มีบล็อก', ...by })
    await makeTaskBody({ task: empty, ...by })
    const image = await makeTask({ project: w.P, name: 'รูปอย่างเดียว', ...by })
    await makeTaskBody({ task: image, content: [{ type: 'image', props: { url: '', name: 'a.png' } }], ...by })
    const file = await makeTask({ project: w.P, name: 'ไฟล์ในลูก', ...by })
    await makeTaskBody({
      task: file,
      content: [{ type: 'bulletListItem', children: [{ type: 'file', props: { url: '', name: 'a.pdf' } }] }],
      ...by,
    })
    const gone = await makeTask({ project: w.P, name: 'ลบเนื้อหา', ...by })
    await makeTaskBody({ task: gone, content: 'มีข้อความ', deleted: { batch: crypto.randomUUID(), daysAgo: 1 }, ...by })

    const res = await listProjectTasks(db, S(w.member), w.P.id)
    const has = new Map(res.tasks.map((t) => [t.id, t.hasBody]))
    expect(has.get(w.tasks.pLeaf.id)).toBe(true)
    expect(has.get(image.id)).toBe(true)
    expect(has.get(file.id)).toBe(true)
    expect(has.get(w.tasks.pChildB.id)).toBe(false)
    expect(has.get(blank.id)).toBe(false)
    expect(has.get(empty.id)).toBe(false)
    expect(has.get(gone.id)).toBe(false)
  })

  it('single-task results, team tasks and /my carry it too', async () => {
    asUser(w.member)
    const upd = await updateTask({ taskId: w.tasks.pLeaf.id, patch: { dueDate: '2026-10-16' } })
    expect(upd).toMatchObject({ ok: true, task: { hasBody: true } })
    const team = await listTeamTasks(db, S(w.member), { blocked: false, includeDone: false })
    const card = (id: string) => team.cards.find((c) => c.id === id)
    expect(card(w.tasks.pLeaf.id)?.hasBody).toBe(true)
    expect(card(w.tasks.pChildB.id)?.hasBody).toBe(false)
    const mine = await listMyTaskBuckets(db, S(w.lead), TODAY) // lead is assigned to pLeaf
    const leaf = mine.buckets.flatMap((b) => b.tasks).find((t) => t.id === w.tasks.pLeaf.id)
    expect(leaf?.hasBody).toBe(true)
  })
})

describe('/my statusesByProject (FR-1606, M6.1-D12)', () => {
  it('live statuses of exactly the projects of the listed tasks', async () => {
    const mine = await listMyTaskBuckets(db, S(w.lead), TODAY)
    const ids = projectIdsOf(mine)
    expect(ids).toEqual([w.P.id])
    expect(Object.keys(mine.statusesByProject)).toEqual(ids)
    const names = (mine.statusesByProject[w.P.id] ?? []).map((s) => s.id)
    expect(names).toContain(w.statuses.P.todo.id)
    expect(names).toContain(w.statuses.P.pSecret.id)
    const outsider = await listMyTaskBuckets(db, S(w.outsider), TODAY)
    expect(Object.keys(outsider.statusesByProject)).toEqual([w.Q.id])
    expect(JSON.stringify(outsider)).not.toContain(w.statuses.P.pSecret.name)
  })

  it('no tasks → an empty map', async () => {
    const mine = await listMyTaskBuckets(db, S(w.manager), TODAY)
    expect(mine.buckets.flatMap((b) => b.tasks)).toEqual([])
    expect(mine.statusesByProject).toEqual({})
  })
})

describe('delete / restore carry bodies (FR-689, AC-626, M6.1-D13)', () => {
  it('deleting a parent soft-deletes its children’s bodies in the same batch and clears their leases; undo restores', async () => {
    const childBody = await makeTaskBody({ task: w.tasks.pChildA, content: 'เนื้อหาลูก A', createdBy: w.manager })
    await db.transaction((tx) => acquireLease(tx, S(w.lead), childBody.id, { takeover: false }))
    asUser(w.member)
    const del = await deleteTaskTree({ taskIds: [w.tasks.pParent.id] })
    if (!del.ok) throw new Error(del.code)
    const deleted = await pageRow(childBody.id)
    expect(deleted.deletedBatch).toBe(del.batch)
    expect(deleted.deletedAt).not.toBeNull()
    expect(await db.select().from(pageLocks).where(eq(pageLocks.pageId, childBody.id))).toEqual([])
    // Unrelated bodies are untouched.
    expect((await pageRow(w.taskBodies.pLeafBody.id)).deletedAt).toBeNull()

    const res = await restoreTaskBatch({ batch: del.batch })
    expect(res).toMatchObject({ ok: true })
    const back = await pageRow(childBody.id)
    expect(back).toMatchObject({ deletedAt: null, deletedBatch: null, contentText: 'เนื้อหาลูก A', version: 1 })
    expect(back.content).toEqual(deleted.content)
  })

  it('a body deleted earlier under another batch keeps that batch and is not restored by the task undo', async () => {
    const other = crypto.randomUUID()
    const childBody = await makeTaskBody({
      task: w.tasks.pChildA,
      content: 'เก่า',
      deleted: { batch: other, daysAgo: 1 },
      createdBy: w.manager,
    })
    asUser(w.member)
    const del = await deleteTaskTree({ taskIds: [w.tasks.pParent.id] })
    if (!del.ok) throw new Error(del.code)
    expect((await pageRow(childBody.id)).deletedBatch).toBe(other)
    expect(await restoreTaskBatch({ batch: del.batch })).toMatchObject({ ok: true })
    expect((await pageRow(childBody.id)).deletedBatch).toBe(other)
  })
})

describe('permanent project delete (FR-689)', () => {
  it('removes the bodies of P and unlinks their files after commit', async () => {
    const unlink = vi.spyOn(services.projects, 'unlinkFilesBestEffort')
    const key = w.taskBodies.pLeafBodyImage.storageKey
    asUser(w.manager)
    expect(await deleteProjectPermanently({ projectId: w.P.id, confirmName: w.P.name })).toEqual({ ok: true })
    expect(await db.select().from(pages).where(eq(pages.id, w.taskBodies.pLeafBody.id))).toEqual([])
    expect(await db.select().from(files).where(eq(files.id, w.taskBodies.pLeafBodyImage.id))).toEqual([])
    expect(unlink).toHaveBeenCalledTimes(1)
    expect(unlink.mock.calls[0]![0]).toContain(key)
    // Other projects' bodies stay.
    expect((await pageRow(w.taskBodies.qTaskBody.id)).deletedAt).toBeNull()
  })
})
