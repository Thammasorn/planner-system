// src/lib/math/katex-runtime.ts — the only module that imports KaTeX (FR-1505, M11-D29/D30). Loaded lazily through
// `loadKatex()` so the library, its CSS and its fonts are a separate chunk that pages without equations never request.
// Next 16 emits katex.min.css and its woff2/woff/ttf fonts under /_next/static/** (self-hosted, `font-src 'self'`).
import katex, { type KatexOptions } from 'katex'
import 'katex/dist/katex.min.css'

/** FR-1505: maximum LaTeX source length (also enforced by checkBlockProps, 2,000 chars). */
export const LATEX_MAX = 2000

/** M11-D29 — exactly these options (throwOnError drives the error state; trust false blocks \href, \url, \includegraphics). */
export const KATEX_OPTIONS = {
  throwOnError: true,
  trust: false,
  maxExpand: 1000,
  maxSize: 10,
  output: 'htmlAndMathml',
  strict: 'ignore',
} as const satisfies Omit<KatexOptions, 'displayMode'>

export type RenderLatexResult = { ok: true; html: string } | { ok: false; message: string }

/** Renders `src` to an HTML string (HTML + MathML). Never throws: parse errors and over-long input → `ok: false`. */
export function renderLatex(src: string, displayMode: boolean): RenderLatexResult {
  if (src.length > LATEX_MAX)
    return { ok: false, message: `LaTeX source longer than ${LATEX_MAX} characters` }
  try {
    return { ok: true, html: katex.renderToString(src, { ...KATEX_OPTIONS, displayMode }) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
