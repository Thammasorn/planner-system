// src/lib/workload/tooltip.ts — hover breakdown of one workload cell (FR-1002, §3.3 masking, M9-D8, M9-D25).
// Never names a leave type or holiday; a hidden-projects part renders only th.masking.otherProjects.
import type { ISODate } from '@/domain/types'
import type { WorkloadCell, WorkloadResponse } from '@/lib/contracts/workload'
import { formatWeekHeader } from '@/lib/format'
import { th } from '@/i18n/th'
import { loadPct } from '@/lib/load/display'
import { causeText, twoDecimals } from './format'

export interface TooltipLine {
  kind: 'header' | 'value' | 'capacity' | 'status' | 'part'
  text: string
  masked?: boolean
}

const days = (cd: number): string => th.workload.tooltip.days(twoDecimals(cd))

export function tooltipLines(o: {
  name: string
  week: ISODate
  cell: WorkloadCell
  projects: WorkloadResponse['projects']
  deactivated: boolean
}): TooltipLine[] {
  const { cell } = o
  const t = th.workload.tooltip
  const lines: TooltipLine[] = [
    { kind: 'header', text: t.header(o.name, formatWeekHeader(o.week)) },
    { kind: 'value', text: `${t.total} ${days(cell.total)}` },
    { kind: 'value', text: `${t.committed} ${days(cell.committed)}` },
    { kind: 'value', text: `${t.atRisk} ${days(cell.total - cell.committed)}` },
    {
      kind: 'capacity',
      text: cell.capacity === 0 ? t.noCapacity : t.capacity(twoDecimals(cell.capacity), twoDecimals(cell.standard)),
    },
  ]
  // M11.1 (FR-1002): the tooltip keeps both — days above, the share of capacity here (total load, view ALL)
  const pct = cell.total === 0 ? null : loadPct(cell.total, cell.capacity)
  if (pct !== null) lines.push({ kind: 'value', text: th.loadDisplay.used(pct) })
  if (cell.level !== 'OK') {
    const level = cell.level
    lines.push({
      kind: 'status',
      text: `${th.overload.glyph[level]} ${th.overload.level[level]} ${th.overload.excess(twoDecimals(cell.excess))} (${causeText(cell.cause, o.deactivated)})`,
    })
  }
  for (const part of cell.byProject) {
    const project = part.projectId === null ? undefined : o.projects[part.projectId]
    lines.push(
      project === undefined
        ? { kind: 'part', text: `${th.masking.otherProjects} ${days(part.total)}`, masked: true }
        : { kind: 'part', text: `${project.name} ${days(part.total)}` },
    )
  }
  return lines
}
