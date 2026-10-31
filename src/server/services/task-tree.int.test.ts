// M3 S2.2 — tree placement core: sibling keys under the advisory lock, re-key on equal neighbours, transfers (X48, X20).
import { and, asc, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { makeAssignment, makeStatuses, makeTask, makeUser } from '../../../tests/helpers/factories'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { taskAssignments, tasks } from '../db/schema'
import { insertTask } from '../repo/tasks'
import { applyTransfer, keyAt, lockSiblingScope } from './task-tree'

async function rootOrder(projectId: string): Promise<string[]> {
  const rows = await db
    .select({ name: tasks.name })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.position), asc(tasks.id))
  return rows.map((r) => r.name)
}

describe('keyAt', () => {
  it('equal neighbour keys re-key the scope; the new key sorts between them', async () => {
    const w = await createWorld()
    const st = await makeStatuses({ project: w.P })
    const base = { projectId: w.P.id, createdBy: w.manager.id, statusId: st.todo.id, position: 'a0' }
    const s1 = await insertTask(db, { ...base, name: 'S1' })
    const s2 = await insertTask(db, { ...base, name: 'S2' })
    const [first, second] = [s1, s2].sort((a, b) => (a.id < b.id ? -1 : 1))
    const key = await db.transaction(async (tx) => {
      await lockSiblingScope(tx, w.P.id, null)
      return keyAt(tx, { projectId: w.P.id, parentId: null, afterId: first!.id })
    })
    const rows = await db.select().from(tasks).where(eq(tasks.projectId, w.P.id))
    const pos = new Map(rows.map((r) => [r.id, r.position]))
    expect(pos.get(first!.id)! < key).toBe(true)
    expect(key < pos.get(second!.id)!).toBe(true)
  })

  it('undefined → append, null → first, stale id → CONFLICT treeChanged', async () => {
    const w = await createWorld()
    await makeStatuses({ project: w.P })
    const a = await makeTask({ project: w.P, name: 'A', createdBy: w.manager })
    const b = await makeTask({ project: w.P, name: 'B', createdBy: w.manager })
    const child = await makeTask({ project: w.P, parent: a, name: 'C', createdBy: w.manager })
    await db.transaction(async (tx) => {
      const end = await keyAt(tx, { projectId: w.P.id, parentId: null, afterId: undefined })
      expect(end > b.position).toBe(true)
      const start = await keyAt(tx, { projectId: w.P.id, parentId: null, afterId: null })
      expect(start < a.position).toBe(true)
    })
    await expect(
      db.transaction((tx) => keyAt(tx, { projectId: w.P.id, parentId: null, afterId: child.id })),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: th.tasks.errors.treeChanged })
    expect(await rootOrder(w.P.id)).toEqual(['A', 'B'])
  })
})

describe('applyTransfer', () => {
  it('success bumps version by 1; count mismatch → CONFLICT; same-user collision → CONFLICT sameAssignee', async () => {
    const w = await createWorld()
    await makeStatuses({ project: w.P })
    const ivy = await makeUser({ nickname: 'Ivy' })
    const from = await makeTask({ project: w.P, name: 'From', createdBy: w.manager })
    const to = await makeTask({ project: w.P, name: 'To', createdBy: w.manager })
    const a = await makeAssignment({ task: from, user: ivy })
    await expect(
      db.transaction((tx) =>
        applyTransfer(tx, w.P.id, { assignmentIds: [a.id, to.id], fromTaskId: from.id, toTaskId: to.id }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: th.tasks.errors.treeChanged })
    await makeAssignment({ task: to, user: ivy })
    await expect(
      db.transaction((tx) => applyTransfer(tx, w.P.id, { assignmentIds: [a.id], fromTaskId: from.id, toTaskId: to.id })),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: th.tasks.errors.sameAssignee('Ivy') })
    const other = await makeTask({ project: w.P, name: 'Other', createdBy: w.manager })
    await db.transaction((tx) =>
      applyTransfer(tx, w.P.id, { assignmentIds: [a.id], fromTaskId: from.id, toTaskId: other.id }),
    )
    const [row] = await db.select().from(taskAssignments).where(eq(taskAssignments.id, a.id))
    expect(row).toMatchObject({ taskId: other.id, version: 2 })
  })

  it('a target with live children → CONFLICT treeChanged', async () => {
    const w = await createWorld()
    await makeStatuses({ project: w.P })
    const from = await makeTask({ project: w.P, name: 'From', createdBy: w.manager })
    const to = await makeTask({ project: w.P, name: 'To', createdBy: w.manager })
    await makeTask({ project: w.P, parent: to, name: 'ToChild', createdBy: w.manager })
    const a = await makeAssignment({ task: from, user: w.member })
    await expect(
      db.transaction((tx) => applyTransfer(tx, w.P.id, { assignmentIds: [a.id], fromTaskId: from.id, toTaskId: to.id })),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
