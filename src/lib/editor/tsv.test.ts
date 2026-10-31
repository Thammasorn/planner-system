// S2.1 — TSV (Excel / Google Sheets text/plain) → grid → HTML table (FR-524, AC-502, r3 §7.4).
import { describe, expect, it } from 'vitest'
import { gridToHtmlTable, parseTsvGrid } from './tsv'

describe('parseTsvGrid', () => {
  it('parses a simple grid', () => {
    expect(parseTsvGrid('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('handles CRLF and a trailing newline', () => {
    expect(parseTsvGrid('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('handles quoted cells with newlines', () => {
    expect(parseTsvGrid('"a\nb"\tc\nd\te')).toEqual([
      ['a\nb', 'c'],
      ['d', 'e'],
    ])
  })

  it('unescapes doubled quotes', () => {
    expect(parseTsvGrid('"say ""hi"""\tx\ny\tz')?.[0]?.[0]).toBe('say "hi"')
  })

  it('rejects ragged rows, single rows and single columns', () => {
    expect(parseTsvGrid('a\tb\nc')).toBeNull()
    expect(parseTsvGrid('a\tb')).toBeNull()
    expect(parseTsvGrid('a\nb')).toBeNull()
  })

  it('keeps markdown-looking spreadsheet text as a grid', () => {
    expect(parseTsvGrid('ชื่อ\tงาน\nCindy\ttask_name_1\nIvy\t1. วางแผน')).toEqual([
      ['ชื่อ', 'งาน'],
      ['Cindy', 'task_name_1'],
      ['Ivy', '1. วางแผน'],
    ])
  })
})

describe('gridToHtmlTable', () => {
  it('escapes HTML and turns newlines into <br>', () => {
    expect(gridToHtmlTable([['<a>&', 'x\ny']])).toBe(
      '<table><tbody><tr><td>&lt;a&gt;&amp;</td><td>x<br>y</td></tr></tbody></table>',
    )
  })
})
