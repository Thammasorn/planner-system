// src/lib/theme/token-scale.ts — the token-scale check of `pnpm check` (FR-1605, AC-1605; plan/m06.1 S0.12, M6.1-D24).
// No new dependency: TS/TSX are walked with the TypeScript compiler API, CSS (modules) with a line regex.
// Rules — font: fontSize / font-size and line-height with units; spacing: m*/p*/margin*/padding*/gap/rowGap/
// columnGap; radius: borderRadius / border-*-radius; colour: #rgb[a] / #rrggbb[aa] / rgb[a]() / hsl[a]() anywhere.
// Values must come from the §8.12 tokens (var(--…)), MUI scale factors {0, ±0.5, ±1, ±1.5, ±2, ±3, ±4, ±6}, 0/auto.
// Widths, heights and layout constants are not scanned. Escape hatch: a same-line comment
// `token-scale-ok: <reason of at least 10 characters>` (escapes are listed by `expectTokenScale`).
// Test-only module (Vitest, node): it reads the file system and is never imported by app code.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { SPACING_FACTORS } from './tokens'

export type TokenRule = 'font' | 'spacing' | 'radius' | 'colour'

export interface TokenViolation {
  path: string
  line: number
  rule: TokenRule
  snippet: string
}

export interface TokenEscape {
  path: string
  line: number
  reason: string
}

export interface ScanResult {
  violations: TokenViolation[]
  escapes: TokenEscape[]
}

const ESCAPE_RE = /token-scale-ok:\s*(.*?)\s*(?:\*\/\s*)?$/
const MIN_REASON = 10
const COLOUR_RE = /(?:^|[^\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/i
const UNIT_RE = /\d(?:px|rem|em)\b/i
const ALLOWED_FACTORS = new Set<number>(SPACING_FACTORS)

const SPACING_PROP = /^(?:[mp][trblxy]?|(?:margin|padding)(?:[A-Z]\w*)?|gap|rowGap|columnGap)$/
const RADIUS_PROP = /^border(?:[A-Z][a-z]*)*Radius$/
const FONT_SIZE_PROP = 'fontSize'
const LINE_HEIGHT_PROP = 'lineHeight'

const camel = (name: string): string => name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())

/** The reason of a same-line escape comment, or null when there is none (an empty/short reason is returned as is). */
function escapeOf(lineText: string): string | null {
  const m = ESCAPE_RE.exec(lineText)
  return m ? (m[1] ?? '') : null
}

class Collector {
  readonly violations: TokenViolation[] = []
  readonly escapes: TokenEscape[] = []
  private readonly seen = new Set<string>()

  constructor(
    private readonly file: string,
    private readonly lines: string[],
  ) {}

  add(line: number, rule: TokenRule): void {
    const key = `${line}:${rule}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    const text = this.lines[line - 1] ?? ''
    const reason = escapeOf(text)
    if (reason !== null && reason.length >= MIN_REASON) {
      if (!this.escapes.some((e) => e.line === line)) this.escapes.push({ path: this.file, line, reason })
      return
    }
    this.violations.push({ path: this.file, line, rule, snippet: text.trim().slice(0, 160) })
  }
}

// ── TS / TSX ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Leaf = { kind: 'number'; value: number; node: ts.Node } | { kind: 'text'; value: string; node: ts.Node }

/** Literal leaves of a property value: numbers (incl. -n), strings, template parts, through ?:, (), {}, [], ??, ||. */
function leaves(e: ts.Expression, out: Leaf[] = []): Leaf[] {
  if (ts.isNumericLiteral(e)) out.push({ kind: 'number', value: Number(e.text), node: e })
  else if (
    ts.isPrefixUnaryExpression(e) &&
    e.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(e.operand)
  )
    out.push({ kind: 'number', value: -Number(e.operand.text), node: e })
  else if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
    out.push({ kind: 'text', value: e.text, node: e })
  else if (ts.isTemplateExpression(e)) {
    // `${x}px`: a unit right after a substitution counts as a unit
    const parts = [e.head.text, ...e.templateSpans.map((s) => s.literal.text)]
    const unit = parts.some((p, i) => UNIT_RE.test(p) || (i > 0 && /^(?:px|rem|em)\b/i.test(p)))
    out.push({ kind: 'text', value: unit ? '1px' : parts.join(''), node: e })
  } else if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e))
    leaves(e.expression, out)
  else if (ts.isConditionalExpression(e)) {
    leaves(e.whenTrue, out)
    leaves(e.whenFalse, out)
  } else if (
    ts.isBinaryExpression(e) &&
    (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      e.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    leaves(e.left, out)
    leaves(e.right, out)
  } else if (ts.isObjectLiteralExpression(e)) {
    for (const p of e.properties) if (ts.isPropertyAssignment(p)) leaves(p.initializer, out) // responsive values
  } else if (ts.isArrayLiteralExpression(e)) {
    for (const el of e.elements) leaves(el, out)
  }
  return out
}

function propName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name))
    return camel(name.text)
  return null
}

function ruleOf(prop: string): TokenRule | 'lineHeight' | null {
  if (prop === FONT_SIZE_PROP) return 'font'
  if (prop === LINE_HEIGHT_PROP) return 'lineHeight'
  if (RADIUS_PROP.test(prop)) return 'radius'
  if (SPACING_PROP.test(prop)) return 'spacing'
  return null
}

/** Is this leaf off the token scale for the property's rule? */
function offScale(rule: TokenRule | 'lineHeight', leaf: Leaf): boolean {
  if (leaf.kind === 'number') {
    if (rule === 'spacing') return !ALLOWED_FACTORS.has(Math.abs(leaf.value))
    if (rule === 'font') return leaf.value !== 0 // MUI / React: numbers are px
    if (rule === 'radius') return leaf.value !== 0 && leaf.value !== 1 // 1 = theme shape (--radius-md)
    return false // unitless line-height
  }
  return UNIT_RE.test(leaf.value.replace(/(?:^|[^\d.])0(?:px|rem|em)\b/gi, ' 0'))
}

function scanTs(file: string, text: string, c: Collector): void {
  const kind = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const lineOf = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const prop = propName(node.name)
      const rule = prop ? ruleOf(prop) : null
      if (rule) {
        for (const leaf of leaves(node.initializer))
          if (offScale(rule, leaf)) c.add(lineOf(leaf.node), rule === 'lineHeight' ? 'font' : rule)
      }
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (COLOUR_RE.test(node.text)) c.add(lineOf(node), 'colour')
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

// ── CSS ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Block comments blanked out (newlines kept, so line numbers stay). */
const stripComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

const CSS_DECL = /(?:^|[\s{;])([a-z-]+)\s*:\s*([^;{}]+)/gi
const CSS_SPACING = /^(?:(?:margin|padding)(?:-[a-z-]+)?|gap|row-gap|column-gap|grid-gap)$/
const CSS_RADIUS = /^border(?:-[a-z]+)*-radius$/

/** Value made of tokens only: 0, auto, inherit…, var(--x), calc() of vars and unitless numbers (+ % for radii). */
function cssValueOk(value: string, allowPercent: boolean): boolean {
  let v = value.replace(/!important/i, '').trim()
  v = v.replace(/var\(--[\w-]+\)/g, 'V')
  for (let prev = ''; prev !== v;) {
    prev = v
    v = v.replace(/calc\(([^()]*)\)/g, (_m, inner: string) =>
      /[a-z%]/i.test(inner.replace(/V/g, '')) ? '!' : 'V',
    )
  }
  return v
    .split(/[\s,/]+/)
    .filter((t) => t !== '')
    .every(
      (t) =>
        t === 'V' ||
        t === '0' ||
        /^(?:auto|inherit|initial|unset|revert|normal)$/i.test(t) ||
        (allowPercent && /^\d+(?:\.\d+)?%$/.test(t)),
    )
}

function scanCss(text: string, c: Collector): void {
  const lines = stripComments(text).split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(CSS_DECL)) {
      const prop = (m[1] ?? '').toLowerCase()
      const value = m[2] ?? ''
      if (COLOUR_RE.test(value)) c.add(i + 1, 'colour')
      if (prop === 'font-size' && !cssValueOk(value, false)) c.add(i + 1, 'font')
      else if (prop === 'line-height' && UNIT_RE.test(value)) c.add(i + 1, 'font')
      else if (CSS_RADIUS.test(prop) && !cssValueOk(value, true)) c.add(i + 1, 'radius')
      else if (CSS_SPACING.test(prop) && !cssValueOk(value, false)) c.add(i + 1, 'spacing')
    }
  })
}

// ── public API ───────────────────────────────────────────────────────────────────────────────────────────────────

const isCss = (file: string): boolean => file.endsWith('.css')
const isTs = (file: string): boolean => /\.(?:tsx?|jsx?)$/.test(file) && !file.endsWith('.d.ts')

/** Violations and accepted escape comments of one file (`file` decides TS vs CSS by its extension). */
export function scanSourceDetailed(file: string, text: string): ScanResult {
  const c = new Collector(file, text.split('\n'))
  if (isCss(file)) scanCss(text, c)
  else if (isTs(file)) scanTs(file, text, c)
  return { violations: c.violations, escapes: c.escapes }
}

export function scanSource(file: string, text: string): TokenViolation[] {
  return scanSourceDetailed(file, text).violations
}

/** M6.1-D24: never scanned (tokens and theme define the scale; global-error renders without the root layout). */
export const DEFAULT_EXCLUDES: readonly string[] = [
  'src/app/tokens.css',
  'src/app/global-error.tsx',
  'src/lib/theme/theme.ts',
]

const TEST_FILE = /(?:\.test\.[cm]?[jt]sx?|\.test\.(?:helper|data|mocks)\.[jt]sx?|\.spec\.[jt]sx?)$/
const posix = (p: string): string => p.split(path.sep).join('/')

function excluded(file: string, patterns: readonly string[]): boolean {
  const p = posix(file)
  if (TEST_FILE.test(p) || p.includes('/__fixtures__/') || p.startsWith('__fixtures__/')) return true
  return patterns.some((pat) =>
    pat.endsWith('/') ? p.startsWith(pat) || p.includes(`/${pat}`) : p === pat || p.endsWith(`/${pat}`),
  )
}

/** Scans every TS/TSX/CSS file under `rootDir` (recursive), minus tests, fixtures and the exclusions. */
export function collectTokenScale(
  rootDir: string,
  opts: { exclude?: readonly string[] } = {},
): ScanResult & { files: number } {
  const patterns = [...DEFAULT_EXCLUDES, ...(opts.exclude ?? [])]
  const out: ScanResult & { files: number } = { violations: [], escapes: [], files: 0 }
  const entries = readdirSync(rootDir, { recursive: true, encoding: 'utf8' }).sort()
  for (const rel of entries) {
    const file = path.join(rootDir, rel)
    if (!(isCss(file) || isTs(file)) || excluded(file, patterns) || !statSync(file).isFile()) continue
    const r = scanSourceDetailed(file, readFileSync(file, 'utf8'))
    out.files += 1
    out.violations.push(...r.violations)
    out.escapes.push(...r.escapes)
  }
  return out
}

/** For co-located `token-scale.test.ts` files: throws listing every violation; prints every accepted escape. */
export function expectTokenScale(rootDir: string, opts: { exclude?: readonly string[] } = {}): void {
  const r = collectTokenScale(rootDir, opts)
  if (r.escapes.length > 0)
    console.info(
      `token-scale-ok (${r.escapes.length}):\n` +
        r.escapes.map((e) => `  ${e.path}:${e.line} — ${e.reason}`).join('\n'),
    )
  if (r.violations.length > 0)
    throw new Error(
      `Token-scale violations (FR-1605, SPEC §8.12) — use the --font-*/--space-*/--radius-* tokens, MUI scale factors ` +
        `{${SPACING_FACTORS.join(', ')}} or var(--…) colours:\n` +
        r.violations.map((v) => `  ${v.path}:${v.line} ${v.rule} — ${v.snippet}`).join('\n'),
    )
}
