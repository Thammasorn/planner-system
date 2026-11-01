// plan/m07 S3.9 — BR-23 "↕ รวมเป็นรายสัปดาห์" targets → WEEK writes (M7-D2).
import { describe, expect, it } from 'vitest'
import { collapseChanges } from './collapse'
import { gridResponse } from './fixtures.test.data'
import { mergeChunks } from './merge'

const model = mergeChunks([
  gridResponse({
    from: '2026-09-28',
    tasks: [
      {
        id: 't',
        name: 'UAT',
        assignees: [
          {
            taId: 'a-ivy',
            userId: 'ivy',
            cells: {
              '2026-09-28': { days: { '2026-09-28': 50, '2026-09-29': 50, '2026-09-30': 100, '2026-10-01': 50, '2026-10-02': 50 } },
              '2026-10-05': 250,
            },
          },
        ],
      },
    ],
    people: { ivy: { name: 'Ivy' } },
  }),
])!

describe('collapseChanges', () => {
  it('DAY 300 target → WEEK 300', () => {
    expect(collapseChanges([{ taskAssignmentId: 'a-ivy', week: '2026-09-28' }], model)).toEqual([
      { taskAssignmentId: 'a-ivy', granularity: 'WEEK', period: '2026-09-28', cd: 300 },
    ])
  })
  it('WEEK / empty / unknown targets → no change; duplicates once', () => {
    expect(
      collapseChanges(
        [
          { taskAssignmentId: 'a-ivy', week: '2026-10-05' },
          { taskAssignmentId: 'a-ivy', week: '2026-10-12' },
          { taskAssignmentId: 'nope', week: '2026-09-28' },
        ],
        model,
      ),
    ).toEqual([])
    expect(
      collapseChanges(
        [
          { taskAssignmentId: 'a-ivy', week: '2026-09-28' },
          { taskAssignmentId: 'a-ivy', week: '2026-09-28' },
        ],
        model,
      ),
    ).toHaveLength(1)
  })
})
