/**
 * windows-874 (TIS-620 + Microsoft extras) encoder for the holiday CSV import e2e (plan/m05 S5.1, FR-901, R8).
 * Same mapping as the S1.2 parser test helper: ASCII as is; the Thai block U+0E01…U+0E5B → `cp − 0x0E01 + 0xA1`.
 * Anything else has no windows-874 byte here and throws, so a fixture can never silently lose characters.
 */
export function encodeWindows874(s: string): Buffer {
  const bytes: number[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) bytes.push(cp)
    else if (cp >= 0x0e01 && cp <= 0x0e5b) bytes.push(cp - 0x0e01 + 0xa1)
    else throw new RangeError(`encodeWindows874: U+${cp.toString(16).toUpperCase()} has no windows-874 byte`)
  }
  return Buffer.from(bytes)
}
