// plan/m09 §5.S1.3 — workload hover breakdown lines (FR-1002, §3.3 masking, M9-D8, M9-D25).
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import type { WorkloadCell } from '@/lib/contracts/workload'
import { tooltipLines } from './tooltip'

const PROJECTS = {
  dw: { name: 'Data Warehouse', color: '#123456' },
  hidden: { name: 'Secret Project', color: '#654321' },
}

const peter: WorkloadCell = {
  total: 500,
  committed: 500,
  capacity: 300,
  standard: 500,
  level: 'OVER',
  excess: 200,
  cause: 'CAPACITY',
  byProject: [{ projectId: 'dw', total: 500, committed: 500 }],
}

const days = (v: string) => th.workload.tooltip.days(v)

describe('tooltipLines', () => {
  it('F3 Peter 10-05 (r8 §4.6)', () => {
    const lines = tooltipLines({ name: 'Peter', week: '2026-10-05', cell: peter, projects: PROJECTS, deactivated: false })
    expect(lines).toEqual([
      { kind: 'header', text: th.workload.tooltip.header('Peter', '5/10') },
      { kind: 'value', text: `${th.workload.tooltip.total} ${days('5.00')}` },
      { kind: 'value', text: `${th.workload.tooltip.committed} ${days('5.00')}` },
      { kind: 'value', text: `${th.workload.tooltip.atRisk} ${days('0.00')}` },
      { kind: 'capacity', text: th.workload.tooltip.capacity('3.00', '5.00') },
      {
        kind: 'status',
        text: `${th.overload.glyph.OVER} ${th.overload.level.OVER} ${th.overload.excess('2.00')} (${th.overload.cause.CAPACITY})`,
      },
      { kind: 'part', text: `Data Warehouse ${days('5.00')}` },
    ])
  })

  it('a null part renders th.masking.otherProjects, masked, without any project name', () => {
    const cell: WorkloadCell = {
      ...peter,
      byProject: [
        { projectId: 'dw', total: 300, committed: 300 },
        { projectId: null, total: 200, committed: 200 },
      ],
    }
    const lines = tooltipLines({ name: 'Peter', week: '2026-10-05', cell, projects: { dw: PROJECTS.dw }, deactivated: false })
    const parts = lines.filter((l) => l.kind === 'part')
    expect(parts).toEqual([
      { kind: 'part', text: `Data Warehouse ${days('3.00')}` },
      { kind: 'part', text: `${th.masking.otherProjects} ${days('2.00')}`, masked: true },
    ])
    expect(JSON.stringify(lines)).not.toContain('Secret Project')
  })

  it('a part whose project is not in the dictionary is treated as masked (never leaks an id)', () => {
    const cell: WorkloadCell = { ...peter, byProject: [{ projectId: 'unknown-id', total: 500, committed: 500 }] }
    const lines = tooltipLines({ name: 'P', week: '2026-10-05', cell, projects: {}, deactivated: false })
    expect(lines.at(-1)).toEqual({ kind: 'part', text: `${th.masking.otherProjects} ${days('5.00')}`, masked: true })
    expect(JSON.stringify(lines)).not.toContain('unknown-id')
  })

  it('deactivated: the cause text becomes th.overload.cause.DEACTIVATED (M9-D7)', () => {
    const lines = tooltipLines({ name: 'Peter', week: '2026-10-05', cell: peter, projects: PROJECTS, deactivated: true })
    const status = lines.find((l) => l.kind === 'status')
    expect(status?.text).toContain(th.overload.cause.DEACTIVATED)
    expect(status?.text).not.toContain(th.overload.cause.CAPACITY)
  })

  it('OK cell: no status line; RISK uses the ⚠ glyph', () => {
    const okCell: WorkloadCell = { ...peter, total: 200, committed: 200, level: 'OK', excess: 0, cause: null }
    expect(tooltipLines({ name: 'A', week: '2026-10-05', cell: okCell, projects: PROJECTS, deactivated: false }).some((l) => l.kind === 'status')).toBe(false)
    const riskCell: WorkloadCell = { ...peter, total: 250, committed: 0, capacity: 200, level: 'RISK', excess: 50 }
    const status = tooltipLines({ name: 'Cindy', week: '2026-10-12', cell: riskCell, projects: PROJECTS, deactivated: false }).find(
      (l) => l.kind === 'status',
    )
    expect(status?.text).toBe(
      `${th.overload.glyph.RISK} ${th.overload.level.RISK} ${th.overload.excess('0.50')} (${th.overload.cause.CAPACITY})`,
    )
  })

  it('capacity 0 → th.workload.tooltip.noCapacity; empty cell has no parts', () => {
    const cell: WorkloadCell = { total: 0, committed: 0, capacity: 0, standard: 500, level: 'OK', excess: 0, cause: null, byProject: [] }
    const lines = tooltipLines({ name: 'A', week: '2026-10-05', cell, projects: {}, deactivated: false })
    expect(lines.find((l) => l.kind === 'capacity')).toEqual({ kind: 'capacity', text: th.workload.tooltip.noCapacity })
    expect(lines.some((l) => l.kind === 'part')).toBe(false)
  })
})
