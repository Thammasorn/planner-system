# R9 — KaTeX for equations (M11, FR-1501…1506)

> Research date 2026-11-02 · M11 stream S0 (plan/m11 S0.1, M11-D3/D29/D30) · stack: Next.js 16.3.7 (Turbopack build),
> React 19.3, BlockNote 0.55.0, pnpm 12.8.1, Node 22.
>
> Confidence tags: **[V]** verified here (installed package read, unit test, or `next build` + `next start` + curl),
> **[L]** likely (not executed end to end in a browser — Playwright is not run by contract streams).

## 1. Package

| Item | Value |
|---|---|
| Package | `katex` **0.19.1**, pinned exactly (`pnpm add katex@0.19.1 --save-exact`) [V] |
| Licence | MIT (`package.json › license`) [V] |
| Install scripts | none for consumers (`scripts.prepare = husky` runs only in KaTeX's own repo; pnpm does not run `prepare` for registry deps) → no `allowBuilds` entry, `pnpm-workspace.yaml` unchanged [V] |
| Types | shipped: `types/katex.d.ts` (no `@types/katex`) [V] |
| Runtime dependency | `commander` (CLI only, `bin: cli.js`; never imported by the app) [V] |
| Entry points | `exports["."]` → `dist/katex.mjs` (import) / `dist/katex.js` (require); `exports["./*"]` → any file, so `katex/dist/katex.min.css` resolves [V] |
| Assets | `dist/katex.min.css` (≈ 25 KB), `dist/fonts/` 60 files (20 faces × woff2 / woff / ttf) [V] |
| Fallback | `0.16.47` (same option names); **not needed** — no blocker found |

Exports used: `default` (`katex.renderToString`), `type KatexOptions`. Also exported: `render`, `ParseError`, `version`,
`__parse` etc. [V] (`types/katex.d.ts`).

## 2. Options (M11-D29, `src/lib/math/katex-runtime.ts › KATEX_OPTIONS`)

```ts
{ displayMode, throwOnError: true, trust: false, maxExpand: 1000, maxSize: 10, output: 'htmlAndMathml', strict: 'ignore' }
```

All six names exist in `KatexOptions` 0.19.1 (`output: "html" | "mathml" | "htmlAndMathml"`, `strict: boolean | string |
StrictFunction`, `trust: boolean | ((ctx: TrustContext) => boolean)`) [V].

Behaviour verified in `src/lib/math/katex.test.ts` (Vitest, node) [V]:

| Input | Result |
|---|---|
| `\int_0^1 x^2\,dx = \frac{1}{3}` (display) | `ok: true`; HTML contains `<math` (MathML) and `katex-display` |
| `\frac{1}{` | **throws** → `ok: false`, message `KaTeX parse error: Unexpected end of input in a macro argument, expected '}' at end of input: \frac{1}{` |
| `\href{javascript:alert(1)}{x}` with `trust: false` | **does not throw**: rendered as error-coloured text `\href` (`color:#cc0000`) — no `<a>`, no `href=` attribute; the source only appears escaped inside the MathML `<annotation encoding="application/x-tex">` |
| source of 2,001 chars | rejected before rendering (`LATEX_MAX = 2000`) |

**Note for S5 (error state, FR-1504):** an *untrusted* command is not a `ParseError` — KaTeX renders it with
`errorColor` (#cc0000) and returns normally. If the UI must show "สมการไม่ถูกต้อง" for `\href`/`\url`/
`\includegraphics` too, detect it explicitly (e.g. `trust: (ctx) => { untrusted = true; return false }` and treat
`untrusted` as an error) — the current `renderLatex` keeps KaTeX's default (safe, visibly red) rendering.

## 3. CSS + fonts in Next 16 (lazy chunk)

`src/lib/math/katex-runtime.ts` imports `katex` **and** `katex/dist/katex.min.css`; `src/lib/math/load-katex.ts`
memoises `import('./katex-runtime')` (and clears the memo on a failed chunk load so a retry works offline → online).

Spike (throwaway copy of the repo in `/tmp`, never committed): a client component on `/login/katex-spike` calling
`loadKatex()` in an effect, and a control page `/login/katex-none`; `pnpm build` (Turbopack) + `next start -p 3917`;
checked with curl [V]:

- (a) **Assets are self-hosted under `/_next/static/`**: one CSS chunk (`/_next/static/chunks/<hash>.css`, 25 KB) whose
  `@font-face` rules point at `../media/KaTeX_*.<hash>.woff2|woff|ttf` → `/_next/static/media/` (60 files). Both served
  `200` (`text/css`, `font/woff2`). No CDN URL anywhere.
- (b) **Lazy**: neither page's HTML references the KaTeX CSS or the KaTeX JS chunk (264 KB). Both are referenced only by
  the spike page's own client chunk (the dynamic-import loader map), which the control page does not load. The control
  page therefore never requests anything KaTeX [V for the HTML/chunk graph; L for the runtime network log — e2e P2
  asserts "no request whose URL contains `katex` or `KaTeX_`"].
- (c) **CSP**: the production header is `style-src 'self' 'unsafe-inline'; font-src 'self'` — the CSS chunk and fonts
  are same-origin, and KaTeX's inline `style="…"` attributes are covered by `'unsafe-inline'` (already required by
  Emotion). No CSP change needed [V header / L browser console].
- (d) `ParseError` for `\frac{1}{` [V unit].
- (e) `trust: false` → no link for `\href{javascript:…}` [V unit].

## 4. Usage contract for S5

- Only `src/lib/math/katex-runtime.ts` imports `katex` (keep it that way: a static import anywhere else would pull
  264 KB + CSS into that route's first load).
- Render with `const k = await loadKatex(); k.renderLatex(src, displayMode)` → `{ ok, html } | { ok: false, message }`;
  inject `html` with `dangerouslySetInnerHTML` (KaTeX output is escaped; `trust: false` blocks URL commands).
- Show a sized skeleton until `loadKatex()` resolves (NFR-12).
- Server never renders KaTeX (out of scope, plan §1.2); `extractContentText` stores the LaTeX source only.
