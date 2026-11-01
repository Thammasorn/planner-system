// M6.1 S1.12 — the Cmd/Ctrl+K tasks group (SPEC §4.6.4 FR-690, §6.4, AC-624, M6.1-D14, X68): name hits (open before
// completed), then body hits for q ≥ 3 characters, visibility in SQL, ≤ 8, href /t/<id>, titleOnly → no tasks.
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as searchRoute } from '@/app/api/search/route'
import type { SearchResponse } from '@/lib/contracts/search'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { makeTask, makeTaskBody } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { pages, tasks } from '../db/schema'
import { SEARCH_LIMIT, searchTasks } from './search'

const S = toSessionUser
let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['taskBodies'] })
})

/** The route always sends `tasks` (SearchResponse marks it optional only until S3's fixtures catch up). */
async function search(q: string, titleOnly = false): Promise<Required<SearchResponse>> {
  const res = await okJson<SearchResponse>(
    await callRoute(searchRoute, `/api/search?q=${encodeURIComponent(q)}${titleOnly ? '&titleOnly=1' : ''}`),
  )
  if (res.tasks === undefined) throw new Error('GET /api/search must always send tasks')
  return { pages: res.pages, tasks: res.tasks }
}

describe('searchTasks (FR-690)', () => {
  it('name hit: the full TaskSearchHit shape, href /t/<id>', async () => {
    asUser(w.member)
    const res = await search('งานเดี่ยว')
    expect(res.tasks).toEqual([
      {
        kind: 'task',
        id: w.tasks.pLeaf.id,
        name: w.tasks.pLeaf.name,
        projectId: w.P.id,
        projectName: w.P.name,
        projectArchived: false,
        status: {
          id: w.statuses.P.todo.id,
          name: w.statuses.P.todo.name,
          color: w.statuses.P.todo.color,
          category: 'TODO',
        },
        completed: false,
        href: `/t/${w.tasks.pLeaf.id}`,
        matchedIn: 'name',
      },
    ])
  })

  it('body hits after name hits (q ≥ 3); a 2-character query matches names only; titleOnly → []', async () => {
    asUser(w.lead)
    const body = await search('P-ลับ11')
    expect(body.tasks.map((t) => [t.id, t.matchedIn])).toEqual([[w.tasks.pLeaf.id, 'content']])
    const mixed = await search('รายละเอียด')
    // lead sees P and archived A (not Q): both bodies, no name contains the word.
    expect(mixed.tasks.map((t) => [t.id, t.matchedIn])).toHaveLength(2)
    expect(mixed.tasks.map((t) => [t.id, t.matchedIn])).toEqual(
      expect.arrayContaining([
        [w.tasks.pLeaf.id, 'content'],
        [w.tasks.aTask.id, 'content'],
      ]),
    )
    const named = await makeTask({ project: w.P, name: 'รายละเอียดสเปก', createdBy: w.manager })
    const order = await search('รายละเอียด')
    expect(order.tasks[0]).toMatchObject({ id: named.id, matchedIn: 'name' })
    expect(order.tasks.slice(1).every((t) => t.matchedIn === 'content')).toBe(true)
    expect((await search('11')).tasks).toEqual([])
    expect((await search('P-ลับ11', true)).tasks).toEqual([])
  })

  it('open before completed; archived projects are found with projectArchived', async () => {
    const done = await makeTask({
      project: w.P,
      name: 'เรียงลำดับ',
      completedOn: '2026-09-28',
      createdBy: w.manager,
    })
    const open = await makeTask({ project: w.P, name: 'เรียงลำดับงานที่ยังเปิดอยู่', createdBy: w.manager })
    asUser(w.member)
    const res = await search('เรียงลำดับ')
    expect(res.tasks.map((t) => [t.id, t.completed])).toEqual([
      [open.id, false],
      [done.id, true],
    ])
    const arch = await search('A-ลับ09')
    expect(arch.tasks).toEqual([expect.objectContaining({ id: w.tasks.aTask.id, projectArchived: true })])
  })

  it('outsider: no P names, ids or body text; own project found', async () => {
    asUser(w.outsider)
    const res = await search('P-ลับ')
    expect(res.tasks).toEqual([])
    const body = await search('รายละเอียด')
    expect(body.tasks.map((t) => t.id)).toEqual([w.tasks.qTask.id])
    const json = JSON.stringify(body)
    expect(json).not.toContain('P-ลับ')
    expect(json).not.toContain(w.tasks.pLeaf.id)
    expect(json).not.toContain(w.P.id)
  })

  it('deleted tasks, deleted bodies and deleted projects are never hits; at most 8', async () => {
    await db.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, w.taskBodies.pLeafBody.id))
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, w.tasks.aTask.id))
    asUser(w.manager)
    expect((await search('P-ลับ11')).tasks).toEqual([])
    expect((await search('A-ลับ09')).tasks).toEqual([])
    for (let i = 0; i < 10; i += 1) await makeTask({ project: w.P, name: `งานซ้ำ ${i}`, createdBy: w.manager })
    expect((await search('งานซ้ำ')).tasks).toHaveLength(SEARCH_LIMIT)
  })

  it('a statement timeout in the body query keeps the name hits (57014 in the savepoint)', async () => {
    await makeTaskBody({ task: w.tasks.pChildB, content: 'คำค้นพิเศษ', createdBy: w.manager })
    const named = await makeTask({ project: w.P, name: 'คำค้นพิเศษ ในชื่อ', createdBy: w.manager })
    const hits = await db.transaction(async (tx) => {
      const timeout = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
      vi.spyOn(tx, 'transaction').mockRejectedValueOnce(timeout)
      return searchTasks(tx, S(w.manager), 'คำค้นพิเศษ')
    })
    expect(hits.map((h) => [h.id, h.matchedIn])).toEqual([[named.id, 'name']])
  })
})
