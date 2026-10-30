# R1 — Next.js · MUI · Thai fonts · CSP · lint · pnpm — verified facts for the implementation plan

*Research date: 2026-09-30 (UTC ~06:40–07:40). Machine: macOS arm64, global Node v26.5.0, npm 11.17.0, Docker 29.5.3.*
*Scratch experiments: `r1-next-mui/` (`exp/` = full working Next 16.3 + MUI 9 + BlockNote app, built, run standalone, run in Docker, driven by Playwright Chromium).*

Confidence tags used everywhere: **[verified]** = read in the installed package's `.d.ts`/source/bundled docs, or executed and observed; **[likely]** = strong evidence (official docs / web) but not executed here; **[uncertain]** = inference.

---

## 0. TL;DR — decisions the plan should encode

| Topic | Recommendation | Confidence |
|---|---|---|
| Next.js | `next@16.3.7` (latest, published 2026-09-29 09:04Z). React `19.3.0`. Node 22 is supported (`engines.node >=20.9.0`). | verified |
| Middleware | Use **`src/proxy.ts`** exporting `proxy()` (middleware.ts is deprecated in 16). Node runtime only (not configurable). | verified |
| Mutation → fresh UI | In server actions call **`refresh()`** (no server cache in this app) — or `updateTag()` / `revalidatePath()` if tags/paths are used. **Never `revalidateTag(tag, 'max')` for read-your-writes** (it does NOT refresh the current page). SPEC §7.3's single-arg `revalidateTag(...)` is deprecated/TS error in 16. | verified (source + browser test) |
| cacheComponents / `'use cache'` | **Leave OFF.** Nonce CSP is incompatible with PPR; all routes are dynamic anyway. | verified (docs) |
| GET route handlers | Not cached by default. | verified (docs + build output) |
| Build | `output: 'standalone'`; Turbopack is the default for `next build`; copy `.next/static` + `public` yourself; set `HOSTNAME=0.0.0.0`. sharp 0.35.5 has **no** install script and is auto-traced into standalone. | verified (Docker run) |
| Lint | `next lint` removed. ESLint flat config with `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` (+ optional `tseslint.configs.recommendedTypeChecked`). **Pin ESLint 9.39.x** (ESLint 10 crashes eslint-plugin-react 7.37.5 unless `settings.react.version` is set). ESLint 9 is EOL since 2026-08-06 (dev-only tool, acceptable). | verified |
| TypeScript | **Pin `typescript@~6.0.3`** — TS 7.0.2 is npm `latest` but typescript-eslint 8.71 requires `<6.1.0` and TS 7 has no JS API. TS 6 changed defaults: add `"types": ["node"]`. `typecheck` script must be `next typegen && tsc --noEmit`. | verified |
| Thai font | `@fontsource/ibm-plex-sans-thai@5.3.0` (OFL-1.1). Copy the woff2 files into `src/app/fonts/` and load with **two `next/font/local` families (latin + thai) with `adjustFontFallback: false`**, compose `var(--font-plex-latin), var(--font-plex-thai), system-ui, sans-serif` in MUI typography. | verified (rendering checked via CDP) |
| CSP | Nonce generated in proxy; **`script-src 'self' 'nonce-…'` without `'strict-dynamic'`** (+`'unsafe-eval'` dev only); **`style-src 'self' 'unsafe-inline'`**; `img-src 'self' blob: data:`; `connect-src 'self'` (+`ws: wss:` dev); `frame-ancestors 'none'`; no `upgrade-insecure-requests` unless HTTPS. Zero violations in Chromium across MUI, pickers, BlockNote, server actions, streaming. | verified |
| MUI | `@mui/material@9.4.0` + `@mui/material-nextjs@9.4.0` (**import from `@mui/material-nextjs/v16-appRouter`**), Emotion 11.14, `@mui/icons-material@9.4.0`. Theme `cssVariables: { colorSchemeSelector: 'class' }` → `.light/.dark` class on `<html>` (matches SPEC §8.7 `.dark`). `enableCssLayer: true`. thTH locale exists. | verified |
| Dark mode w/o flicker, no localStorage | Render `<html class="dark|light">` on the server from `user_preferences`, `ThemeProvider defaultMode={mode} storageManager={null}` — no script, no localStorage, no flicker. | verified |
| Date pickers | `@mui/x-date-pickers@9.14.0` (MIT). **`AdapterDayjsBuddhist`** ships in v9 → displays `30/09/2569`, header `กันยายน 2569`. DateRangePicker is **Pro** only → use two DatePickers. Convert `'YYYY-MM-DD'` ↔ Dayjs only at the component edge. | verified |
| pnpm | **pnpm 12.8.1** (Rust rewrite, native binary, npm `latest`). Install: `npm install -g pnpm@12.8.1` (or standalone script). Pin Node 22 via **`devEngines.runtime` `{ name: 'node', version: '^22.23.0', onFail: 'download' }`** — pnpm downloads Node 22.23.3 and every `pnpm run/exec` uses it. Builds approved via **`allowBuilds`** in `pnpm-workspace.yaml` (`onlyBuiltDependencies`/`useNodeVersion` are gone). | verified |
| Agent gotchas | `npx`/`npm run`/`npm exec` inside the repo **fail with EBADDEVENGINES** (npm 11.17 on Node 26) → always `pnpm exec` / `pnpm dlx` / `pnpm <script>`. `next dev` (16.3) **auto-appends a managed block to CLAUDE.md** when it detects an agent → set `agentRules: false` or pre-create `AGENTS.md`. Only one `next build` and one `next dev` may run per checkout. | verified |

---

## 1. Versions (npm registry, 2026-09-30)

| Package | Version to pin | Notes / evidence |
|---|---|---|
| next | **16.3.7** (latest; 16.3.6 = previous) | `npm view next dist-tags` → `latest: 16.3.7`, `canary: 16.4.0-canary.53`, `backport: 15.5.26`. 16.3.7 published 2026-09-29T09:04Z (see pnpm minimumReleaseAge §10.4). engines `node >=20.9.0`; peer `react ^18.2.0 \|\| ^19.0.0`. [verified] |
| react / react-dom | **19.3.0** (published 2026-09-09) | App Router actually runs Next's vendored React **`19.3.0-canary-cbb046ab-20260731`** (`node_modules/next/dist/compiled/react`). Installed react is used by Vitest/scripts. create-next-app@16.3.6 pins `19.2.8`. [verified] |
| @types/react, @types/react-dom | 19.3.0 | [verified] |
| @types/node | ^22 (resolved 22.20.4) | create-next-app template uses `^20`; use `^22` to match runtime. [verified] |
| typescript | **~6.0.3** | npm `latest` is **7.0.2** (Go-native; package main = `lib/version.cjs`, only `./unstable/*` API). `typescript-eslint@8.71.0` peer `typescript: ">=4.8.4 <6.1.0"`. create-next-app still writes `typescript: "^5"`. [verified] |
| eslint | **^9.39.5** (9.39.5 is last 9.x, marked deprecated: "This version is no longer supported") | ESLint 10.11.0 is latest; ESLint 9 EOL 2026-08-06 (eslint.org/version-support). eslint-plugin-react 7.37.5 / import 2.32.0 / jsx-a11y 6.10.2 peers stop at `^9`. [verified] |
| eslint-config-next | same as next (16.3.7) | deps: typescript-eslint ^8.46, eslint-plugin-react ^7.37, react-hooks ^7, import, jsx-a11y, @next/eslint-plugin-next. [verified] |
| typescript-eslint | 8.71.0 | single instance shared with eslint-config-next under pnpm. [verified] |
| prettier / eslint-config-prettier | 3.9.9 / 10.1.8 (`eslint-config-prettier/flat`) | [verified] |
| @mui/material, @mui/system, @mui/icons-material, @mui/material-nextjs | **9.4.0** (2026-08-27) | `latest-v7: 7.3.11`; `@mui/lab` still `9.0.0-beta.9` (avoid). peer react `^17 \|\| ^18 \|\| ^19`; material-nextjs peer `next ^13 … ^16`. [verified] |
| @emotion/react / styled / cache | 11.14.0 / 11.14.1 / 11.14.0 | [verified] |
| @mui/x-date-pickers | **9.14.0** (MIT) | peer `@mui/material ^7.3.0 \|\| ^9.0.0`, `dayjs ^1.10.7`. Pro = `@mui/x-date-pickers-pro` ("SEE LICENSE IN LICENSE", depends on `@mui/x-license`). [verified] |
| dayjs | 1.11.23 | [verified] |
| @fontsource/ibm-plex-sans-thai | **5.3.0** (OFL-1.1) | [verified] |
| @fontsource/noto-sans-thai, @fontsource-variable/noto-sans-thai | 5.3.0 (OFL-1.1) | no `@fontsource-variable/ibm-plex-sans-thai` exists. [verified] |
| pnpm | **12.8.1** (`latest`); 12.8.2 on `next-12`; `latest-11: 11.28.2` | 12.x is a Rust rewrite, native binaries via `@pnpm/exe.<platform>` optionalDependencies; engines `node >=18`. [verified] |
| Node.js | **22.23.3** (latest 22.x, 2026-09-23, LTS "Jod", *maintenance* since 2025-10-21, **EOL 2027-04-30**) | Node 24.21.0 = Active LTS (→maintenance 2026-10-20, EOL 2028-04-30); Node 26 becomes LTS 2026-10-28. Source: nodejs.org/dist/index.json + nodejs/Release schedule.json. [verified] |
| sharp | 0.35.5 (optional dep of next) | **no `install` script**; prebuilt `@img/sharp-*` incl. linuxmusl. [verified] |
| BlockNote | @blocknote/core/react/mantine **0.55.0**; @mantine/core/hooks 9.6.3 | `@blocknote/mantine` peer `@mantine/core ^8.3.11 \|\| ^9.0.2`. `@blocknote/shadcn` peers `tailwindcss ^4.1.12` (not usable without Tailwind). No `@blocknote/mui` package. [verified] |

Other versions resolved by pnpm in the same experiment (for cross-reference by other research tracks, not deeply researched here): @playwright/test 1.63.0, vitest 5.0.2 (engines `^22.12 \|\| ^24 \|\| >=26`), @vitest/coverage-v8 5.0.2, jsdom 30.1.1 (engines **`^22.22.2`** || ^24.15 || >=26 → Node 22.23.x OK), @testing-library/react 16.3.3, @testing-library/dom 10.4.2, user-event 14.6.7, fast-check 4.10.2, drizzle-orm 0.45.3, drizzle-kit 0.31.11 (pulls deprecated `@esbuild-kit/*` → esbuild 0.18/0.25), postgres 3.4.9, better-auth 1.7.6, zod 4.6.5, @tanstack/react-query 5.104.0, @tanstack/react-virtual 3.14.13, @dnd-kit/core 6.3.1, @dnd-kit/sortable 10.0.0, cmdk 1.1.1, sonner 2.0.8, fractional-indexing 4.0.0, file-type 22.1.1 (engines node >=22), tsx 4.23.15.

---

## 2. Next.js 16.3 App Router specifics

**Key discovery:** Next 16.2+ bundles **version-matched docs inside the package** at `node_modules/next/dist/docs/` (456 md files). Implementers should read those instead of memory. `node_modules/next/AGENTS.md` says: *"This is NOT the Next.js you know … Read the relevant guide in `dist/docs/` before writing any code."* [verified]

### 2.1 `proxy.ts` (replaces `middleware.ts`)

- File `proxy.ts` at project root **or in `src/`** (same level as `app/`). Export `proxy` (named) or default. `middleware.ts`/`export function middleware` still work but are **deprecated**; codemod `npx @next/codemod@canary middleware-to-proxy .` [verified: `dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, `middleware.md`]
- **Runtime: Node.js only; `runtime` config in proxy throws.** Edge runtime only via deprecated `middleware.ts`. [verified docs]
- `config.matcher`: string / array / objects `{ source, has, missing, locale }`; values must be static constants. Without a matcher it runs on every request incl. `_next/static`. [verified docs]
- Server Actions are POSTs to the page route — **a matcher that excludes a path also skips its Server Actions**; docs: *"Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone."* (matches CLAUDE.md authz rule). [verified docs]
- `revalidateTag`/`revalidatePath` cannot be called in proxy. [verified docs]
- **Body buffering:** when proxy runs for a request, Next clones/buffers the body up to `experimental.proxyClientMaxBodySize` (**default 10 MB; excess is truncated with a warning**). SPEC allows 25 MB attachments on `POST /api/files` → **keep `/api` excluded from the matcher** (as below) or raise the limit. [verified docs `proxyClientMaxBodySize.md`]
- Cheap "logged-in?" check: `getSessionCookie(request)` from **`better-auth/cookies`** (checks `__Secure-better-auth.session_token`, `better-auth.session_token`, and `-` variants; returns string|null; no DB). [verified: `better-auth@1.7.6/dist/cookies/index.mjs` line 261; built & curl-tested: no cookie → 307 `/login?next=%2Feditor`; either cookie → 200]

Verified proxy (auth-presence redirect + CSP nonce) — see §12.6 for the final file.

### 2.2 Async request APIs & route type helpers

- Next 16 **removed synchronous access**: `cookies()`, `headers()`, `draftMode()` must be awaited; `params` (layout/page/route/default/metadata images) and `searchParams` (page) are **Promises**. [verified: `dist/docs/01-app/02-guides/upgrading/version-16.md` "Async Request APIs (Breaking change)"]
- Global type helpers generated by `next dev` / `next build` / **`next typegen`**: `PageProps<'/projects/[id]'>`, `LayoutProps<'/'>`, `RouteContext<'/api/grid/project/[projectId]'>` (in `.next/types/routes.d.ts`). [verified]
  ```ts
  export default async function Page(props: PageProps<'/projects/[id]'>) {
    const { id } = await props.params
    const sp = await props.searchParams
  }
  export async function GET(req: NextRequest, ctx: RouteContext<'/api/grid/project/[projectId]'>) {
    const { projectId } = await ctx.params
  }
  ```
- **Clean-checkout gotcha:** `tsc --noEmit` fails (`TS2304: Cannot find name 'LayoutProps'`) until `next typegen` has run (it regenerates `next-env.d.ts` + `.next/types`, ~2 s). → `"typecheck": "next typegen && tsc --noEmit"`. [verified]
- `next-env.d.ts` is **gitignored** by the Next 16 template and points to `.next/dev/types` after `next dev` and `.next/types` after build/typegen. [verified]
- `typedRoutes: true` is a stable top-level option in 16 (typed `href`); optional. [verified builds]

### 2.3 Cache invalidation after mutations — exact APIs and what actually refreshes the UI

Signatures (from `next/dist/server/web/spec-extension/revalidate.d.ts`) [verified]:
```ts
revalidateTag(tag: string, profile: string | { expire?: number }): undefined   // 2nd arg REQUIRED (1-arg form deprecated → TS error, runtime warning)
updateTag(tag: string): undefined          // Server Actions only (throws in route handlers)
refresh(): void                            // Server Actions only (throws elsewhere)
revalidatePath(originalPath: string, type?: 'layout' | 'page'): undefined
```
Source behaviour (`revalidate.js`, `action-handler.js`, `server-action-reducer.js`) [verified]:
- `revalidateTag(tag, 'max')` → stale-while-revalidate; **does not set `pathWasRevalidated`** ("so that server actions don't pull their own writes") → **no `x-action-revalidated` header → current page is NOT re-rendered**.
- `updateTag(tag)`, `revalidatePath(p)`, `revalidateTag(tag, { expire: 0 })`, and cookie mutation → `x-action-revalidated: 1` (StaticAndDynamic): action response carries a fresh RSC tree; client evicts BFCache **and the whole prefetch cache**.
- `refresh()` → `x-action-revalidated: 2` (DynamicOnly): re-renders current route (FreshnessPolicy.RefreshAll, **layouts included**), evicts BFCache, keeps prefetch cache; touches no server cache.

**Empirical test** (production standalone, page with Suspense streaming + 12 KB filler; `inval-check.mjs`) [verified]:

| Server action calls | Current page after action | `x-action-revalidated` |
|---|---|---|
| nothing | **stale** | none |
| `revalidateTag('project:1','max')` | **stale** | none |
| `updateTag('project:1')` | fresh | 1 |
| `revalidatePath('/stream')` | fresh | 1 |
| `refresh()` | fresh (root-layout data too) | 2 |

Recommendation for this app (no `'use cache'`, every page dynamic because the root layout reads `headers()`):
1. Server actions that change data shown by **server components** (sidebar in `(app)/layout.tsx`, page headers, lists rendered on the server) → call **`refresh()`** at the end (after audit). If the team ever adds `'use cache'` + `cacheTag`, switch to `updateTag(tag)` (read-your-writes).
2. Views fed by **TanStack Query** (grid/workload/search via route handlers) are unaffected by Next caches: update them from the action result (`setQueryData`) or `queryClient.invalidateQueries(...)` on the client.
3. Rewrite SPEC §7.3's `revalidateTag(\`project:${id}\`)` as `refresh()` (record in PROGRESS › Decisions/Deviations: "revalidateTag requires a profile in Next 16 and does not give read-your-writes").
4. Other routes are fetched fresh on navigation (`staleTimes.dynamic` default **0**), but **shared layouts are not refetched on navigation** — hence (1). [verified: `staleTimes.md`, config dump]
5. Prefer server-side `refresh()` over client `router.refresh()` (see open issue #99028 in §11).

### 2.4 `cacheComponents` / `'use cache'` — keep OFF
- Docs (CSP guide): nonce CSP ⇒ **all pages must be dynamically rendered; "Partial Prerendering (PPR) is incompatible with nonce-based CSP"**. `cacheComponents: true` makes PPR the default and can surface build errors for uncached data outside `<Suspense>`; also keeps previous routes mounted in `<Activity hidden>` (changes unmount/lock semantics for the editor lock heartbeat). [verified docs `cacheComponents.md`, `content-security-policy.md`]
- Config dump of our build shows `cacheComponents: false`, `staleTimes: { dynamic: 0, static: 300 }`. [verified]

### 2.5 Route handlers
- *"Route Handlers are not cached by default. You can, however, opt into caching for GET methods"* (`export const dynamic = 'force-static'`). [verified docs `15-route-handlers.md`; build output shows `ƒ /api/ping`]
- `updateTag`/`refresh` throw inside route handlers; use `revalidateTag(tag, { expire: 0 })` there if ever needed. [verified source]
- Server Action body limit: **1 MB default** (`experimental.serverActions.bodySizeLimit`), CSRF: Origin host must equal `x-forwarded-host`/`host` (else configure `serverActions.allowedOrigins`). Relevant for BlockNote page saves via server action and for reverse proxies that rewrite Host. [verified docs `serverActions.md`]

### 2.6 `next dev` / `next build` behaviours that matter for multi-agent work
- **`next dev` auto-writes agent files (16.3+).** When an AI agent is detected (it was, under Claude Code) and no managed block exists, `next dev` upserts `<!-- BEGIN:nextjs-agent-rules --> … <!-- END:nextjs-agent-rules -->`: if `CLAUDE.md` exists and `AGENTS.md` doesn't, **it appends the block to CLAUDE.md**; if neither exists it creates `AGENTS.md` + `CLAUDE.md` (`@AGENTS.md`). Opt-out: `agentRules: false` in next.config (typed in `NextConfig`, default true). If `AGENTS.md` already contains the exact current block, nothing is written. [verified: `server/lib/generate-agent-files.js`, `start-server.js` l.418, observed "✓ Generated AGENTS.md and CLAUDE.md for AI agents"]
  → Plan: in M0 either set `agentRules: false`, or commit an `AGENTS.md` containing the exact block (and optionally reference it from CLAUDE.md) so the tree stays clean.
- **create-next-app** also writes AGENTS.md/CLAUDE.md unless `--no-agents-md`. [verified flag list]
- **Single `next dev` per checkout:** writes `.next/dev/lock` (`{"pid","port","hostname","appUrl","startedAt"}`); a second `next dev` exits with *"⨯ Another next dev server is already running."* + URL/PID/log path `.next/dev/logs/next-development.log`. [verified]
- **Single `next build` per checkout:** concurrent build fails fast: *"⨯ Another next build process is already running."* (exit 1). `next dev` (`.next/dev`) and `next build` (`.next`) can run concurrently. → multi-agent plan: serialize builds (one gatekeeper) or use separate git worktrees. [verified]
- Dev forwards browser console errors to the terminal (`logging.browserToTerminal: 'warn'` default) and exposes an MCP endpoint `/_next/mcp` (`get_compilation_issues`, `compile_route`). [verified config dump + docs `ai-agents.md`]

---

## 3. Build & Docker (`output: 'standalone'`)

Verified end-to-end (Docker 29.5, `node:22-alpine`, linux/arm64): image built in ~80 s cold, container ran as non-root, `HEALTHCHECK` → `healthy`, page 200.

Facts [verified]:
- `next build` uses **Turbopack by default** (`▲ Next.js 16.3.6 (Turbopack)`); opt out with `next build --webpack`; a custom `webpack` config makes a Turbopack build fail. `next build` **no longer lints**. Build output no longer prints size/First Load JS.
- Standalone `server.js`: `const hostname = process.env.HOSTNAME || '0.0.0.0'`, `PORT` default 3000, `KEEP_ALIVE_TIMEOUT` env. Docker injects `HOSTNAME=<container id>`, so **set `ENV HOSTNAME=0.0.0.0`** (official example does the same). Standalone does **not** copy `public/` or `.next/static/` → copy manually.
- Standalone with pnpm contains `node_modules/.pnpm/*` incl. `sharp@0.35.5` + `@img/sharp-*` (loads fine via next's resolution; vips 8.18.7). Standalone ≈ 42 MB; final Alpine image 293 MB.
- `npm install -g pnpm@12.8.1` works inside `node:22-alpine` (native `@pnpm/exe.linux-arm64-musl`). With `PNPM_HOME=/pnpm` the store is **`/pnpm/store/v11`** → cache-mount that path (the official example's `/root/.local/share/pnpm/store` only applies without PNPM_HOME).
- Because `devEngines.runtime` is in package.json, `pnpm install` inside Docker also downloads **Node 22.23.3 musl** from `unofficial-builds.nodejs.org` and `pnpm build` runs on it (worked; needs network at build time only).
- Official `examples/with-docker` (canary) uses Node 24 slim + corepack + `USER node` + `ENV HOSTNAME="0.0.0.0"`. [verified: raw GitHub]

Recommended Dockerfile → §12.10. Additional [likely] items: create `/data/uploads` owned by the runtime user before `USER` (named volumes copy image ownership on first mount); add a `GET /api/health` route (excluded from proxy) for the healthcheck; `.dockerignore` must exclude `.env*`, `node_modules`, `.next`, `uploads`, `backups`, `.git`, `test-results`, `playwright-report`.

---

## 4. Lint & format

- **`next lint` is removed** in 16 and the `eslint` key in next.config is removed; codemod `next-lint-to-eslint-cli`. [verified docs]
- create-next-app@16.3.x template (`eslint.config.mjs`) [verified]:
  ```js
  import { defineConfig, globalIgnores } from 'eslint/config'
  import nextVitals from 'eslint-config-next/core-web-vitals'
  import nextTs from 'eslint-config-next/typescript'
  export default defineConfig([...nextVitals, ...nextTs, globalIgnores(['.next/**','out/**','build/**','next-env.d.ts'])])
  ```
- **ESLint 10 + eslint-config-next 16.3.6 crashes**: `TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function` (eslint-plugin-react 7.37.5 `util/version.js`). Workaround that made it run on the sample: add `{ settings: { react: { version: '19.3' } } }` — but `pnpm peers check` still reports unmet `eslint` peers for eslint-plugin-import/jsx-a11y/react. → **Use ESLint 9.39.5** (what create-next-app pins, `"eslint": "^9"`). [verified]
- Combining with **type-aware** typescript-eslint works (one shared `typescript-eslint@8.71.0`, no plugin-redefinition error; ~4 s on the sample) [verified]:
  ```js
  { files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } }
  ```
  It immediately flags `@typescript-eslint/require-await` on server actions/route handlers without `await` → turn that rule off (server actions must be `async`).
- eslint-config-next enables **eslint-plugin-react-hooks 7.1.1 `recommended`**, i.e. React-Compiler-derived rules **as errors**: `refs` (no `ref.current` reads during render), `set-state-in-effect`, `purity` (no `Date.now()`/`Math.random()` in render), `immutability`, `static-components`, `use-memo`, `preserve-manual-memoization`, `globals`, `error-boundaries`, `set-state-in-render`, `config`, `gating`; warnings: `exhaustive-deps`, **`incompatible-library`** (e.g. TanStack Virtual), `unsupported-syntax`. Grid/editor code must be written accordingly; CLAUDE.md requires a reason comment on any `eslint-disable`. [verified by loading the plugin's `configs.recommended.rules`]
- Prettier: `import prettier from 'eslint-config-prettier/flat'` last in the array. [verified]
- `jsx-a11y`, `import` plugins are included by eslint-config-next. `unrs-resolver` postinstall is not needed (create-next-app sets `allowBuilds: unrs-resolver: false`; lint worked). [verified]

---

## 5. TypeScript

- Next 16 minimum TS 5.1. `next build` runs the **project-local `tsc` CLI** by default (`experimental.useTypeScriptCli: true`), which is how Next supports **TS 7** (no JS API). But typescript-eslint cannot use TS 7 → **pin `typescript@~6.0.3`**. [verified docs `useTypeScriptCli.md`, peer deps]
- TS 6.0 default changes (release notes, devblogs) [likely]: `strict: true` default; `module: esnext`; floating `target` (es2025); **`types: []`** (no auto-inclusion of `@types/*` → add `"types": ["node"]`); `noUncheckedSideEffectImports: true` (CSS side-effect imports are fine because Next declares `declare module '*.css' {}` — verified in `next/types/global.d.ts`); `baseUrl` deprecated (use `paths` only); `moduleResolution: node10` deprecated; `esModuleInterop` always on; dom lib includes iterable.
- Our tsconfig (§12.4) with `noUncheckedIndexedAccess` typechecked the MUI/BlockNote sample cleanly with TS 6.0.3. [verified]

---

## 6. Thai fonts (self-hosted, offline)

### 6.1 Packages & files [verified]
| Package | Family | Weights | Styles | Subsets | Variable | License |
|---|---|---|---|---|---|---|
| `@fontsource/ibm-plex-sans-thai@5.3.0` | IBM Plex Sans Thai | 100–700 | normal only | cyrillic-ext, latin, latin-ext, thai | no | OFL-1.1 (`Copyright 2019 IBM Corp.`) |
| `@fontsource/noto-sans-thai@5.3.0` | Noto Sans Thai | 100–900 | normal | latin, latin-ext, thai | (static files) | OFL-1.1 (`Copyright 2022 The Noto Project Authors`) |
| `@fontsource-variable/noto-sans-thai@5.3.0` | "Noto Sans Thai Variable" | wght 100–900, wdth 62.5–100 | normal | latin, latin-ext, thai | yes | OFL-1.1 |

File paths: `node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-<subset>-<weight>-normal.woff2` (e.g. `…-thai-400-normal.woff2` 11.8 KB, `…-latin-400-normal.woff2` 17.7 KB). Variable Noto: `…/files/noto-sans-thai-thai-wght-normal.woff2` (26.9 KB), `…-latin-wght-normal.woff2` (30.7 KB). Per-subset CSS entry points exist (`thai-400.css`, `latin-400.css`, `400.css`, `index.css`), each `@font-face` has a `unicode-range`; thai range: `U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC`; latin: `U+0000-00FF,U+0131,…,U+FFFD`.

### 6.2 `next/font/local` constraints [verified]
- `src` path is **relative to the file that calls `localFont`**; files can live anywhere (also `public/`). Relative paths into `node_modules/@fontsource/...` also work with pnpm's symlinked layout under Turbopack (tested) — but copying into the repo is more robust (commit with the OFL text).
- `src[]` items only accept `{ path, weight?, style? }`; `declarations` (e.g. `unicode-range`) apply to **all** faces of that call; `src`, `font-display`, `font-weight`, `font-style` cannot be set via `declarations`. ⇒ per-subset unicode-range inside one family is impossible → **use two families (latin + thai)** and compose the stack.
- The CSS variable value includes the fallback chain: with defaults you get `"plexLatin", "plexLatin Fallback", system-ui, sans-serif` — generic families would then sit **before** the Thai family (Safari's `system-ui` cascade could render Thai in Thonburi). With `adjustFontFallback: false` and no `fallback`, the variables are exactly `"plexLatin"` / `"plexThai"`, so the theme can order them correctly. CDP `CSS.getPlatformFontsForNode` confirmed all 48 glyphs of `สวัสดีตอนเช้า Cindy · พุธ 30 ก.ย. 2569 — Hello 123` render in **IBM Plex Sans Thai**.
- Preload: `preload` defaults to true → all listed files get `<link rel=preload>` (8 files ≈ 130 KB for 4 weights × 2 subsets; Link header carries the nonce). Limit weights to what the UI uses (e.g. 400/500/600/700 or just 400/600).

### 6.3 Wiring (verified code) → §12.7 (`src/app/fonts.ts`) and §12.8 (theme `typography.fontFamily`).
- BlockNote uses `--bn-font-family` (default `"Inter", "SF Pro Display", …`) — set it to the same stack on `.bn-container` and don't import `@blocknote/core/fonts/inter.css` (otherwise Thai text in the editor falls back to a system font). [verified CSS var in `@blocknote/react/src/editor/styles.css`]
- Alternative (simplest, but deviates from SPEC's "`next/font/local`"): `import '@fontsource/ibm-plex-sans-thai/400.css'` etc. in the root layout — keeps unicode-range subsetting natively, still offline/self-hosted. Record as a Decision if chosen. [likely]

---

## 7. Content-Security-Policy

### 7.1 How nonces work in Next 16 [verified docs + HTML inspection]
- Generate per request in **proxy**, set both the **request** header `Content-Security-Policy` (Next parses `'nonce-…'` from it during SSR) and `x-nonce`, and the **response** header.
- Next automatically puts the nonce on framework scripts, page chunks, inline flight scripts and its own inline styles, and on font `preload` Link headers. In our HTML: 13/13 `<script>` and 4/4 Emotion `<style>` tags carried the nonce; 0 SSR `style="…"` attributes on the tested page.
- Reading the nonce forces dynamic rendering (root layout `await headers()` ⇒ every route `ƒ`). Static/ISR/PPR are off — acceptable (auth app).
- Dev needs `'unsafe-eval'` (React debug stack reconstruction). HMR websocket: included `connect-src 'self' ws: wss:` in dev (no violations).

### 7.2 Recommended policies (both verified in Chromium: 0 violations, 0 console errors across MUI Button/Tooltip/TextField, DatePicker popup, dark-mode toggle, server actions, Suspense streaming, soft navigation, BlockNote editor + slash menu)

Production:
```
default-src 'self';
script-src 'self' 'nonce-{NONCE}';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self';
media-src 'self' blob:;
worker-src 'self' blob:;
frame-src 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
manifest-src 'self';
[upgrade-insecure-requests;]   ← only when served over HTTPS (e.g. SECURE_COOKIES=true)
```
Development: same + `script-src … 'unsafe-eval'` and `connect-src 'self' ws: wss:`.

Why these choices:
- **No `'strict-dynamic'`**: the app loads zero third-party scripts, so `'self'` + nonce already blocks injected inline and cross-origin scripts. `'strict-dynamic'` disables `'self'` and makes any Next nonce omission fatal — open issue **vercel/next.js#98015** (16.3.x): a `loading/template/error` boundary chunk imported only for side effects is emitted **without nonce** and blocked; a commenter reports it can make client navigations **hang forever**. Our repro with rendered client components in `loading.tsx` did not trigger it, but dropping `'strict-dynamic'` removes the class of failure. Full check passed with `script-src 'self' 'nonce-…'`. [verified run; issue read via GitHub API]
- **`style-src 'unsafe-inline'`**: a strict `style-src 'self' 'nonce-…'` + `style-src-attr 'unsafe-inline'` (MUI's own CSP guide recommends `style-src-elem` nonce + `style-src-attr 'unsafe-inline'`) broke BlockNote: 3 `style-src-elem` violations (TipTap/BlockNote injected `<style>` without nonce), placeholder CSS failed, ProseMirror white-space warning. It *can* be made clean (verified 0 violations) with: AppRouterCacheProvider `options.nonce`; `InitColorSchemeScript nonce` (if used); `useCreateBlockNote({ _tiptapOptions: { injectNonce: nonce } })` (underscore = internal API); and wrapping `<BlockNoteView>` in `<MantineProvider withCssVariables={false} getRootElement={() => undefined} getStyleNonce={() => nonce}>`. Untested editor flows (emoji picker, tables, color picker, drag handles, file panel) may still inject styles → treat strict styles as optional M11 hardening only.
- Note: when a nonce/hash is present in a directive, `'unsafe-inline'` in that directive is ignored by CSP2+ browsers — never mix nonce and `'unsafe-inline'` in `style-src`.
- **`upgrade-insecure-requests` breaks plain-HTTP LAN deployments** (SPEC `SECURE_COOKIES=false` case) — emit it only for HTTPS. [likely, standard browser behaviour]
- `api/*` responses are not covered by the proxy matcher: for `GET /api/files/:id` add per-response `Content-Security-Policy: default-src 'none'; sandbox` (plus SPEC's `nosniff`, `Content-Disposition`). [likely]
- Static headers via `next.config.ts headers()` (verified present on all responses): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`; `poweredByHeader: false`. HSTS only behind HTTPS (Caddy can add it).
- Add a Playwright guard: listen to `securitypolicyviolation` (via `addInitScript` + `exposeFunction`) and fail on any violation — pattern in `exp/csp-check.mjs`. [verified pattern works]

---

## 8. MUI v9 with Next 16 App Router

### 8.1 Provider setup [verified]
- Import path: **`@mui/material-nextjs/v16-appRouter`** (package exports `v13…v16-appRouter`; v16 re-exports the v13 implementation). MUI's web docs still show `v15-appRouter` with "use `v1X-appRouter` for Next.js v1X".
- `AppRouterCacheProvider` props: `options?: Partial<EmotionCacheOptions> & { enableCssLayer?: boolean }`, `CacheProvider?`, `children`. Key defaults to `'mui'`; `options.nonce` is applied to SSR `<style>` tags (via `useServerInsertedHTML`) **and** to Emotion's runtime-created `<style>` tags. `enableCssLayer: true` wraps every insert in `@layer mui {…}`.
- `createTheme` must live in a `'use client'` module (theme has functions). Providers = one `'use client'` component receiving the nonce (and theme mode) from the server layout.

### 8.2 Theme & dark mode [verified]
- `createTheme({ cssVariables: { colorSchemeSelector: 'class' }, colorSchemes: { light: {palette…}, dark: {palette…} }, typography: { fontFamily: … } }, thTH, pickersThTH)` → CSS vars `--mui-palette-*` on `:root`, overrides under **`.light` / `.dark`** (class toggled on `<html>`). Other selector forms: `'media' | 'data' | '.mode-%s' | '[data-mode-%s]'`. Options also: `cssVarPrefix`, `disableCssColorScheme`, `nativeColor`, `rootSelector`, `shouldSkipGeneratingVar`, `defaultColorScheme`.
- `ThemeProvider` props: `defaultMode?: 'light'|'dark'|'system'` (default `'system'`), **`storageManager?: StorageManager | null`** (default localStorage), `modeStorageKey` (`mui-mode`), `colorSchemeStorageKey`, `disableTransitionOnChange`, `noSsr`, `forceThemeRerender`, `colorSchemeNode`, `disableNestedContext`, `disableStyleSheetGeneration`.
- `InitColorSchemeScript` props: `defaultMode`, `attribute` (`'class' | 'data' | string`), `nonce`, storage keys, `colorSchemeNode`. It is an inline `<script>` reading **localStorage** — CLAUDE.md prefers `user_preferences` for UI prefs.
- **Flicker-free without localStorage/script (verified):** server reads the preference and renders `<html className={`${fonts} ${mode}`} suppressHydrationWarning>`; Providers use `<ThemeProvider theme={theme} defaultMode={mode} storageManager={null}>`. With page JS blocked, dark CSS vars already applied; after hydration `useColorScheme().mode === 'dark'`; toggling works; `Object.keys(localStorage)` → `[]`; no console errors. Persist toggles with a server action into `user_preferences`. (A `'system'` option would need InitColorSchemeScript or media-query CSS — simplest: offer light/dark only.)
- The InitColorSchemeScript path also verified (with `nonce`, `attribute="class"`); the Next-16-dev "Encountered a script tag…" console error from mui/material-ui#48595 did **not** reproduce with 9.4.0 + 16.3.6.
- `@mui/material/locale` exports **`thTH`** (Breadcrumbs, TablePagination, Rating, Autocomplete, Alert, Pagination labels; numbers via `Intl` th-TH). Pickers locale: `import { thTH } from '@mui/x-date-pickers/locales'` (Thai texts incl. `fieldYearPlaceholder: 'ป'…`). Library-provided strings are OK w.r.t. "all UI text in `src/i18n/th.ts`" (they are not in our components).

### 8.3 CSS layers, CSS Modules, CSS variables for the grid [verified]
- With `enableCssLayer`, MUI/Emotion styles are in `@layer mui`; **unlayered** CSS Modules always win over layered styles → no specificity fights. (If you want an explicit order: `@layer reset, mui, app;` in globals.css; not required.)
- Plain CSS can consume theme tokens: `border: 1px solid var(--mui-palette-divider); background: var(--mui-palette-background-paper); color: var(--mui-palette-text-primary);` and SPEC §8.7 tokens under `:root`/`.dark` in `globals.css` — verified colours switch when the `.dark` class toggles (cell bg → `rgb(18,18,18)`).
- For thousands of grid cells: plain elements + one CSS Module class + `data-*` attributes for states (over/nonworking/holiday/derived) — **no `sx`/`styled` per cell** (Emotion serializes per style object at runtime) [likely, standard MUI perf guidance]; use MUI only for chrome (toolbar, dialogs, menus). In JS use `theme.vars.palette.*` for var references.
- `enableCssLayer` shows empty duplicate class rules in **dev only** (mui#46947, harmless).

### 8.4 RSC boundaries [verified unless noted]
- All MUI components/icons ship `'use client'` → can be *rendered* from Server Components (e.g. `<Typography>` in a server page worked).
- Passing `next/link` to `component` from a Server Component fails (*"Functions cannot be passed directly to Client Components"*) → create `src/components/Link.tsx`: `'use client'; import NextLink from 'next/link'; export default NextLink` and use `<Button component={Link} href="/editor">` — verified.
- Open mui#48214: MUI client components passed **as prop values** from an RSC (e.g. `<Stack divider={<Divider/>}>`) resolve to `undefined` → wrap in a `'use client'` component. Plan rule: server components load data and render thin client components; keep MUI-heavy composition in client files. [likely/issue]
- `sx` objects are serializable from RSC; `sx={(theme) => …}` functions are not.

### 8.5 Icons & bundle [verified]
- Next 16.3 default config already sets `modularizeImports['@mui/icons-material'] = { transform: '@mui/icons-material/{{member}}' }` and `experimental.optimizePackageImports` includes `@mui/material`, `@mui/icons-material`, `date-fns` → barrel imports are fine in the Next build.
- **Vitest does not apply those transforms** → prefer path imports in app code (`import AddIcon from '@mui/icons-material/Add'`, `import Button from '@mui/material/Button'`) so unit tests don't load the 2000-icon barrel. [likely]

### 8.6 v9 API changes that break v5/v6-era code written from memory [verified: mui.com upgrade-to-v9 page]
- Browser targets: Chrome 117, Edge 121, Firefox 121, Safari 17.0 (fits SPEC "latest 2 versions").
- `components`/`componentsProps` → `slots`/`slotProps`; removed `TransitionComponent`, `PaperProps`, `BackdropComponent`, `BackdropProps`.
- TextField: `InputProps`→`slotProps.input`, `inputProps`→`slotProps.htmlInput`, `SelectProps`→`slotProps.select`, `InputLabelProps`→`slotProps.inputLabel`, `FormHelperTextProps`→`slotProps.formHelperText`.
- `GridLegacy` removed; `Grid` uses `size={{ xs: 12, md: 6 }}`, no `item`; `direction="column"` removed (use `Stack`).
- **System props removed** from Box/Stack/Typography/Grid/Link/… → `<Box sx={{ mt: 2 }}>`.
- Dialog/Modal `disableEscapeKeyDown` removed; Autocomplete `renderTags`→`renderValue`, `ChipProps`→`slotProps.chip`; ButtonBase Enter/Space click events bubble; MenuItem/Tab must be inside Menu/Tabs; Stepper renders `<ol>/<li>`; ListItemIcon min-width 36px; 23 legacy `*Outline` icon exports removed (`InfoOutline`→`InfoOutlined`); TablePagination numbers via Intl.
- `@mui/material@9.1.0` had `ERR_UNSUPPORTED_DIR_IMPORT` (mui#48636, fixed) → use ≥9.4.0.

---

## 9. MUI X Date Pickers & Buddhist-era display

- MIT (`@mui/x-date-pickers@9.14.0`): DatePicker, DateTimePicker, TimePicker, DateCalendar, MonthCalendar, YearCalendar, DateField/TimeField/DateTimeField, Desktop*/Mobile*/Static* variants, DigitalClock… **Pro-only** (`@mui/x-date-pickers-pro`, commercial): DateRangePicker, DateRangeCalendar, DateTimeRangePicker, TimeRangePicker, Single/MultiInput*RangeField, StaticDateRangePicker. → For leave ranges use **two DatePickers** (start/end) with `minDate`/`maxDate`. [verified by listing both packages]
- **`@mui/x-date-pickers/AdapterDayjsBuddhist`** (new in v9, MIT): extends `AdapterDayjs`, extends dayjs with `buddhistEra`, formats `year: 'BBBB'`, `keyboardDate: 'DD/MM/BBBB'`, `fullDate: 'D MMM BBBB'`; `getYear` = Gregorian+543; `parse` converts typed BE years back. Needs `import 'dayjs/locale/th'` + `adapterLocale="th"`. [verified source]
- Browser test: `value = dayjs('2026-09-30', 'YYYY-MM-DD')` → field shows **`30/09/2569`**, calendar header **`กันยายน 2569`**, weekday headers Thai. [verified]
- Edge conversion (plan dates stay strings, CLAUDE.md "no JS Date for plan dates"):
  ```tsx
  const value = iso ? dayjs(iso, 'YYYY-MM-DD') : null            // dayjs parses as local midnight
  onChange={(d) => setIso(d && d.isValid() ? d.format('YYYY-MM-DD') : null)}
  ```
  Both parse and format are local-time, so the round-trip is timezone-stable. Keep all date math in `src/domain/dates.ts` on strings.
- Alternative `<TextField type="date">` is not recommended: native display format/calendar depends on browser+OS locale (inconsistent BE/CE). [likely]

---

## 10. pnpm 12 & Node pinning

### 10.1 What pnpm 11/12 changed [verified: pnpm.io/blog/releases/11.0 + 12.0, pnpm CHANGELOG in package, experiments]
- pnpm 12 = Rust rewrite, commands/settings/lockfile format of 11 carried over (lockfileVersion `'9.0'`). Unknown keys in `pnpm-workspace.yaml` now **error** (`ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS`) when the project pins a pnpm version the running pnpm satisfies. `--frozen-lockfile false` removed (use `--no-frozen-lockfile`); `--resolution-only` removed.
- pnpm 11: **`.npmrc` is only for registry/auth**; all pnpm settings in `pnpm-workspace.yaml` (or `~/.config/pnpm/config.yaml`); `npm_config_*` env ignored (use `pnpm_config_*`); `pnpm` field in package.json no longer read.
- **Build scripts:** `onlyBuiltDependencies`, `neverBuiltDependencies`, `ignoredBuiltDependencies`, `onlyBuiltDependenciesFile`, `ignoreDepScripts` **removed** (silently ignored) → **`allowBuilds: { <pkg>: true|false }`**. **`strictDepBuilds: true` by default** → a non-interactive install with an undecided build script fails with `ERR_PNPM_IGNORED_BUILDS`; in CI/no-TTY pnpm does not add placeholders. Decide per package: `pnpm approve-builds <pkg>` / `pnpm approve-builds '!<pkg>'` (also non-interactive), `pnpm add --allow-build=<pkg>`.
- **`minimumReleaseAge` default 1440 min (non-strict)**: `pnpm add next@latest` resolved **16.3.6** (16.3.7 was 21.6 h old); explicitly pinning `next@16.3.7` succeeded and pnpm **auto-wrote `minimumReleaseAgeExclude`** (next + 9 `@next/*`) into `pnpm-workspace.yaml`. Setting `minimumReleaseAge` explicitly makes it **strict** (`minimumReleaseAgeStrict` true) → leave it unset.
- `useNodeVersion` removed → verified error: *"not recognized … "useNodeVersion" (did you mean "nodeVersion"?)"*. `nodeVersion` only affects engine checks.
- `verifyDepsBeforeRun: install` default (scripts auto-install if deps drift), `blockExoticSubdeps: true`, `optimisticRepeatInstall: true`, `pmOnFail: download` (packageManager pin is auto-downloaded).
- Store v11 at `~/Library/pnpm/store/v11` (mac) / `$PNPM_HOME/store/v11`.

### 10.2 Build approvals needed for this stack [verified with CI=1]
First `pnpm add -D …` failed: *Ignored build scripts: esbuild@0.18.20, esbuild@0.25.12, esbuild@0.28.2, unrs-resolver@1.12.2*. Working config (same as create-next-app for sharp/unrs-resolver):
```yaml
# pnpm-workspace.yaml
allowBuilds:
  esbuild: true         # drizzle-kit (@esbuild-kit), tsx, vite
  sharp: false          # sharp 0.35.5 has no install script; harmless explicit decision
  unrs-resolver: false  # eslint-import-resolver-typescript; prebuilt binding present
```
No other package in the planned stack requested builds (@parcel/watcher is not in the tree).

### 10.3 Pinning Node 22 on a Node 26 machine [verified]
```json
"packageManager": "pnpm@12.8.1",
"devEngines": { "runtime": { "name": "node", "version": "^22.23.0", "onFail": "download" } },
"engines": { "node": ">=22.13 <23" }
```
- `pnpm install` records `node@runtime:22.23.3` (variants for every OS incl. linux musl from unofficial-builds) and **all `pnpm <script>` / `pnpm exec` use Node 22.23.3** (`pnpm exec node -v` → `v22.23.3`; plain `node -v` → `v26.5.0`).
- `engines` + `engineStrict: true` **without** devEngines fails on Node 26 (`Unsupported engine … wanted {"node":">=22 <23"} (current 26.5.0)`); with devEngines, checks use the runtime Node.
- `.nvmrc` (`22`) is only informational here (pnpm's global `node` shim reads it only if pnpm global shims are set up and no devEngines exists).
- **npm/npx inside the repo break:** `npm exec`, `npm run`, `npx <pkg>`, even `npm view` → `EBADDEVENGINES Invalid semver version "^22.23.0" does not match "v26.5.0" for "runtime"`. → Rule for all agents: **use `pnpm exec <bin>`, `pnpm dlx <pkg>`, `pnpm <script>`; never `npx`/`npm` inside the repo; never bare `node` for project code (`pnpm exec node` / `pnpm exec tsx`).**

### 10.4 Installing pnpm without corepack [verified/likely]
- `npm install -g pnpm@12.8.1 --allow-scripts=pnpm` (npm 11.17's `allowScripts` is advisory: scripts still run but it warns; the package's preinstall links the native Mach-O binary — verified with a local install; the `--allow-scripts` flag is future-proofing). If scripts were blocked, the placeholder still runs pnpm through Node.
- Or standalone: `curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.8.1 sh -` (no Node needed). Or `npx get-pnpm` (needs Node ≥22.13). [likely: pnpm.io/installation]
- pnpm 12 supports Node 18/20/22/24/26 when installed from npm. Global commands refuse to run under `sudo`.

### 10.5 Exact M0 toolchain steps for this machine
```bash
# 0) prerequisites: Docker running; global Node 26 is fine.
npm install -g pnpm@12.8.1 --allow-scripts=pnpm && pnpm --version        # → 12.8.1

# 1) scaffold outside the repo (CLAUDE.md M0 note), non-interactive, no agent files
cd /tmp && rm -rf scaffold && CI=1 pnpm dlx create-next-app@16.3.7 scaffold \
  --ts --app --src-dir --eslint --no-tailwind --no-react-compiler --import-alias "@/*" \
  --use-pnpm --skip-install --disable-git --no-agents-md --empty --yes
#    (verified with 16.3.6: writes package.json with packageManager pnpm@12.8.1, next 16.3.6, react 19.2.8,
#     typescript ^5, @types/node ^20, eslint ^9, eslint-config-next; pnpm-workspace.yaml allowBuilds sharp/unrs-resolver false;
#     src/app/layout.tsx+page.tsx; eslint.config.mjs; tsconfig.json; .gitignore with `.env*` and `next-env.d.ts`)

# 2) copy without overwriting existing files (CLAUDE.md, SPEC.md, PROGRESS.md, docs/ stay untouched)
rsync -a --ignore-existing --exclude README.md /tmp/scaffold/ /Users/thammasorn.har/Desktop/plan-system/
cd /Users/thammasorn.har/Desktop/plan-system && git init   # if not yet a repo

# 3) edit package.json: devEngines.runtime + engines + scripts (§12.1); edit .gitignore (add !.env.example,
#    uploads/, backups/, test-results/, playwright-report/, blob-report/); tsconfig (§12.4); next.config.ts (§12.3);
#    eslint.config.mjs (§12.5); pnpm-workspace.yaml (§10.2)

# 4) install + pin exact versions (if a pinned version is <24h old pnpm adds minimumReleaseAgeExclude entries — commit them)
CI=1 pnpm install                                   # downloads Node 22.23.3 runtime on first run
pnpm add next@16.3.7 react@19.3.0 react-dom@19.3.0 @mui/material@9.4.0 @mui/icons-material@9.4.0 \
  @mui/material-nextjs@9.4.0 @emotion/react@11.14.0 @emotion/styled@11.14.1 @emotion/cache@11.14.0 \
  @mui/x-date-pickers@9.14.0 dayjs@1.11.23 @fontsource/ibm-plex-sans-thai@5.3.0
pnpm add -D typescript@6.0.3 @types/node@^22 @types/react@19.3.0 @types/react-dom@19.3.0 \
  eslint@9.39.5 eslint-config-next@16.3.7 typescript-eslint@8.71.0 prettier@3.9.9 eslint-config-prettier@10.1.8
# (+ vitest / playwright / drizzle etc. per the other research tracks)

# 5) browsers for e2e, then verify
pnpm exec playwright install chromium
pnpm exec node -v            # v22.23.3
pnpm typecheck && pnpm lint && pnpm build
```

---

## 11. Known incompatibilities / open issues (as of 2026-09-30)

| # | Issue | Impact / workaround | Confidence |
|---|---|---|---|
| 1 | ESLint 10 + eslint-config-next 16.3.x → `react/display-name: contextOrFilename.getFilename is not a function` | Use ESLint 9.39.5; or ESLint 10 + `settings.react.version` (unmet peers) | verified |
| 2 | TypeScript 7 (npm `latest`) vs typescript-eslint (`<6.1.0`) | Pin TS ~6.0.3 | verified |
| 3 | Next `revalidateTag(tag)` single-arg deprecated; `revalidateTag(tag,'max')` not read-your-writes | Use `refresh()` / `updateTag()` | verified |
| 4 | vercel/next.js#98015 (open): boundary chunk script without nonce with `'strict-dynamic'`; can hang soft navigations | Omit `'strict-dynamic'`; avoid side-effect-only `'use client'` imports in loading/error/template | verified (issue) + our config passes |
| 5 | vercel/next.js#99028 (open): client `router.refresh()` no-ops on streamed pages in 16.3.5+ prod | Use server-action `refresh()`/`updateTag` (verified working on streamed page); cover with e2e | verified (our test) / issue |
| 6 | vercel/next.js#97850 (open): Turbopack dev livelock on darwin-arm64 in pnpm **workspace monorepos** (deep graphs), fixed in canary (#96808) | Single-package repo not affected in our test; fallback `next dev --webpack` | likely |
| 7 | vercel/next.js#99340: route-handler code not preloaded on `next start` since 16.3 (first request pays module eval) | Minor cold start; warm-up request in healthcheck | likely |
| 8 | vercel/next.js#99331: empty `useServerInsertedHTML` results still re-render per streamed chunk (AppRouterCacheProvider uses it) | Minor perf | likely |
| 9 | mui#48214 (open): MUI client component passed as a prop from RSC → undefined | Client wrappers | likely |
| 10 | MUI `component={NextLink}` from RSC → "Functions cannot be passed directly to Client Components" | `'use client'` Link re-export | verified |
| 11 | BlockNote/TipTap inject `<style>` without nonce; Mantine `<style>` needs `getStyleNonce` | Keep `style-src 'unsafe-inline'` (or the strict recipe in §7.2) | verified |
| 12 | BlockNote warns viewport lacks `interactive-widget=resizes-content` | `export const viewport = { width:'device-width', initialScale:1, interactiveWidget:'resizes-content' }` (typed in Next) | verified |
| 13 | `next dev` appends managed block to CLAUDE.md | `agentRules:false` or pre-created AGENTS.md | verified |
| 14 | npm/npx in repo → EBADDEVENGINES | pnpm only | verified |
| 15 | pnpm minimumReleaseAge (1 day) hides fresh releases from `@latest` | Pin exact; accept auto `minimumReleaseAgeExclude` | verified |
| 16 | create-next-app `.gitignore` has `.env*` | add `!.env.example` | verified |
| 17 | `@blocknote/shadcn` requires Tailwind 4 peer; no MUI flavour of BlockNote | Use `@blocknote/mantine` (verified working inside the MUI app, CSS isolated via its own classes) | verified |
| 18 | Node 22 EOL 2027-04-30 | Stay on 22 per SPEC for MVP; note upgrade to 24 as future Decision | verified |

---

## 12. Recommended files (derived from the verified experiment)

### 12.1 `package.json` (relevant parts)
```json
{
  "name": "team-working-os",
  "private": true,
  "packageManager": "pnpm@12.8.1",
  "devEngines": { "runtime": { "name": "node", "version": "^22.23.0", "onFail": "download" } },
  "engines": { "node": ">=22.13 <23" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "next typegen && tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "check": "pnpm typecheck && pnpm lint && pnpm test"
  }
}
```

### 12.2 `pnpm-workspace.yaml`
```yaml
allowBuilds:
  esbuild: true
  sharp: false
  unrs-resolver: false
# do NOT set minimumReleaseAge explicitly (makes it strict); pnpm may append minimumReleaseAgeExclude entries.
```

### 12.3 `next.config.ts`
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false, // or keep default and commit an AGENTS.md with the managed block (see §2.6)
  // typedRoutes: true,                       // optional
  // experimental: { serverActions: { bodySizeLimit: '2mb' } }, // if page saves go through server actions
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }]
  },
}
export default nextConfig
```

### 12.4 `tsconfig.json` (TS 6.0.3, verified)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "types": ["node"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.mts"],
  "exclude": ["node_modules"]
}
```
(`"types": ["node"]` added for TS 6's `types: []` default — [likely]; the experiment passed without it because `next-env.d.ts` pulls node types; add `"vitest/globals"` only if Vitest `globals: true` is used.)

### 12.5 `eslint.config.mjs` (verified with ESLint 9.39.5)
```js
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/require-await': 'off',               // server actions / route handlers must be async
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true }],
    },
  },
  prettier,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**', 'playwright-report/**', 'test-results/**']),
])
```

### 12.6 `src/proxy.ts` (verified: build + curl + Playwright)
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const PUBLIC_PATHS = ['/login']

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  const https = process.env.SECURE_COOKIES === 'true'   // read at runtime in the Node proxy (verified with other env toggles)
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'${isDev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  // Optimistic check only (cookie presence). Real checks: requireUser()/authz in every page, action, route handler.
  if (!isPublic && getSessionCookie(request) === null) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname + search)}`   // login must only accept relative `next`
    return NextResponse.redirect(url)
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      // /api excluded: route handlers do their own auth; avoids 10 MB proxy body buffering on uploads
      source: '/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
```

### 12.7 `src/app/fonts.ts` (verified rendering)
```ts
import localFont from 'next/font/local'
// IBM Plex Sans Thai (OFL-1.1), copied from @fontsource/ibm-plex-sans-thai@5.3.0/files → src/app/fonts/ (+ OFL text)
export const plexLatin = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-thai-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-latin',
  display: 'swap',
  adjustFontFallback: false,   // keep the variable = '"plexLatin"' so the theme controls the fallback order
})
export const plexThai = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-thai-thai-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-thai-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-thai-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-thai-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-thai',
  display: 'swap',
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC' }],
})
```

### 12.8 `src/theme.ts` + `src/app/providers.tsx` + `src/app/layout.tsx` (verified)
```ts
// src/theme.ts
'use client'
import { createTheme } from '@mui/material/styles'
import { thTH } from '@mui/material/locale'
import { thTH as pickersThTH } from '@mui/x-date-pickers/locales'
export const theme = createTheme(
  {
    cssVariables: { colorSchemeSelector: 'class' },           // → .light / .dark on <html>
    colorSchemes: {
      light: { palette: { primary: { main: '#2F5597' }, secondary: { main: '#1F3864' } } },
      dark:  { palette: { primary: { main: '#8FAADC' }, secondary: { main: '#D9E2F3' } } },
    },
    typography: { fontFamily: 'var(--font-plex-latin), var(--font-plex-thai), system-ui, sans-serif' },
  },
  thTH,
  pickersThTH,
)
```
```tsx
// src/app/providers.tsx
'use client'
import * as React from 'react'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjsBuddhist } from '@mui/x-date-pickers/AdapterDayjsBuddhist'
import 'dayjs/locale/th'
import { theme } from '@/theme'

export function Providers({ nonce, mode, children }: { nonce: string | undefined; mode: 'light' | 'dark'; children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui', enableCssLayer: true, ...(nonce ? { nonce } : {}) }}>
      <ThemeProvider theme={theme} defaultMode={mode} storageManager={null}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">{children}</LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
```
```tsx
// src/app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { plexLatin, plexThai } from './fonts'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = { title: '…' }   // text from src/i18n/th.ts
export const viewport: Viewport = { width: 'device-width', initialScale: 1, interactiveWidget: 'resizes-content' }

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const mode: 'light' | 'dark' = 'light' // M1+: read user_preferences.theme for the session user
  return (
    <html lang="th" className={`${plexLatin.variable} ${plexThai.variable} ${mode}`} suppressHydrationWarning>
      <body><Providers nonce={nonce} mode={mode}>{children}</Providers></body>
    </html>
  )
}
```
```css
/* src/app/globals.css — SPEC §8.7 tokens; .dark matches colorSchemeSelector 'class' */
:root { --brand-navy:#1F3864; /* … */ --load-over-bg:#FFC7CE; --load-over-fg:#9C0006; }
.dark { /* redefine the same tokens */ }
.bn-container { --bn-font-family: var(--font-plex-latin), var(--font-plex-thai), system-ui, sans-serif; }
```
```tsx
// src/components/Link.tsx
'use client'
import NextLink from 'next/link'
export default NextLink
```

### 12.9 Grid cell CSS Module (verified)
```css
.cell { border: 1px solid var(--mui-palette-divider); color: var(--mui-palette-text-primary);
        background: var(--mui-palette-background-paper); font-variant-numeric: tabular-nums; }
.cell[data-over='true'] { background: var(--load-over-bg); color: var(--load-over-fg); }
.cell[data-nonworking='true'] { background: var(--nonworking); }
```

### 12.10 `docker/Dockerfile` (verified shape; `/pnpm/store` cache path and uploads dir are small adjustments)
```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12.8.1 && pnpm --version
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store CI=1 pnpm install --frozen-lockfile

# builder is also used by the `migrate` service (full deps + scripts + drizzle). NB: Dockerfile has no inline comments.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN CI=1 pnpm build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /data/uploads && chown nextjs:nodejs /data/uploads
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
```

---

## 13. Evidence index (what was executed)
- `npm view` of every package listed in §1 (dist-tags, time, engines, peerDependencies).
- `node_modules/next/dist/docs/**` (16.3.6): `upgrading/version-16.md`, `file-conventions/proxy.md`, `middleware.md`, `functions/{revalidateTag,updateTag,refresh,revalidatePath}.md`, `guides/content-security-policy.md`, `getting-started/13-fonts.md`, `components/font.md`, `config/eslint.md`, `config/typescript.md`, `next-config-js/{cacheComponents,staleTimes,useTypeScriptCli,output,optimizePackageImports,proxyClientMaxBodySize,serverActions}.md`, `guides/ai-agents.md`.
- Source: `next/dist/server/web/spec-extension/revalidate.js`, `server/app-render/action-handler.js` (`addRevalidationHeader`), `client/components/router-reducer/reducers/server-action-reducer.js`, `server/config.js` (modularizeImports/optimizePackageImports), `server/lib/generate-agent-files.js`, `server/lib/start-server.js`, standalone `server.js`; `@mui/material-nextjs/v13-appRouter/appRouterV13.{d.ts,mjs}`; `@mui/material/styles/{ThemeProvider,createThemeWithVars}.d.ts`, `InitColorSchemeScript.d.ts`, `locale/thTH.mjs`; `@mui/x-date-pickers/AdapterDayjsBuddhist/*`, `locales/thTH.mjs`; `better-auth/dist/cookies/index.{d.mts,mjs}`; `@blocknote/mantine/dist/blocknote-mantine.js`, `@blocknote/core/dist/extensions-*.js`; `@fontsource/*/{metadata.json,*.css,files/}`; `eslint-config-next/dist/index.js`; `eslint-plugin-react-hooks` configs; `create-next-app@16.3.7` templates.
- Executed: pnpm 12.8.1 install/add/frozen install (CI=1) with devEngines runtime; npm/npx EBADDEVENGINES; `useNodeVersion`/`engineStrict` errors; minimumReleaseAge behaviour; create-next-app non-interactive scaffold; `next build` (Turbopack) ×10; standalone server + curl; Playwright Chromium checks (`csp-check.mjs`, `font-check.mjs` via CDP, `stream-check.mjs`, `inval-check.mjs`, `layout-check.mjs`, `mode-check.mjs`); `next dev` + lock/second instance; concurrent `next build`; ESLint 9 and ESLint 10 runs; `tsc` clean-checkout typegen test; Docker build/run/healthcheck (container and images removed afterwards).
- Web: pnpm.io blog 11.0 / 12.0, pnpm.io/installation, pnpm.io/package_json, mui.com Next.js integration + CSP guide + upgrade-to-v9, eslint.org/version-support, devblogs TypeScript 6.0 announcement, GitHub issues via API (mui#48595, #48214, #46947, #48636; next#98015, #97850, #99028, #99331, #99340), raw next.js `examples/with-docker/Dockerfile`.

## 14. Remaining uncertainties
- `"types": ["node"]` necessity under TS 6 in this exact setup (experiment passed without it) — harmless to add. [uncertain→likely]
- Whether Next 16.3.7 (not 16.3.6) changes anything relevant — all runtime experiments used 16.3.6 because 16.3.7 was inside pnpm's 24 h window; 16.3.7 is a patch release. [likely no difference]
- Strict style CSP beyond the tested editor flows. [uncertain]
- Safari rendering of the two-family font stack (only Chromium tested; ordering was fixed so Safari should use plexThai for Thai). [likely]
