// src/lib/editor/tsv.ts — spreadsheet text/plain (Excel, Google Sheets, Numbers) → grid → HTML table (FR-524,
// AC-502, r3 §7.4). Copied from plan/research/snippets/r3/harness/src/lib/tsv.ts. Pure (no DOM, no BlockNote).

/**
 * Parse tab-separated text. Handles CRLF, a trailing newline and Excel's quoting (`"a\nb"`, `"say ""hi"""`).
 * Returns null unless the text is a rectangular grid of ≥ 2 rows × ≥ 2 columns.
 */
export function parseTsvGrid(text: string): string[][] | null {
  if (!text.includes('\t')) return null
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  let inQuotes = false
  let cellStart = true
  const s = text.replace(/\r\n?/g, '\n')
  while (i < s.length) {
    const ch = s.charAt(i)
    if (inQuotes) {
      if (ch === '"') {
        if (s.charAt(i + 1) === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"' && cellStart) {
      inQuotes = true
      cellStart = false
      i++
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
      cellStart = true
      i++
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      cellStart = true
      i++
      continue
    }
    cell += ch
    cellStart = false
    i++
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // Drop trailing all-empty rows (Excel appends a newline).
  while (rows.length > 0 && (rows[rows.length - 1] ?? []).every((c) => c === '')) rows.pop()
  if (rows.length < 2) return null
  const width = rows[0]?.length ?? 0
  if (width < 2) return null
  if (!rows.every((r) => r.length === width)) return null
  return rows
}

/** Minimal HTML table for `editor.pasteHTML()`: lets prosemirror-tables paste INTO an existing table's cells when
 *  the cursor is inside a table (instead of inserting a new block). */
export function gridToHtmlTable(grid: readonly (readonly string[])[]): string {
  const esc = (x: string): string =>
    x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  return `<table><tbody>${grid
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`
}
