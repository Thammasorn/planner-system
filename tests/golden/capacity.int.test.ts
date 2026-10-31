// tests/golden/capacity.int.test.ts — golden capacity F1–F4 (SPEC §11.3, BR-10…13, r8 §4.4, X11; plan/m05 S4.4).
// Each case: golden seed (F1) + one fixture's own setup (not cumulative), then services/capacity.ts#loadCapacity for
// all six golden users over [2026-08-31, 2027-01-04) — an exclusive end that includes the week of 2026-12-28 (PLAN
// §4.6). Every golden user works Mon–Fri 100 cd, so the standard is 500 per week everywhere (BR-41 ignores leave
// and holidays, X64). The overload numbers of F2–F4 are M9's; here only their `capacityCd` is cross-checked.
import { readFileSync } from 'node:fs'
import { count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { daysOfWeek, weekRange } from '@/domain/dates'
import type { Cd, ISODate } from '@/domain/types'
import type { UserCapacity } from '@/lib/contracts/capacity'
import { db } from '@/server/db/client'
import { holidays, timeOff, user } from '@/server/db/schema'
import { loadCapacity } from '@/server/services/capacity'
import { applyFixture, GOLDEN_PATH, seedGolden, type FixtureId } from '../../scripts/lib/fixtures'

const FROM = '2026-08-31'
const TO = '2027-01-04'
const WEEKS = weekRange(FROM, TO)

interface GoldenJson {
  weekStarts: ISODate[]
  users: { nickname: string }[]
  expected: Record<FixtureId, { overloads: { user: string; week: ISODate; capacityCd: Cd }[] }>
}
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenJson
const NICKNAMES = golden.users.map((u) => u.nickname)

/** Exceptions to "500 per week, Mon–Fri 100 / Sat–Sun 0" — per user and week: the 7 day capacities Mon…Sun. */
type Exceptions = Record<string, Record<ISODate, readonly Cd[]>>

const STANDARD_DAYS: readonly Cd[] = [100, 100, 100, 100, 100, 0, 0]

async function capacityFor(
  fixture: FixtureId | null,
): Promise<{ ids: Map<string, string>; cap: Map<string, UserCapacity> }> {
  await seedGolden(db)
  if (fixture) await applyFixture(db, fixture)
  const rows = await db.select({ id: user.id, nickname: user.nickname }).from(user)
  const ids = new Map(rows.map((r) => [r.nickname ?? '', r.id]))
  for (const n of NICKNAMES) expect(ids.get(n), `golden user ${n}`).toBeDefined()
  const cap = await loadCapacity(
    db,
    NICKNAMES.map((n) => ids.get(n)!),
    { from: FROM, to: TO },
  )
  return { ids, cap }
}

function expectCapacity(
  ids: Map<string, string>,
  cap: Map<string, UserCapacity>,
  exceptions: Exceptions,
): void {
  for (const nick of NICKNAMES) {
    const u = cap.get(ids.get(nick)!)
    expect(u, nick).toBeDefined()
    expect(Object.keys(u!.weeks).sort(), `${nick} weeks`).toEqual(WEEKS)
    expect(Object.keys(u!.days), `${nick} days`).toHaveLength(WEEKS.length * 7)
    for (const ws of WEEKS) {
      const days = exceptions[nick]?.[ws] ?? STANDARD_DAYS
      const weekCd = days.reduce((a, b) => a + b, 0)
      expect(u!.weeks[ws], `${nick} week ${ws}`).toEqual({ capacityCd: weekCd, standardCd: 500 })
      daysOfWeek(ws).forEach((d, i) => {
        expect(u!.days[d], `${nick} ${d}`).toEqual({ capacityCd: days[i], standardCd: STANDARD_DAYS[i] })
      })
    }
  }
}

/** The fixture's expected overloads carry the week capacity M9 will use — it must equal the loader's number. */
function expectOverloadCapacities(
  id: FixtureId,
  ids: Map<string, string>,
  cap: Map<string, UserCapacity>,
): void {
  const overloads = golden.expected[id].overloads
  expect(overloads.length).toBeGreaterThan(0)
  for (const o of overloads) {
    expect(cap.get(ids.get(o.user)!)!.weeks[o.week]?.capacityCd, `${id} ${o.user} ${o.week}`).toBe(
      o.capacityCd,
    )
  }
}

const n = async (t: typeof holidays | typeof timeOff) =>
  Number((await db.select({ n: count() }).from(t))[0]?.n ?? 0)

describe('golden capacity (SPEC §11.3, r8 §4.4)', () => {
  it('the range covers exactly the golden weeks 2026-08-31 … 2026-12-28', () => {
    expect(WEEKS).toEqual(golden.weekStarts)
    expect(WEEKS.at(-1)).toBe('2026-12-28')
  })

  it('F1: every user × week = 500 / 500 (no holidays, no leave)', async () => {
    const { ids, cap } = await capacityFor(null)
    expect(await n(holidays)).toBe(0)
    expect(await n(timeOff)).toBe(0)
    expectCapacity(ids, cap, {})
  })

  it('F2: the holiday 2026-10-23 (Fri) → all six users 400 in week 2026-10-19; every other week 500', async () => {
    const { ids, cap } = await capacityFor('F2')
    expect(await n(holidays)).toBe(1)
    expect(await n(timeOff)).toBe(0)
    const holidayWeek = [100, 100, 100, 100, 0, 0, 0] as const
    expectCapacity(
      ids,
      cap,
      Object.fromEntries(NICKNAMES.map((nick) => [nick, { '2026-10-19': holidayWeek }])),
    )
    expectOverloadCapacities('F2', ids, cap)
  })

  it('F3: Peter on leave 10-05…10-06 → 300 in week 2026-10-05; nobody else changes; no holiday (not cumulative)', async () => {
    const { ids, cap } = await capacityFor('F3')
    expect(await n(holidays), 'F3 must not include F2’s holiday').toBe(0)
    expect(await n(timeOff)).toBe(1)
    const [entry] = await db
      .select()
      .from(timeOff)
      .where(eq(timeOff.userId, ids.get('Peter')!))
    expect(entry).toMatchObject({
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      half: null,
      deletedAt: null,
    })
    expectCapacity(ids, cap, { Peter: { '2026-10-05': [0, 0, 100, 100, 100, 0, 0] } })
    expectOverloadCapacities('F3', ids, cap)
  })

  it('F4: Cindy on leave 10-12…10-14 → 200 in week 2026-10-12; standard stays 500 everywhere', async () => {
    const { ids, cap } = await capacityFor('F4')
    expect(await n(holidays)).toBe(0)
    expect(await n(timeOff)).toBe(1)
    expectCapacity(ids, cap, { Cindy: { '2026-10-12': [0, 0, 0, 100, 100, 0, 0] } })
    expectOverloadCapacities('F4', ids, cap)
  })
})
