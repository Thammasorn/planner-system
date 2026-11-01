// tests/authz/rows/_m7.ts — shared helpers for the M7 rows files (grid-day.ts, allocations-day.ts) and the masking
// block `grid day (M7)` (plan/m07 S4.1–S4.2, §7.2). No rows here. Expectations follow SPEC §3.2 (PERM-06 เปิดโปรเจค,
// PERM-12 วางแผน: M/L/Me allow, W 404) and X41/X42 (invisible → 404, archived write → 403, bad input → 400 with parse
// before authz). World createWorld({ with: ['dayAllocations'] }) (plan/m07 S0.9): pWeek = 2026-11-02 WEEK 250 and
// pDay = 2026-11-09 DAY { 11-09: 100, 11-10: 100, 11-11: 50 } on pLeafLead; aDay = 2026-11-09 DAY { 11-09: 50 } on
// aTaskMember (archived A); qDay = 2026-11-10 DAY 75 on qTaskCoworker (Q).
import { expect } from 'vitest'
import type { ISODate } from '@/domain/types'
import type { ActionError, ActionResult } from '@/lib/action-result'
import type { AllocationChange, NeedsChoicePayload, SaveAllocationsInput, SaveAllocationsOk } from '@/lib/contracts/grid'
import { auditCount } from '../../helpers/audit'
import { allocationRows, assignmentVersion } from '../../helpers/factories'
import type { WorldPart } from '../../helpers/world'
import type { Outcome, Role } from '../types'
import { save as saveM6 } from './_m6'

/** PERM-06 / PERM-12 on a visible project. */
export const VIEW = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const satisfies Record<Role, Outcome>
/** X42: plan writes on archived A. */
export const ARCH = { M: '403', L: '403', Me: '403', W: '404' } as const satisfies Record<Role, Outcome>
/** zod / query parse precedes authz (X41). */
export const BAD = { M: '400', L: '400', Me: '400', W: '400' } as const satisfies Record<Role, Outcome>
/** Business validation (MIXED_WEEK_AND_DAY) runs after authz. */
export const VIEW_400 = { M: '400', L: '400', Me: '400', W: '404' } as const satisfies Record<Role, Outcome>
/** NEEDS_CHOICE (BR-24, M7-D3) after authz. */
export const VIEW_409 = { M: '409', L: '409', Me: '409', W: '404' } as const satisfies Record<Role, Outcome>

/** Every M7 row runs on the day world (implies M6's 'allocations' → tasks + timeOff). */
export const DAY_WORLD = ['dayAllocations'] as const satisfies readonly WorldPart[]

/** The 2-week chunk the M7 grid rows read (pWeek + pDay). */
export const DAY_RANGE = 'from=2026-11-02&to=2026-11-16'

export const day = (period: ISODate, cd: number | null): AllocationChange => ({ granularity: 'DAY', period, cd })
export const week = (period: ISODate, cd: number | null): AllocationChange => ({ granularity: 'WEEK', period, cd })

/** saveAllocations with each item's current version as baseVersion (read at call time), "today" pinned. */
export async function saveDay(
  items: { id: string; changes: AllocationChange[] }[],
  onDayWeekConflict?: 'SCALE' | 'COLLAPSE',
  clientOpId = 'authz-m7',
): Promise<ActionResult<SaveAllocationsOk>> {
  const input: SaveAllocationsInput = {
    items: await Promise.all(
      items.map(async (i) => ({
        taskAssignmentId: i.id,
        baseVersion: await assignmentVersion(i.id),
        changes: i.changes,
      })),
    ),
    clientOpId,
    ...(onDayWeekConflict ? { onDayWeekConflict } : {}),
  }
  return saveM6(input)
}

export type DaySnapshot = { rows: Awaited<ReturnType<typeof allocationRows>>; version: number; audit: number }

/** Rows of one (assignment, week), the assignment version and the audit high-water mark. */
export async function daySnapshot(assignmentId: string, w: ISODate): Promise<DaySnapshot> {
  return {
    rows: await allocationRows(assignmentId, w),
    version: await assignmentVersion(assignmentId),
    audit: await auditCount(),
  }
}

/** A refused write left rows, version and audit_log exactly as they were (all-or-nothing, M7-D3). */
export async function expectDayUnchanged(assignmentId: string, w: ISODate, before: DaySnapshot): Promise<void> {
  expect(await daySnapshot(assignmentId, w), `${assignmentId} ${w} must be unchanged (rows, version, audit)`).toEqual(
    before,
  )
}

/** The NEEDS_CHOICE payload of a failed result (M7-D3); fails if the result is anything else. */
export function needsChoiceOf(r: ActionError): NeedsChoicePayload {
  expect(String(r.code)).toBe('NEEDS_CHOICE')
  return { week: r.week as ISODate, weeks: r.weeks as ISODate[], pairs: r.pairs as NeedsChoicePayload['pairs'] }
}

export const isOk = <T extends object>(r: ActionResult<T>): r is { ok: true } & T => r.ok

/** Σ cd of stored rows. */
export const sumCd = (rows: { cd: number }[]): number => rows.reduce((a, r) => a + r.cd, 0)
