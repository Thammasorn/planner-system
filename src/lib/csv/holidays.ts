// src/lib/csv/holidays.ts — holiday CSV import parser (FR-901, X64, M5-D11). Pure and isomorphic: shared by the
// settings import dialog (browser) and scripts/import-holidays.ts (Node). The server re-validates with zod.
import { isISODate } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'

export const HOLIDAY_CSV_MAX_ROWS = 500
export const HOLIDAY_CSV_MAX_BYTES = 256 * 1024
const NAME_MAX = 200
const MAX_YEAR_EXCLUSIVE = 2400 // a B.E. year written in ISO shape (2569-10-23) is rejected, never converted
const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}$/

export type CsvEncoding = 'utf-8' | 'windows-874'
export interface HolidayCsvRow {
  line: number
  date: ISODate
  name: string
}
export type HolidayCsvErrorCode =
  'COLUMNS' | 'BAD_DATE' | 'EMPTY_NAME' | 'NAME_TOO_LONG' | 'DUPLICATE' | 'UNCLOSED_QUOTE'
export interface HolidayCsvError {
  line: number
  code: HolidayCsvErrorCode
  raw?: string
  date?: ISODate
  firstLine?: number
}
export interface HolidayCsvResult {
  encoding: CsvEncoding
  rows: HolidayCsvRow[]
  errors: HolidayCsvError[]
  fileError: 'EMPTY' | 'TOO_MANY' | 'TOO_LARGE' | null
}

/** Strict UTF-8 first (BOM stripped); bytes that are not valid UTF-8 are Thai Excel's windows-874 (r6a §5.5). */
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-874').decode(bytes), encoding: 'windows-874' }
  }
}

/** RFC 4180 subset: comma separator; "…" quoted fields with "" escapes and embedded commas / line breaks;
 *  CRLF, LF or CR line ends. `line` = 1-based physical line where the record starts. Unquoted fields are trimmed;
 *  leading spaces before an opening quote and text after a closing quote (trimmed) are tolerated.
 *  A blank line is a record with one empty field; a final line break adds no record.
 *  An unclosed quote → UNCLOSED_QUOTE at the line where it opened, and that record is dropped. */
export function parseCsvRecords(text: string): {
  records: { line: number; fields: string[] }[]
  errors: HolidayCsvError[]
} {
  const records: { line: number; fields: string[] }[] = []
  const errors: HolidayCsvError[] = []
  let line = 1
  let recordLine = 1
  let fields: string[] = []
  let field = ''
  let quoted = false // the current field had a quoted part
  let inQuotes = false
  let quoteLine = 1
  let tail = '' // raw text after a closing quote
  let dirty = false // anything consumed since the last record ended

  const endField = (): void => {
    fields.push(quoted ? field + tail.trim() : field.trim())
    field = ''
    tail = ''
    quoted = false
  }
  const endRecord = (): void => {
    endField()
    records.push({ line: recordLine, fields })
    fields = []
    dirty = false
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else {
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++
        field += ch
      }
      continue
    }
    if (ch === ',') {
      endField()
      dirty = true
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRecord()
      line++
      recordLine = line
    } else if (ch === '"' && !quoted && field.trim() === '') {
      quoted = true
      inQuotes = true
      quoteLine = line
      field = ''
      dirty = true
    } else {
      if (quoted) tail += ch
      else field += ch
      dirty = true
    }
  }

  if (inQuotes) errors.push({ line: quoteLine, code: 'UNCLOSED_QUOTE' })
  else if (dirty) endRecord()
  return { records, errors }
}

function isHeader(fields: readonly string[]): boolean {
  return fields[0]?.toLowerCase() === 'date' && fields[1]?.toLowerCase() === 'name'
}

function isAcceptedDate(s: string): s is ISODate {
  return ISO_SHAPE.test(s) && isISODate(s) && Number(s.slice(0, 4)) < MAX_YEAR_EXCLUSIVE
}

/** Full import pipeline: size check → decode → records → optional header → per-line validation (one error per
 *  line, first failing rule) → duplicates → file-level EMPTY / TOO_MANY. `rows` holds only the valid lines. */
export function parseHolidaysCsv(bytes: Uint8Array): HolidayCsvResult {
  if (bytes.length > HOLIDAY_CSV_MAX_BYTES)
    return { encoding: 'utf-8', rows: [], errors: [], fileError: 'TOO_LARGE' }
  const { text, encoding } = decodeCsv(bytes)
  const parsed = parseCsvRecords(text)
  const errors: HolidayCsvError[] = [...parsed.errors]
  const nonBlank = parsed.records.filter((r) => r.fields.some((f) => f !== ''))
  const data = nonBlank.length > 0 && isHeader(nonBlank[0]!.fields) ? nonBlank.slice(1) : nonBlank

  const rows: HolidayCsvRow[] = []
  const firstLineOf = new Map<ISODate, number>()
  for (const { line, fields } of data) {
    const f = [...fields]
    while (f.length > 2 && f[f.length - 1] === '') f.pop() // Excel's trailing ",,"
    if (f.length !== 2) {
      errors.push({ line, code: 'COLUMNS' })
      continue
    }
    const raw = f[0]!
    if (!isAcceptedDate(raw)) {
      errors.push({ line, code: 'BAD_DATE', raw })
      continue
    }
    const name = f[1]!.trim().normalize('NFC')
    if (name === '') {
      errors.push({ line, code: 'EMPTY_NAME' })
      continue
    }
    if (name.length > NAME_MAX) {
      errors.push({ line, code: 'NAME_TOO_LONG' })
      continue
    }
    const firstLine = firstLineOf.get(raw)
    if (firstLine !== undefined) {
      errors.push({ line, code: 'DUPLICATE', date: raw, firstLine })
      continue
    }
    firstLineOf.set(raw, line)
    rows.push({ line, date: raw, name })
  }
  errors.sort((a, b) => a.line - b.line)

  const fileError =
    data.length === 0 && errors.length === 0
      ? 'EMPTY'
      : data.length > HOLIDAY_CSV_MAX_ROWS
        ? 'TOO_MANY'
        : null
  return { encoding, rows, errors, fileError }
}

/** Thai message for one line error: th.holidays.import.errors.line(line, <specific>). */
export function holidayCsvErrorMessage(e: HolidayCsvError): string {
  const t = th.holidays.import.errors
  const specific = ((): string => {
    switch (e.code) {
      case 'COLUMNS':
        return t.columns
      case 'BAD_DATE':
        return t.badDate(e.raw ?? '')
      case 'EMPTY_NAME':
        return t.emptyName
      case 'NAME_TOO_LONG':
        return t.nameTooLong
      case 'DUPLICATE':
        return t.duplicate(e.date ?? '', e.firstLine ?? 0)
      case 'UNCLOSED_QUOTE':
        return t.unclosedQuote
    }
  })()
  return t.line(e.line, specific)
}

export interface ClassifiedHolidayRow extends HolidayCsvRow {
  status: 'new' | 'update' | 'same'
  previousName?: string
}

/** Preview status against the existing holidays (M5-D11): ใหม่ / อัปเดตชื่อ / ไม่เปลี่ยน. Keeps the row order. */
export function classifyHolidayRows(
  rows: readonly HolidayCsvRow[],
  existing: readonly { date: ISODate; name: string }[],
): ClassifiedHolidayRow[] {
  const byDate = new Map(existing.map((h) => [h.date, h.name]))
  return rows.map((r): ClassifiedHolidayRow => {
    const previous = byDate.get(r.date)
    if (previous === undefined) return { ...r, status: 'new' }
    if (previous === r.name) return { ...r, status: 'same' }
    return { ...r, status: 'update', previousName: previous }
  })
}
