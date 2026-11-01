// M7 S2.8 — contract test: server vs client derived day values (r6b M7-09, M7-D19, M7-D25). One case per row of
// r8 §4.7: the route's D: cells equal the client computation from the same response (src/lib/grid/day.ts), and the
// client's optimistic BR-22 planWeek equals what services.allocations.save writes (rolled back with a sentinel).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getGrid } from '@/app/api/grid/project/[projectId]/route'
import { planWeek } from '@/domain/allocation'
import { addDays } from '@/domain/dates'
import type { ISODate, PeriodKey } from '@/domain/types'
import type { AssigneeCell, GridAssigneeRow, GridResponse } from '@/lib/contracts/grid'
import { dayCellsFromPlan, dayCtxFor, weekPlanFromCell } from '@/lib/grid/day'
import { applyFixture, seedGolden } from '../../../scripts/lib/fixtures'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { goldenProjectId, goldenUser, type GoldenProject, type GoldenViewer } from '../../../tests/authz/_support/golden'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { db } from '../db/client'
import * as repo from '../repo'
import { save } from './allocations'

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

type Fixture = 'F1' | 'F2' | 'F3' | 'F4'
const CASES: [Fixture, GoldenProject, ISODate, GoldenViewer, number[]][] = [
  ['F1', 'POS Upgrade', '2026-09-28', 'Ivy', [50, 50, 50, 50, 50]],
  ['F1', 'Data Warehouse', '2026-10-12', 'Peter', [75, 75, 75, 75, 75]],
  ['F2', 'Mobile App Revamp', '2026-10-19', 'Jack', [125, 125, 125, 125, 0]],
  ['F2', 'Mobile App Revamp', '2026-10-19', 'Mint', [125, 125, 125, 125, 0]],
  ['F2', 'Data Warehouse', '2026-10-19', 'Peter', [63, 63, 62, 62, 0]],
  ['F2', 'CRM Migration', '2026-10-19', 'Cindy', [94, 94, 94, 93, 0]],
  ['F2', 'CRM Migration', '2026-10-19', 'Ivy', [63, 63, 62, 62, 0]],
  ['F3', 'Data Warehouse', '2026-10-05', 'Peter', [0, 0, 167, 167, 166]],
  ['F4', 'CRM Migration', '2026-10-12', 'Cindy', [0, 0, 0, 125, 125]],
]

class Rollback extends Error {}

const dCells = (cells: GridAssigneeRow['cells'], w: ISODate): Record<PeriodKey, AssigneeCell> =>
  Object.fromEntries(
    Object.entries(cells).filter(([k]) => k.startsWith('D:') && k.slice(2) >= w && k.slice(2) < addDays(w, 7)),
  ) as Record<PeriodKey, AssigneeCell>

describe('grid day parity (r8 §4.7)', () => {
  it.each(CASES)('%s %s %s — %s', async (fixture, project, w, nick, expected) => {
    await seedGolden(db)
    if (fixture !== 'F1') await applyFixture(db, fixture)
    const manager = await goldenUser('Manager')
    asUser(manager)
    const id = await goldenProjectId(project)
    const body = await okJson<GridResponse>(
      await callRoute(getGrid, `/api/grid/project/${id}?from=${w}&to=${addDays(w, 7)}&expand=${w}`, { projectId: id }),
    )
    // 1–2: every assignee row's D: cells = the client computation from the same response
    const rows = body.rows.filter((r): r is GridAssigneeRow => r.kind === 'assignee')
    for (const row of rows) {
      const client = dayCellsFromPlan(weekPlanFromCell(row.cells[`W:${w}`], w), dayCtxFor(body.people[row.userId], w))
      expect(dCells(row.cells, w)).toEqual(client)
    }
    const user = (await goldenUser(nick)).id
    const row = rows.find((r) => r.userId === user && r.cells[`W:${w}`])!
    expect([0, 1, 2, 3, 4].map((i) => row.cells[`D:${addDays(w, i)}`]?.cd ?? 0)).toEqual(expected)

    // 3: optimistic BR-22 (Mon = 100) on the client = what save writes
    const ctx = dayCtxFor(body.people[user], w)
    const client = planWeek(weekPlanFromCell(row.cells[`W:${w}`], w), [{ granularity: 'DAY', dayIndex: 0, cd: 100 }], ctx)
    expect(client.kind).toBe('ok')
    let written: unknown = null
    await expect(
      db.transaction(async (tx) => {
        await save(
          tx,
          toSessionUser(manager),
          {
            items: [
              { taskAssignmentId: row.taskAssignmentId, baseVersion: row.version, changes: [{ granularity: 'DAY', period: w, cd: 100 }] },
            ],
            clientOpId: 'parity',
          },
          '2026-09-30',
        )
        written = repo.allocations
          .plansFromRows(await repo.allocations.listForWeeks(tx, [row.taskAssignmentId], [w]))
          .get(row.taskAssignmentId)
          ?.get(w)
        throw new Rollback()
      }),
    ).rejects.toBeInstanceOf(Rollback)
    expect(client.kind === 'ok' ? client.next : null).toEqual(written)
  })
})
