// Pure helpers (no DOM, no BlockNote runtime) -> unit-testable with Vitest.

/** Parse tab-separated text as produced by Excel / Google Sheets / Numbers (text/plain).
 *  Handles CRLF, a trailing newline, and Excel's quoting ("a\nb", "say ""hi""").
 *  Returns null when the text is not a rectangular grid of >= 2 rows x >= 2 cols. */
export function parseTsvGrid(text: string): string[][] | null {
  if (!text.includes("\t")) return null;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  let cellStart = true;
  const s = text.replace(/\r\n?/g, "\n");
  while (i < s.length) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cellStart) {
      inQuotes = true;
      cellStart = false;
      i++;
      continue;
    }
    if (ch === "\t") {
      row.push(cell);
      cell = "";
      cellStart = true;
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      cellStart = true;
      i++;
      continue;
    }
    cell += ch;
    cellStart = false;
    i++;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // drop trailing completely-empty rows (Excel appends a newline)
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c === "")) rows.pop();
  if (rows.length < 2) return null;
  const width = rows[0]!.length;
  if (width < 2) return null;
  if (!rows.every((r) => r.length === width)) return null;
  return rows;
}

/** Build a BlockNote PartialBlock (table) from a grid. Kept structural (no BlockNote import). */
export function gridToTableBlock(grid: string[][], opts: { headerRow?: boolean } = {}) {
  return {
    type: "table" as const,
    content: {
      type: "tableContent" as const,
      ...(opts.headerRow ? { headerRows: 1 } : {}),
      rows: grid.map((r) => ({ cells: r.map((c) => c) })),
    },
  };
}

/** Minimal HTML table for editor.pasteHTML(): lets prosemirror-tables paste *into*
 *  an existing table's cells when the cursor is inside a table. */
export function gridToHtmlTable(grid: string[][]): string {
  const esc = (x: string) =>
    x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  return `<table><tbody>${grid
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}
