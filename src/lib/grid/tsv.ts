// src/lib/grid/tsv.ts — Excel-compatible TSV (SPEC §4.8 Cmd+C/V, M6-D28). Pure.
import { formatCd } from '@/domain/units'
import type { CellUnit } from '@/domain/types'
import type { TargetCell } from './apply'

/** \r?\n rows, one trailing newline dropped, \t cells, "…" quotes with "" escapes (quoted cells may hold tabs and
 *  newlines, as Excel writes them). '' → []. */
export function parseTsv(text: string): string[][] {
  let s = text
  if (s.endsWith('\r\n')) s = s.slice(0, -2)
  else if (s.endsWith('\n')) s = s.slice(0, -1)
  if (s === '') return []
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let i = 0
  let atStart = true
  while (i < s.length) {
    const ch = s[i]!
    if (atStart && ch === '"') {
      // quoted field
      i++
      while (i < s.length) {
        if (s[i] === '"') {
          if (s[i + 1] === '"') {
            field += '"'
            i += 2
            continue
          }
          i++
          break
        }
        field += s[i]
        i++
      }
      atStart = false
      continue
    }
    if (ch === '\t') {
      row.push(field)
      field = ''
      atStart = true
      i++
    } else if (ch === '\r' || ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      atStart = true
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1
    } else {
      field += ch
      atStart = false
      i++
    }
  }
  row.push(field)
  rows.push(row)
  return rows
}

/** \r\n between rows, no trailing newline. */
export function serializeTsv(values: readonly (readonly string[])[]): string {
  return values.map((r) => r.join('\t')).join('\r\n')
}

/** Exact 2-decimal values in the current unit ('' for empty): days "3.75", fraction "0.75" (cap 0 → days). */
export function copyValues(targets: readonly (readonly TargetCell[])[], unit: CellUnit): string[][] {
  return targets.map((row) =>
    row.map((t) => {
      const cd = t.cell?.cd ?? 0
      if (cd === 0) return ''
      return unit === 'FRACTION' && t.capCd > 0
        ? formatCd(cd, { unit: 'FRACTION', baseCd: t.capCd, decimals: 2 })
        : formatCd(cd, { unit: 'DAYS', decimals: 2 })
    }),
  )
}
