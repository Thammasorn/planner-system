# M0 — Scaffold

> Depends on: nothing (first milestone; no git history yet) · SPEC: §7.1, §7.2, §8.1 (shell only), §8.6 (`Cmd+\`), §8.7, §8.8, §8.9, §9 (offline, security headers), §10.1–§10.3 (dev DB + env), §11 (tooling, coverage), §12 M0 · Owner-visible result: `pnpm dev` opens a Thai app shell (self-hosted IBM Plex Sans Thai, collapsible sidebar, `/home` placeholder) behind a nonce CSP, and `pnpm check` + the e2e smoke are green on a strict toolchain with a dev Postgres.

---

## 1. Goal and scope

M0 builds the empty but strict house every later milestone moves into: toolchain pinned per PLAN §1.2, configs per PLAN §3.3, a dev Postgres with the extensions migration, the Vitest three-project harness (unit / ui / integration on per-worker template DBs), the Playwright harness against a production build, the CSP/security-header proxy, and the Thai UI shell (fonts, tokens, MUI theme, providers, sidebar, `/home` placeholder). No business feature, no table besides extensions, no auth.

### 1.1 In scope

SPEC §12 M0 has no FR/BR/AC ids. The rows below are the SPEC §12 M0 bullets plus the un-numbered SPEC items that `plan/research/r7-traceability.md` places in M0 (ids from r7 §A), and the parts PLAN §1.4 assigns to M0.

| ID | SPEC | Requirement | Implemented in | Tested by |
|---|---|---|---|---|
| SCAF-01 | §12 M0, §7.1 | Next.js App Router (`output: 'standalone'`), TS strict + `noUncheckedIndexedAccess`, MUI 9, ESLint flat + Prettier, Vitest, Playwright | S0.3–S0.8 | G0/G2 `pnpm check`; `e2e/m0-smoke.spec.ts` |
| SCAF-02 | §12 M0 | Drizzle + postgres.js + drizzle-kit; `docker-compose.dev.yml` (Postgres only); scripts `db:up`, `db:migrate`, `db:studio` (+ `db:generate`, `db:down`) | S0.11–S0.13, S1.2 | `src/server/db/schema.int.test.ts`, `src/server/db/client.int.test.ts`, G2 `pnpm db:generate` → "No schema changes" |
| SCAF-03 | §12 M0 | `src/i18n/th.ts`, empty layout + sidebar placeholder, self-hosted Thai font | S0.10, S2.1, S2.6, S2.10 | `src/i18n/th.test.ts`; `AppShell.test.tsx`; e2e "home renders the Thai shell", "self-hosted Thai font" |
| SCAF-04 | §12 M0 | `pnpm check` = typecheck + lint + unit test (X40: + ui + integration + domain coverage) | S0.4, S0.13 | G0, G2 |
| SCAF-05 | §12 M0 | **Done when:** `pnpm dev` opens, `pnpm check` green, e2e smoke opens the first page | §6 G2 | §6 step I6 (`pnpm dev` smoke), G2, `e2e/m0-smoke.spec.ts` |
| TST-3 | §11.4 | E2E harness (production build, own DB, fixtures, page objects) | S3 | `pnpm exec playwright test --list`; G2 |
| UT-09 | §11.1 | `src/domain/**` coverage ≥ 95 % enforced by config (no domain code yet) | S0.13 | `vitest.config.ts` thresholds; G0 |
| A11Y-3 | §8.9 | Contrast ≥ 4.5:1 in light and dark for every token text pair (X51) | S2.2 | `src/lib/theme/contrast.test.ts` |
| UI-10 | §8.7 | Design tokens as CSS variables; dark mode redefines every token under `.dark` | S2.2, S2.3 | `contrast.test.ts` (same key sets, SPEC values) |
| UI-11 | §8.8 | All UI text in `src/i18n/th.ts`; ESLint bans Thai elsewhere | S0.7, S0.10 | lint (G0); `th.test.ts` |
| UI-12 | §8.8, D7 | Dates "30 ก.ย. 2569" (th-TH medium, B.E.), week headers "30/9" | S2.11 | `src/lib/format.test.ts` |
| UI-14 | §8.8 | IBM Plex Sans Thai via `next/font/local` (no Google Fonts) | S2.1 | e2e "self-hosted Thai font" |
| UI-01 (part) | §8.1 | Sidebar shell: data-driven nav, only implemented items (X33); collapsible | S2.10 | `AppShell.test.tsx`; e2e "sidebar collapses" |
| KEY-02 | §8.6 | `Cmd/Ctrl + \` collapses/expands the sidebar (X33), `e.code` first (X49) | S2.7, S2.8, S2.10 | `keys.test.ts`, `useHotkeys.test.tsx`, `AppShell.test.tsx`; e2e |
| NFR-07b (part) | §9 | Shell usable on tablet/mobile: temporary Drawer under 900 px | S2.10 | `AppShell.test.tsx`; e2e "narrow screens use a drawer" |
| NFR-08c | §9 | Security headers: nonce CSP, `frame-ancestors 'none'`, nosniff, referrer, permissions (HSTS only on HTTPS) | S1.4, S1.5 | `csp.test.ts`, `proxy.test.ts`; e2e "security headers and CSP nonce" + CSP guard on every test |
| NFR-09 | §9 | No CDN/external request at runtime | S2.1 (local fonts), S3.4 (guard) | e2e external-request guard on every test |
| DEP-07 (part) | §10.3 | `.env.example` documents every variable; `env.ts` validates (lazy) | S0.8, S1.1 | `src/server/env.test.ts` (incl. `.env.example` ⊇ schema keys) |
| DEP-16 | §12 M0, §10.1 | `docker/docker-compose.dev.yml`: `postgres:17` (Debian) + `pnpm db:up` | S0.11 | G0 (`pnpm db:up` healthy); `client.int.test.ts` (ctype `en_US.utf8`, TimeZone `UTC`) |
| DM-01 | §6.2 | Extensions `pgcrypto`, `pg_trgm`, `btree_gist` (custom migration `0000_extensions`, X10) | S0.12 | `schema.int.test.ts`; `client.int.test.ts` (Thai trigrams) |
| DM-18 (part) | §6.1 | `orderKey` customType (`text COLLATE "C"`, X48) + `timestamptz` helper; migrations only via drizzle-kit | S0.12 | `schema.test.ts`, `schema.int.test.ts` (ordering under C vs default collation) |
| ARC-01 | CLAUDE.md, §5 | `src/domain/**` purity + no `Date` (lint) | S0.7 | lint rule present (G0); exercised from M1 |
| ARC-02 | CLAUDE.md | No `any`, `@ts-ignore`, undescribed `eslint-disable` | S0.7 | lint (G0/G2) |
| ARC-03 | CLAUDE.md | No `localStorage`/`sessionStorage` (M0-D13) | S0.7 | lint (G0/G2) |
| X32 | PLAN §1.4 | `/` → `/home`; `/home` placeholder (greeting + date + links to implemented areas = none yet) | S2.6, S2.12 | e2e "root redirects to /home", "home renders the Thai shell" |
| X52 | PLAN §1.4 | DB sessions run in UTC | S0.11 | `client.int.test.ts` |
| PUBLIC-health | PLAN §3.4.3 | `GET /api/health` public DB ping (Docker/Playwright readiness) | S1.6 | `src/app/api/health/health.int.test.ts`; e2e "health endpoint" |

**SPEC §3.2 permission rows in scope:** none. M0 has no server action and no data route; the only route (`/api/health`) is public and reads no application data (M0-D11). The authz matrix harness starts in M1.

### 1.2 Out of scope (do NOT build in M0)

| Item | Lands in |
|---|---|
| Better Auth, login/logout, session validation + `/login?next=` redirect in `proxy.ts`, `mustChangePassword` gate | M1 |
| `src/server/clock.ts` (`serverNow`/`serverToday`, `APP_NOW` honoured), `TodayProvider`/`useToday` | M1 (X45; M0 only passes `APP_NOW` in the e2e env as a placeholder) |
| `src/domain/**` code (`types.ts`, `dates.ts`, `units.ts` part), `fast-check` | M1 (X01, X02) |
| Any table (auth, positions, schedules, `user_preferences`, `audit_log`, …), `db:reset`, `bootstrap`, `seed:*` | M1+ (X10, X11) |
| Persisted sidebar collapse + theme preference (`user_preferences`), light/dark/system switch | M1 (X05, X33) |
| `errors.ts`, `action.ts`, `route.ts` wrappers, `audit.ts`, `authz.ts`, authz matrix | M1 (first action/route consumers) |
| `UndoProvider`, `toastUndo`, Cmd+Z | M1 (X04) |
| `src/lib/query-keys.ts`, `invalidate.ts`, `src/lib/api.ts` (`getJson`, X83), sidebar projects | M2 (X18, X33) |
| `?` shortcut-help dialog + registry, `N` | M3 (X07) |
| `@mui/x-date-pickers`, `dayjs`, pickers `thTH` locale, `LocalizationProvider` | first milestone that renders a `DatePicker` (PLAN §3.9: `DateField` in M3) — M0-D16 |
| Command palette, Cmd+K, sidebar search button | M4 (X08) |
| BlockNote, `.bn-container` font variable, upload limits / `proxyClientMaxBodySize` | M4 |
| Home dashboard, greeting by Bangkok hour | M10 (X68) |
| Production `docker-compose.yml`, `Dockerfile`, `.dockerignore`, Caddy, `backup.sh`, README, strict style CSP, external-URL lint/grep | M11 |
| Anything in SPEC §1.4 or §13 | never in MVP |

### 1.3 Carried-in items

None — M0 is the first milestone.

---

## 2. Read first

- **SPEC:** §0–§3; §7.1, §7.2; §8.1 (sidebar shell only); §8.6 (`Cmd+\` row); §8.7; §8.8; §8.9; §9 (rows "ความปลอดภัย", "Offline network", "Browser"); §10.1–§10.3; §11.1 (coverage line), §11.4; §12 M0.
- **PLAN.md:** §1.2 (pins), §1.3 (Toolchain, Next 16.3, MUI 9.4, Drizzle, Testing, Client libraries → keyboard), §1.4 X10, X32, X33, X40, X45–X47, X49, X51–X53; §1.5; §2.3; §3.1–§3.3; §3.4.5; §3.6 (format.ts); §3.7; §3.8 (keyboard); §3.9; §3.12; §4.1, §4.2, §4.5, §4.7; §6 R9, R13, R16, R17.
- **Research:** `plan/research/r1-next-mui-tooling.md` (all; §10.5 toolchain steps, §12 files); `plan/research/r4-client-testing.md` facts 2–3, 23, 29, 31–36, 38, 42–55; `plan/research/r2-auth-db.md` §9.3–§9.4, §10.1–§10.2, §13; `plan/research/r6a-gaps-m0-m5.md` §3.1 (M0-01…M0-10), X-16, X-25, X-28; `plan/research/r7-traceability.md` §F "M0", §I `e2e/m0-smoke.spec.ts`, §K.7 contrast.
- **Verified snippets to start from:** `plan/research/snippets/r1/{package.json,pnpm-workspace.yaml,tsconfig.json,next.config.ts,src/proxy.ts,src/theme.ts,src/app/{layout.tsx,providers.tsx,fonts.ts,globals.css},src/components/Link.tsx,src/app/fonts/OFL-IBMPlexSansThai.txt,csp-check.mjs}`; `plan/research/snippets/r4/lint/{eslint.config.mjs,prettier.config.ts,prettierignore.txt}`; `plan/research/snippets/r4/vitest/{vitest.config.ts,tests/setup/*.ts}`; `plan/research/snippets/r4/playwright/playwright.config.ts`; `plan/research/snippets/r4/client/{components/ToasterHost.tsx,lib/query-client.ts,components/providers.tsx}`; `plan/research/snippets/r4/db/order-key.schema.ts`; `plan/research/snippets/r2/app/{drizzle.config.ts,drizzle/0000_extensions.sql,scripts/migrate.ts}`.
- **Next 16 docs** (after S0.5 installs them): `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, `…/error.md`, `…/not-found.md`, `01-app/02-guides/content-security-policy.md`, `…/components/font.md`.
- **docs/:** none needed (no seed data in M0).

---

## 3. Decisions for this milestone

### 3.1 PLAN §1.4 rulings that apply

| ID | SPEC ref | Decision (what it means in M0) | Rationale |
|---|---|---|---|
| X10 | §6.2, §6.1 | The only migration is the custom `drizzle/0000_extensions.sql` (pgcrypto, pg_trgm, btree_gist); `schema.ts` holds no table. | PLAN §1.4 ruling (tables land with their milestone). |
| X32 | §12 M0, FR-1101 | `src/app/page.tsx` redirects `/` → `/home`; `(app)/home` is a placeholder (greeting, date, empty state; no links because no other area exists yet). | PLAN §1.4 ruling; keeps the M0 smoke valid when M1 adds login. |
| X33 | §8.1, §8.6 | Sidebar nav is data-driven (`src/components/shell/nav.ts`); M0 lists only หน้าหลัก; `Cmd/Ctrl+\` collapses; state in memory only (persistence = M1). | PLAN §1.4 ruling (no dead links). |
| X40 | §12 M0, §11.2 | `pnpm check` runs typecheck + lint + all Vitest projects incl. integration + domain coverage; it needs `pnpm db:up`. | PLAN §1.4 ruling (superset of SPEC). |
| X41 | §3.4 | Unknown pages render the Thai `not-found.tsx` with status 404; authz-driven 404/403 start in M1. | PLAN §1.4 ruling. |
| X45 | §11.4 | No `clock.ts` in M0; the e2e web server already receives `ALLOW_TEST_HOOKS=1` and `APP_NOW`, so M1 only adds the consumer. | PLAN §1.4 ruling (clock lands in M1). |
| X46 | §11.4 | E2E runs against `next build && next start -p 3100`, base URL `http://localhost:3100`, DB `planner_e2e`, page objects in `e2e/pages/`; `resetDb`/`loginAs` arrive in M1. | PLAN §1.4 ruling. |
| X47 | §7.3, §8.8 | No Thai literals outside `src/i18n/**` (lint); Zod 4 APIs only (`z.url`, later `z.uuid`); the `refresh()` rule applies from the first action (M1). | PLAN §1.4 ruling. |
| X49 | §8.6 | `src/lib/keys.ts` matches `e.code` first, `e.key` as fallback; global shortcuts skip editable targets and `e.defaultPrevented`. | PLAN §1.4 ruling (Thai keyboard layout). |
| X51 | §8.7, §8.9 | **DEVIATION** from SPEC §8.7 values: `--load-light-fg` and `--tentative-fg` = `#8F5C00` (4.76:1) instead of `#9C6500` (4.12:1); a faded-text token `--faded-fg` that passes 4.5:1; dark counterparts for every token; unit-tested pairs (values: M0-D22). | §8.9 contrast ≥ 4.5:1 wins over the sample colour. |
| X52 | §6.5 | The dev DB runs sessions in UTC (`-c timezone=UTC`), logs in Asia/Bangkok. | PLAN §1.4 ruling (never derive plan dates in SQL). |
| X53 | CLAUDE.md | No `localStorage`; ESLint bans it (M0-D13). | PLAN §1.4 ruling. |
| X84 | §8.1 | M0 fixes the nav data model later milestones extend: `NavItem { id, href, label, icon: NavIcon (string key), managerOnly? }` + `PRIMARY_NAV` (top group) + `BOTTOM_NAV` (bottom group, empty in M0). M3 adds `badge?: NavBadge`; final orders are pinned in S2.10. | PLAN §1.4 ruling (one nav model for M1–M9). |
| X91 | §11.4 | `e2e/fixtures.ts` exports its CSP / external-request / page-error guards as **named functions** (the auto fixture calls them) so M11's `e2e/perf/fixtures.ts` imports instead of copying; `resetDb`/`loginAs` arrive in M1 with the X91 signature. | PLAN §1.4 ruling (test harness). |

### 3.2 New decisions

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M0-D1 | §7.1 Lint | Pin **ESLint `~9.39.5`** (EOL since 2026-08-06) with the validated `plan/research/snippets/r4/lint/eslint.config.mjs`; ESLint 10 later as its own Decision. | eslint-config-next 16.3.7's bundled plugins peer `eslint ^9`; ESLint 10 crashes eslint-plugin-react without a workaround (r1 §4, r4 fact 47). Simplest working option. |
| M0-D2 | §7.1 Language | Pin **TypeScript `~6.0.3`**, never 7.x; `types: ["node"]`, no `baseUrl`. | typescript-eslint 8.71 peers `typescript <6.1.0`; TS 7 has no JS API (r1 §5, r4 facts 2–3). |
| M0-D3 | §7.1 Runtime/PM | **pnpm 12.8.1** (`packageManager`), Node via `devEngines.runtime ^22.23.0` (`onFail: download`), `engines.node ">=22.22.2 <23"`, `.nvmrc` = 22. `npm`/`npx` are never used in the repo. | The machine has Node 26 and no corepack; devEngines makes every `pnpm run/exec` use Node 22 (r1 §10.3). |
| M0-D4 | §7.1, §7.2, §12 M0 | **DEVIATION** (already in `PROGRESS.md › Deviations`, owner decision OWN-2): MUI 9 + Emotion + CSS Modules instead of Tailwind v4 + shadcn/ui. Kickoff verifies the row exists; it is not duplicated. | Owner decision 2026-09-30. |
| M0-D5 | §12 M0 "`pnpm check` = typecheck + lint + unit test" | `pnpm check` is a **superset**: typecheck + lint + unit + ui + integration + domain coverage (X40). | Authz tests (DB) are part of every DoD; one command keeps the gate honest. |
| M0-D6 | §12 M0, X45 | **No `clock.ts` in M0.** The `/home` placeholder shows the request-time date in Asia/Bangkok via `formatThaiInstantDate(new Date())`; M1 switches it to `formatThaiDate(serverToday())` and updates `m0-smoke`. | X01/X45 put dates/clock in M1; a request-time label is the simplest correct placeholder. |
| M0-D7 | PLAN §5 M0 skeleton | Streams refined: **S0 also owns the dev DB compose, `drizzle.config.ts`, `schema.ts`, the `0000_extensions` migration, `scripts/{migrate.ts,lib/migrate.ts}`, the Vitest harness and `src/i18n/th.test.ts`** (skeleton had them in S1 / S3). S1 = runtime server pieces (env, db client, CSP proxy, health); S3 = Playwright only. | PLAN §2.3 rule 8: only S0 generates migrations; PLAN §2.2: G0 (`pnpm check` incl. integration) must be green after S0, which needs the harness and a DB. |
| M0-D8 | §8.7 dark mode, PLAN §3.9 | M0 renders `<html class="light">` always (no preference storage yet); no `InitColorSchemeScript`, `ThemeProvider storageManager={null}`. `system` resolution and the switch arrive with `user_preferences` in M1. | No localStorage (CLAUDE.md); flicker-free server class (r1 §8.2). Dark tokens exist and are tested now. |
| M0-D9 | §8.8 Font | **IBM Plex Sans Thai** (not Noto), weights 400/500/600/700, two `next/font/local` families (latin + thai, `adjustFontFallback: false`); `@fontsource/ibm-plex-sans-thai@5.3.0` is a devDependency used only as the file source; woff2 + OFL committed in `src/app/fonts/`. | Verified rendering incl. Safari fallback order (r1 §6); offline at runtime. |
| M0-D10 | §9 security headers | CSP = r1 §7.2 verified set: `default-src 'self'; script-src 'self' 'nonce-…'` (+`'unsafe-eval'` dev only, **no `'strict-dynamic'`**); `style-src 'self' 'unsafe-inline'`; `img-src 'self' blob: data:`; `font-src 'self'`; `connect-src 'self'` (+`ws: wss:` dev); `media-src 'self' blob:`; `worker-src 'self' blob:`; `frame-src 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `manifest-src 'self'`; `upgrade-insecure-requests` only when `SECURE_COOKIES=true`. Proxy also sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`, and HSTS (`max-age=31536000`) only when `SECURE_COOKIES=true`. | Superset of PLAN §1.3 that was verified with zero violations across MUI, pickers, BlockNote, sonner (r1 §7.2). |
| M0-D11 | §3.4 "every route handler calls authz" | `GET /api/health` is **public** and exempt from authz: it runs `select 1` only and returns `{ ok }` (no app data). | PLAN §3.4.3; Docker and Playwright readiness probes have no session. |
| M0-D12 | §8.6 "Cmd/Ctrl" | A hotkey's `mod` matches `metaKey || ctrlKey` on every platform (no OS sniffing). | Simplest; SPEC lists both; no conflicting browser shortcut for `Ctrl+\`. |
| M0-D13 | CLAUDE.md "no localStorage" | ESLint `no-restricted-globals` + `no-restricted-properties` ban `localStorage`/`sessionStorage` in all source. | Machine-enforced rule (r6a X-25 #4); preferences go to `user_preferences` (M1). |
| M0-D14 | CLAUDE.md "never overwrite docs" | `.prettierignore` also lists `CLAUDE.md SPEC.md PROGRESS.md PLAN.md tech-stack.md plan .claude docs`; ESLint ignores `plan/**`, `.claude/**`, `docs/**`; `tsconfig.json` excludes `plan`, `docs`, `.claude`. | `pnpm format` would otherwise rewrite protected docs; `plan/research/snippets/**/*.ts` would break typecheck and lint. |
| M0-D15 | §7.1 (new libraries) | M0 installs only: next, react, react-dom, @mui/material, @mui/icons-material, @mui/material-nextjs, @emotion/{react,styled,cache}, @tanstack/react-query, sonner, zod, drizzle-orm, postgres, server-only; dev: typescript, @types/*, eslint + eslint-config-next + typescript-eslint + @eslint-community/eslint-plugin-eslint-comments + eslint-config-prettier, prettier, vitest + @vitest/coverage-v8 + vite + @vitejs/plugin-react + jsdom, @testing-library/{react,dom,user-event,jest-dom}, @playwright/test, drizzle-kit, tsx, @fontsource/ibm-plex-sans-thai. Not named in SPEC §7.1 (tooling only, nothing ships to users): `@eslint-community/eslint-plugin-eslint-comments` (machine-enforces "eslint-disable needs a reason"), `server-only` (import guard), `@fontsource/ibm-plex-sans-thai` (font file source), `tsx` (scripts), `vite`/`@vitejs/plugin-react`/`jsdom`/`@vitest/coverage-v8` (Vitest peers), `@emotion/*` (MUI peers). | CLAUDE.md: new libraries need a Decision; only what M0 needs. All are pinned in PLAN §1.2. |
| M0-D16 | PLAN §1.2 date inputs, §3.9 | `@mui/x-date-pickers` + `dayjs` + pickers `thTH` + `LocalizationProvider` are **not** installed in M0; the first milestone that renders a `DatePicker` adds them to the theme and `AppProviders`. | Nothing in M0 uses them ("only what this milestone needs"). |
| M0-D17 | PLAN §4.2 | Vitest DB names carry a per-run id: template `planner_tpl_<run>`, workers `planner_t_<run>_w<VITEST_POOL_ID>`; teardown drops only its own. | Two concurrent `vitest` runs (stream G1 checks, integrator) must not drop each other's databases. |
| M0-D18 | PLAN §4.5 | The e2e DB is created/migrated **by the webServer command** (`pnpm exec tsx e2e/prepare-db.ts && …`) and again (idempotently) by `e2e/global-setup.ts`. No drop. | Playwright launches `webServer` (a plugin) before running `globalSetup`, and `/api/health` (the readiness URL) needs the DB; idempotent create-if-missing + migrate is correct in either order and with `reuseExistingServer`. |
| M0-D19 | §10.1, X52 | Dev compose binds `127.0.0.1:54329:5432`, uses `command: postgres -c timezone=UTC -c log_timezone=Asia/Bangkok` (no `TZ` env, which initdb would copy into `postgresql.conf`), healthcheck `pg_isready -h 127.0.0.1 -U planner -d planner` (TCP: the init-time server listens on the socket only). | X52 (DB in UTC), no LAN exposure of the dev DB, no false "healthy" during initdb. |
| M0-D20 | §10.3, PLAN §3.12 | `.env.example` documents **every** SPEC §10.3 variable + PLAN extras (comments on their own lines, not inline). `src/server/env.ts` in M0 validates only what M0 reads: `NODE_ENV`, `DATABASE_URL`, `SECURE_COOKIES`, `DB_POOL_MAX`; later milestones extend the schema (M1 auth/clock vars, M4 upload vars). | Lazy validation keeps `next build` working without secrets; the doc file is complete from day one. |
| M0-D21 | §8.8 "UI ภาษาไทยทั้งหมด" | Thai `not-found.tsx`, `error.tsx` and `global-error.tsx` replace Next's English defaults. | Next's built-in 404/500 pages are English. |
| M0-D22 | §8.7, X51 | Token values: SPEC light values except X51; added `--surface` (#FFFFFF / #121212) and `--faded-fg` (#5B6878 / #94A3B8). Dark values in S2.2. X51's example `#64748B` is **not** used: it gives 4.34:1 on `--nonworking` and 3.86:1 on `--holiday`. | Every text pair ≥ 4.5:1 on every surface it can appear on (computed). |
| M0-D23 | BR-04 | `format.ts` takes ISO date **strings** validated at runtime (`/^\d{4}-\d{2}-\d{2}$/` + real calendar date, else `RangeError`); M1 narrows the parameter type to `ISODate` from `src/domain/types.ts` (a type alias, non-breaking). | No domain module in M0 (X01). |
| M0-D24 | PLAN §3.4.3, §3.12 | `/api/health` sets `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` itself; the `route()` wrapper (M1) takes this over. Declared `dynamic = 'force-dynamic'` so `next build` never evaluates it. | No wrapper exists yet; build must not touch the DB. |
| M0-D25 | §7.2 (`drizzle/ … + 9999_triggers.sql`), §6.1 | **DEVIATION:** there is no hand-named `9999_triggers.sql`; extensions (M0), exclusion constraints (M5) and triggers (M6) are journaled custom migrations created with `pnpm exec drizzle-kit generate --custom --name=<n>`. | The Drizzle migrator runs only files listed in `drizzle/meta/_journal.json` (r2 §9.3; CLAUDE.md › DB already says so). |

---

## 4. Streams (machine-readable)

```json
{ "milestone": 0,
  "streams": [
    { "id": "S0", "title": "Toolchain, scaffold, configs, dev DB, migrations, test harness, i18n skeleton", "agent": "platform-engineer",
      "owns": ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".nvmrc", ".gitignore", ".env", ".env.example", ".prettierignore", "prettier.config.mjs", "eslint.config.mjs", "tsconfig.json", "next.config.ts", "next-env.d.ts", "vitest.config.ts", "drizzle.config.ts", "docker/docker-compose.dev.yml", "drizzle/**", "scripts/migrate.ts", "scripts/lib/migrate.ts", "src/server/db/schema.ts", "src/server/db/schema.test.ts", "src/server/db/schema.int.test.ts", "src/i18n/**", "src/lib/csp.ts", "src/app/layout.tsx", "src/app/page.tsx", "src/app/globals.css", "src/app/favicon.ico", "public/**", "tests/setup/**", "tests/stubs/**", "tests/helpers/db.ts"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Server runtime: env, lazy DB client, CSP proxy + security headers, health route", "agent": "platform-engineer",
      "owns": ["src/server/env.ts", "src/server/env.test.ts", "src/server/db/client.ts", "src/server/db/client.test.ts", "src/server/db/client.int.test.ts", "src/lib/csp.ts", "src/lib/csp.test.ts", "src/proxy.ts", "src/proxy.test.ts", "src/app/api/**", "scripts/lib/migrate.int.test.ts"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Thai UI shell: fonts, tokens, MUI theme, providers, layouts, sidebar + Cmd+\\, /home placeholder, format helpers", "agent": "frontend-engineer",
      "owns": ["src/app/layout.tsx", "src/app/page.tsx", "src/app/not-found.tsx", "src/app/error.tsx", "src/app/error.test.tsx", "src/app/global-error.tsx", "src/app/globals.css", "src/app/tokens.css", "src/app/fonts/**", "src/app/(app)/**", "src/components/**", "src/hooks/**", "src/lib/theme/**", "src/lib/format.ts", "src/lib/format.test.ts", "src/lib/keys.ts", "src/lib/keys.test.ts", "src/lib/query-client.ts", "src/lib/query-client.test.ts", "tests/helpers/render.tsx"],
      "dependsOn": ["S0"], "planSection": "5.S2" },
    { "id": "S3", "title": "E2E harness (production build, own DB, guards, page objects) + m0 smoke", "agent": "test-engineer",
      "owns": ["playwright.config.ts", "e2e/**"],
      "dependsOn": ["S0"], "planSection": "5.S3" }
  ],
  "e2e": ["e2e/m0-smoke.spec.ts"] }
```

Ownership notes: S1, S2 and S3 run concurrently after G0; their `owns` do not overlap. Files S0 creates as placeholders (`src/lib/csp.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`) are handed over to S1/S2 after G0. `src/i18n/th.ts` belongs to S0; during Build only S2 may **Edit** keys inside the M0 namespaces (`meta`, `common`, `nav`, `errors`, `home`) — S0 already creates every key this plan needs, so S2 normally adds none. S3 reads `th` and never edits it.

---

## 5. Step-by-step

### 5.S0 — Toolchain, scaffold, configs, dev DB, migrations, test harness, i18n skeleton (platform-engineer · root configs, `drizzle/**`, `docker/docker-compose.dev.yml`, `scripts/{migrate,lib/migrate}.ts`, `src/server/db/schema*.ts`, `src/i18n/**`, `src/lib/csp.ts` stub, `tests/{setup,stubs}/**`, `tests/helpers/db.ts`)

S0 runs **alone**. It is the only stream allowed to install packages, run `git init`, and generate migrations. It never runs `next dev` or `next build` (the integrator does in §6). All paths below are relative to the repo root `/Users/thammasorn.har/Desktop/plan-system`; use absolute paths in tool calls.

**S0.1 — Toolchain on this machine.**
```bash
docker info >/dev/null && docker compose version           # Docker 29 + Compose v5 must answer
npm install -g pnpm@12.8.1 --allow-scripts=pnpm             # global, OUTSIDE the repo (no corepack on Node 26)
pnpm --version                                              # → 12.8.1
```
Done-check: `pnpm --version` prints `12.8.1`. (This is the only `npm` command in the whole project; it runs before `devEngines` exists.)

**S0.2 — git init and protect the documents.**
```bash
cd /Users/thammasorn.har/Desktop/plan-system
test -d .git || git init -b main
shasum -a 256 CLAUDE.md SPEC.md PROGRESS.md PLAN.md tech-stack.md > "$TMPDIR/m0-protected.sha256"
find docs plan .claude -type f -print0 | sort -z | xargs -0 shasum -a 256 >> "$TMPDIR/m0-protected.sha256"
```
No commit (the first commit is the M0 close-out, §10). Done-check: `git status` works; the checksum file exists. S0.15 re-verifies it.

**S0.3 — Scaffold in a scratch dir and copy without overwriting.** (CLAUDE.md M0 note; flags verified in r1 §10.5 / r6a M0-02.) Run the block as **one** shell command (shell variables do not survive between tool calls).
```bash
SCRATCH="$(mktemp -d)"
cd "$SCRATCH" && CI=1 pnpm dlx create-next-app@16.3.7 scaffold \
  --ts --app --src-dir --eslint --no-tailwind --no-react-compiler --import-alias "@/*" \
  --use-pnpm --skip-install --disable-git --no-agents-md --empty --yes
ls -la "$SCRATCH/scaffold"     # must NOT contain CLAUDE.md or AGENTS.md (--no-agents-md)
# dry run first: nothing protected may appear in the list
rsync -an --itemize-changes --ignore-existing \
  --exclude CLAUDE.md --exclude AGENTS.md --exclude README.md --exclude SPEC.md --exclude PROGRESS.md \
  --exclude PLAN.md --exclude tech-stack.md --exclude 'plan/' --exclude 'docs/' --exclude '.claude/' --exclude '.git/' \
  "$SCRATCH/scaffold/" /Users/thammasorn.har/Desktop/plan-system/
# real copy (same flags without -n)
rsync -a --ignore-existing \
  --exclude CLAUDE.md --exclude AGENTS.md --exclude README.md --exclude SPEC.md --exclude PROGRESS.md \
  --exclude PLAN.md --exclude tech-stack.md --exclude 'plan/' --exclude 'docs/' --exclude '.claude/' --exclude '.git/' \
  "$SCRATCH/scaffold/" /Users/thammasorn.har/Desktop/plan-system/
rm -rf "$SCRATCH"
```
Then delete scaffold demo files if present: `public/*.svg`, `src/app/page.module.css`, any `src/app/**/*.module.css`. Keep `src/app/favicon.ico`, `.gitignore`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs` (all rewritten below). If the scaffold layout imports `next/font/google`, it is replaced in S0.9 (Google Fonts is forbidden, SPEC §8.8).
Done-check: `test ! -e AGENTS.md && test ! -e README.md`; `shasum -a 256 -c "$TMPDIR/m0-protected.sha256"` → every line `OK`.

**S0.4 — `package.json`, `.nvmrc`, `pnpm-workspace.yaml`, `next.config.ts` (before ANY `next` command).**

`next.config.ts` (complete; `agentRules: false` is what stops `next dev` from writing into `CLAUDE.md`, PLAN §1.3):
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false, // never let `next dev` write AGENTS.md / CLAUDE.md (PLAN.md §1.3, R17)
  outputFileTracingRoot: __dirname,
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // no images.remotePatterns, no cacheComponents, no 'use cache' (PLAN.md §3.3)
}

export default nextConfig
```
`.nvmrc`: `22`. `pnpm-workspace.yaml` (pnpm 12 reads settings only here; unknown keys are errors):
```yaml
allowBuilds:
  esbuild: true
  sharp: false
  unrs-resolver: false
# Do not set minimumReleaseAge (it would become strict). Commit any minimumReleaseAgeExclude pnpm appends.
```
`package.json` — replace the scaffold file completely with (versions = PLAN §1.2; exact where PLAN is exact):
```json
{
  "name": "team-working-os",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@12.8.1",
  "devEngines": { "runtime": { "name": "node", "version": "^22.23.0", "onFail": "download" } },
  "engines": { "node": ">=22.22.2 <23" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "next typegen && tsc --noEmit",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "test": "vitest run --coverage",
    "test:unit": "vitest run --project unit",
    "test:ui": "vitest run --project ui",
    "test:int": "vitest run --project integration",
    "test:e2e": "playwright test",
    "check": "pnpm typecheck && pnpm lint && pnpm test",
    "db:up": "docker compose -f docker/docker-compose.dev.yml up -d --wait",
    "db:down": "docker compose -f docker/docker-compose.dev.yml down",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx --env-file-if-exists=.env scripts/migrate.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@emotion/cache": "11.14.0",
    "@emotion/react": "11.14.0",
    "@emotion/styled": "11.14.1",
    "@mui/icons-material": "9.4.0",
    "@mui/material": "9.4.0",
    "@mui/material-nextjs": "9.4.0",
    "@tanstack/react-query": "5.104.0",
    "drizzle-orm": "0.45.3",
    "next": "16.3.7",
    "postgres": "3.4.9",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "server-only": "0.0.1",
    "sonner": "2.0.8",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@eslint-community/eslint-plugin-eslint-comments": "^4.8.1",
    "@fontsource/ibm-plex-sans-thai": "5.3.0",
    "@playwright/test": "~1.63.0",
    "@testing-library/dom": "10.4.2",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/node": "^22.20.4",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "@vitest/coverage-v8": "~5.0.2",
    "drizzle-kit": "0.31.11",
    "eslint": "~9.39.5",
    "eslint-config-next": "16.3.7",
    "eslint-config-prettier": "^10.1.8",
    "jsdom": "^30.1.1",
    "prettier": "3.9.9",
    "tsx": "^4.23.15",
    "typescript": "~6.0.3",
    "typescript-eslint": "8.71.0",
    "vite": "^8.3.1",
    "vitest": "~5.0.2"
  }
}
```
Scripts not listed (`db:reset`, `bootstrap`, `seed:*`, `import:holidays`, `perf`) are added by the milestone that first needs them (PLAN §3.2). If Next ever loads `next.config.ts` as ESM and `__dirname` is undefined, use `path.dirname(fileURLToPath(import.meta.url))` (same value). Done-check (before install): `python3 -c "import json;json.load(open('package.json'))"` succeeds and `grep -n "agentRules: false" next.config.ts` prints the line.

**S0.5 — One install, then browsers.**
```bash
cd /Users/thammasorn.har/Desktop/plan-system
CI=1 pnpm install                    # downloads Node 22.23.x runtime on first run; one install for all M0 deps
pnpm exec node -v                    # → v22.23.x  (bare `node -v` stays v26 — never use it for project code)
pnpm exec tsc -v                     # → Version 6.0.x
pnpm exec eslint -v                  # → v9.39.x
pnpm exec playwright install chromium
```
If install fails with `ERR_PNPM_IGNORED_BUILDS` for a package not in `allowBuilds`, add an explicit `true|false` entry and report it as a Decision (PLAN §1.3). Commit-relevant outputs: `pnpm-lock.yaml`, any `minimumReleaseAgeExclude` lines pnpm appended. Done-check: the four version commands print the expected majors.

**S0.6 — `tsconfig.json`** (base `plan/research/snippets/r1/tsconfig.json` + PLAN §3.3 + M0-D14):
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
    "noImplicitOverride": true,
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
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.mts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules", "plan", "docs", ".claude", "coverage", "playwright-report", "test-results"]
}
```
No `baseUrl` (TS 6 error TS5101). Done-check deferred to S0.15 (`pnpm typecheck`).

**S0.7 — `eslint.config.mjs`, `prettier.config.mjs`, `.prettierignore`.**
Copy `plan/research/snippets/r4/lint/eslint.config.mjs` **verbatim**, then make exactly these edits:
1. Header comment: "Pinned to ESLint 9.39 (M0-D1); the react version pin is kept so an ESLint 10 upgrade needs no config change."
2. Add, after block 5c, a block for M0-D13 (all JS/TS sources):
```js
  // 5d) No browser storage for data (CLAUDE.md > Dependencies and runtime; preferences live in user_preferences).
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use user_preferences (server) instead of localStorage (CLAUDE.md).' },
        { name: 'sessionStorage', message: 'Use user_preferences (server) instead of sessionStorage (CLAUDE.md).' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: 'No localStorage (CLAUDE.md).' },
        { object: 'window', property: 'sessionStorage', message: 'No sessionStorage (CLAUDE.md).' },
      ],
    },
  },
```
3. Replace the `globalIgnores([...])` list with:
```js
  globalIgnores([
    '.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'drizzle/**', 'coverage/**', 'playwright-report/**',
    'test-results/**', 'blob-report/**', 'e2e/.auth/**', 'uploads/**', 'backups/**', '.e2e-uploads/**',
    'plan/**', 'docs/**', '.claude/**',
  ]),
```
`prettier.config.mjs` (named export object — an anonymous default export trips `import/no-anonymous-default-export`):
```js
/** @type {import('prettier').Config} */
const config = { semi: false, singleQuote: true, trailingComma: 'all', printWidth: 110, objectWrap: 'preserve' }
export default config
```
`.prettierignore` (PLAN §3.3 list + M0-D14):
```
node_modules
.next
coverage
playwright-report
test-results
blob-report
drizzle
pnpm-lock.yaml
docs
plan
.claude
CLAUDE.md
SPEC.md
PROGRESS.md
PLAN.md
tech-stack.md
src/app/fonts/*.woff2
```
Done-check: `pnpm exec eslint eslint.config.mjs prettier.config.mjs next.config.ts --max-warnings 0` → 0 problems.

**S0.8 — `.gitignore`, `.env.example`, `.env`.** Keep every scaffold `.gitignore` line (it already ignores `.env*`, `/node_modules`, `/.next/`, `/out/`, `/build`, `*.tsbuildinfo`, `next-env.d.ts`, `/coverage`) and append:
```
!.env.example
uploads/
backups/
.e2e-uploads/
coverage/
playwright-report/
test-results/
blob-report/
e2e/.auth/
affine/
```
`affine/` is the owner's local AFFiNE trial install (2026-10-30, PLAN §1.7); its `data/` holds a live Postgres cluster and must never be committed. If the folder has been moved out of the repo by then, keep the line anyway. Later milestones only **append** lines (M11 adds `.perf-uploads/`); `test-results/` and `affine/` are never removed.
`.env.example` (SPEC §10.3 verbatim values, comments moved to their own lines because Node `--env-file`, Next and Compose treat inline `#` differently; M0-D20):
```bash
# Team Working OS — copy to .env (never commit .env). SPEC §10.3 + PLAN.md §3.12.
# Local development with `pnpm db:up` uses:
#   DATABASE_URL=postgres://planner:planner@localhost:54329/planner
DATABASE_URL=postgres://planner:CHANGE_ME@db:5432/planner
POSTGRES_PASSWORD=CHANGE_ME
# openssl rand -base64 32  (at least 32 characters)
BETTER_AUTH_SECRET=
# The URL users actually open
BETTER_AUTH_URL=https://planner.company.local
# false when served over plain HTTP on a LAN
SECURE_COOKIES=true
UPLOAD_DIR=/data/uploads
MAX_IMAGE_MB=10
MAX_ATTACHMENT_MB=25
TZ=Asia/Bangkok
INITIAL_MANAGER_EMAIL=
INITIAL_MANAGER_NAME=
# Used once; the manager must change it at first login
INITIAL_MANAGER_PASSWORD=
# Optional
# TRUSTED_ORIGINS=
# TRUSTED_PROXIES=
# DB_POOL_MAX=10
# Test-only — NEVER set in production (PLAN.md X45)
# ALLOW_TEST_HOOKS=1
# APP_NOW=2026-09-30T10:00:00+07:00
```
`.env` (gitignored, local only):
```bash
DATABASE_URL=postgres://planner:planner@localhost:54329/planner
SECURE_COOKIES=false
TZ=Asia/Bangkok
```
Done-check: `git check-ignore .env` prints `.env`; `git check-ignore .env.example` prints nothing.

**S0.9 — Placeholder app files (replaced by S2).** Overwrite the scaffold's `src/app/layout.tsx`, `src/app/page.tsx` and `src/app/globals.css` so the tree type-checks and lints with no Google font and no Thai literal:
```tsx
// src/app/layout.tsx — M0 S0 placeholder; S2.6 replaces it.
import type { ReactNode } from 'react'
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
```
```tsx
// src/app/page.tsx — M0 S0 placeholder; S2.6 replaces it with redirect('/home').
export default function RootPage() {
  return null
}
```
`src/app/globals.css`: empty file with a one-line comment. Done-check: `pnpm typecheck` passes in S0.15.

**S0.10 — `src/i18n/th.ts` (every key M0 needs) + `src/i18n/th.test.ts` (test first).**
Write the test first: `src/i18n/th.test.ts` › `describe('th')`:
- `it('has the M0 namespaces')` → `Object.keys(th)` contains `['meta', 'common', 'nav', 'errors', 'home']`.
- `it('has no empty or untrimmed strings')` → recursive walk; every string leaf `s` satisfies `s.length > 0 && s === s.trim()`; every function leaf called with `'x'` for each declared parameter (`fn.length`) returns a non-empty string.
- `it('UI labels are Thai')` → `th.nav.home`, `th.home.title`, `th.errors.notFoundPage.title` match `/[฀-๿]/`.
- `it('builds parameterised strings')` → `th.home.today('30 ก.ย. 2569') === 'วันนี้ 30 ก.ย. 2569'`; `th.nav.toggleHint(th.nav.collapseSidebar) === 'ย่อแถบด้านข้าง (⌘ \\ หรือ Ctrl + \\)'`.

Then `src/i18n/th.ts`:
```ts
/**
 * All UI text (CLAUDE.md › UX, SPEC §8.8, PLAN.md §3.7). Namespaces are created by the milestone that needs
 * them; parameterised strings are functions. Tests and e2e import `th` instead of copying Thai literals.
 */
export const th = {
  meta: {
    appName: 'Team Working OS',
    titleTemplate: '%s · Team Working OS',
    description: 'ระบบวางแผนงานและเอกสารของทีม',
  },
  common: {
    loading: 'กำลังโหลด…',
    retry: 'ลองอีกครั้ง',
    backToHome: 'กลับหน้าหลัก',
    notifications: 'การแจ้งเตือน',
  },
  nav: {
    sidebarLabel: 'เมนูหลัก',
    home: 'หน้าหลัก',
    collapseSidebar: 'ย่อแถบด้านข้าง',
    expandSidebar: 'ขยายแถบด้านข้าง',
    toggleHint: (action: string) => `${action} (⌘ \\ หรือ Ctrl + \\)`,
    openMenu: 'เปิดเมนู',
    skipToContent: 'ข้ามไปยังเนื้อหา',
  },
  errors: {
    notFoundPage: {
      title: 'ไม่พบหน้าที่ต้องการ',
      body: 'หน้านี้อาจถูกลบ ย้ายที่ หรือคุณไม่มีสิทธิ์เข้าถึง',
    },
    errorPage: {
      title: 'เกิดข้อผิดพลาด',
      body: 'ระบบขัดข้องชั่วคราว ลองอีกครั้ง หากยังไม่หายให้แจ้งผู้ดูแลระบบ',
    },
  },
  home: {
    title: 'หน้าหลัก',
    greeting: 'สวัสดี',
    today: (date: string) => `วันนี้ ${date}`,
    placeholderTitle: 'กำลังเตรียมพื้นที่ทำงานของทีม',
    placeholderBody: 'เมนูต่าง ๆ จะปรากฏในแถบด้านข้างเมื่อแต่ละส่วนพร้อมใช้งาน',
  },
} as const

export type Th = typeof th
```
Namespace rules for later milestones: M1 adds error-code keys directly under `errors` (`th.errors.NOT_FOUND`, …, PLAN §3.4.1) next to `notFoundPage`/`errorPage`; M10 extends `home`. Done-check: `pnpm exec vitest run --project unit src/i18n` (after S0.13) green.

**S0.11 — Dev database: `docker/docker-compose.dev.yml` (M0-D19).**
```yaml
name: planner-dev
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_DB: planner
      POSTGRES_USER: planner
      POSTGRES_PASSWORD: planner
    command: ['postgres', '-c', 'timezone=UTC', '-c', 'log_timezone=Asia/Bangkok']
    ports:
      - '127.0.0.1:54329:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U planner -d planner']
      interval: 2s
      timeout: 3s
      retries: 30
    restart: unless-stopped
volumes:
  pgdata: {}
```
`postgres:17` is the Debian image (`en_US.utf8` ctype, needed for Thai trigrams — never alpine). The `planner` role is a superuser in this image, so tests and e2e can create databases. Done-check: `pnpm db:up` returns after the container is healthy; `docker compose -f docker/docker-compose.dev.yml ps` shows `healthy`.

**S0.12 — Drizzle config, schema conventions, the extensions migration, the migrator.**
`drizzle.config.ts` (drizzle-kit auto-loads `.env`; generate never connects):
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://planner:planner@localhost:54329/planner' },
  strict: true,
  verbose: true,
})
```
Test first — `src/server/db/schema.test.ts` (unit) › `describe('schema conventions')`:
- `it('orderKey is text COLLATE "C"')` → `getTableConfig(pgTable('t', { position: orderKey('position').notNull() })).columns[0]?.getSQLType()` === `'text COLLATE "C"'`.
- `it('timestamptz is timestamp with time zone')` → same pattern with `timestamptz('created_at')` → `'timestamp with time zone'`.

`src/server/db/schema.ts`:
```ts
import { customType, timestamp } from 'drizzle-orm/pg-core'

/**
 * Fractional-index key column (SPEC §6.1, PLAN.md X48): byte-order collation so ORDER BY matches the JS `<`
 * comparison of fractional-indexing keys (the default en_US.utf8 collation mis-orders them).
 * Use for every user-ordered `position` column; sort with ORDER BY position, id.
 */
export const orderKey = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'text COLLATE "C"'
  },
})

/** Every timestamp is timestamptz (PLAN.md §1.3); plan dates use date({ mode: 'string' }) instead. */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

// Tables arrive with their milestone (PLAN.md X10): none in M0.
```
Generate the custom migration (ONLY S0 ever generates migrations, PLAN §2.3 rule 8):
```bash
pnpm exec drizzle-kit generate --custom --name=extensions
# → drizzle/0000_extensions.sql (placeholder), drizzle/meta/_journal.json, drizzle/meta/0000_snapshot.json
```
Replace the body of `drizzle/0000_extensions.sql` with exactly (r2 §9.4, verified on PG 17.11):
```sql
-- Custom SQL migration: extensions must exist before gin_trgm_ops indexes (M3+) and EXCLUDE USING gist (M5)
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
```
(Editing a custom migration before it is first applied is the intended workflow; never edit it afterwards.)
`scripts/lib/migrate.ts` (shared by `pnpm db:migrate`, the Vitest template, the e2e DB and — in M11 — the Docker `migrate` service):
```ts
import path from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

/** Folder of journaled migrations. Every caller runs from the repo root (Vitest, Playwright, pnpm scripts, Docker /app). */
export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')

/** Applies every journal entry newer than the last applied one, in one transaction (Drizzle 0.45 semantics). */
export async function runMigrations(databaseUrl: string, migrationsFolder: string = MIGRATIONS_FOLDER): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(sql), { migrationsFolder })
  } finally {
    await sql.end()
  }
}
```
`scripts/migrate.ts` (CLI; no top-level await, no `import.meta`, because tsx compiles this package as CommonJS):
```ts
import { runMigrations } from './lib/migrate'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required (copy .env.example to .env)')
  const t0 = performance.now()
  await runMigrations(url)
  console.log(`migrations applied in ${Math.round(performance.now() - t0)} ms`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name + ': ' + error.message : error)
  process.exit(1)
})
```
Done-check:
```bash
pnpm db:up && pnpm db:migrate          # → "migrations applied in … ms"
pnpm db:migrate                        # second run is a no-op, exit 0
pnpm db:generate                       # → "No schema changes, nothing to migrate"
pnpm exec drizzle-kit check            # → no collisions
```
If `tsx` rejects `--env-file-if-exists`, change the script to `node --env-file-if-exists=.env --import tsx scripts/migrate.ts` (both verified on Node 22, r6a M0-09) and report it.

**S0.13 — Vitest harness: `vitest.config.ts`, `tests/stubs/empty.ts`, `tests/setup/{db-global,db-worker,ui}.ts`, `tests/helpers/db.ts`, `src/server/db/schema.int.test.ts`.**
`vitest.config.ts` (base `plan/research/snippets/r4/vitest/vitest.config.ts`; project names per PLAN §4.2):
```ts
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true, // Vite 8 built-in "@/*"
    alias: { 'server-only': here('./tests/stubs/empty.ts') }, // 'server-only' throws outside react-server
  },
  test: {
    restoreMocks: true,
    unstubEnvs: true,
    maxWorkers: 4, // VITEST_POOL_ID ∈ 1..4 → one DB per concurrent integration file
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['src/domain/**/*.test.ts'],
      thresholds: { 'src/domain/**': { lines: 95, functions: 95, branches: 95, statements: 95 } },
      reporter: ['text-summary'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: [...configDefaults.exclude, '**/*.int.test.ts'],
        },
      },
      {
        extends: true,
        test: { name: 'ui', environment: 'jsdom', include: ['src/**/*.test.tsx'], setupFiles: ['./tests/setup/ui.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.int.test.ts', 'scripts/**/*.int.test.ts', 'tests/**/*.int.test.ts'],
          globalSetup: ['./tests/setup/db-global.ts'],
          setupFiles: ['./tests/setup/db-worker.ts'],
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
```
`tests/stubs/empty.ts`: `export {}`.
`tests/setup/ui.ts`: copy `plan/research/snippets/r4/vitest/tests/setup/ui.ts` verbatim (jest-dom + `afterEach(cleanup)`; globals stay off).
`tests/setup/db-global.ts` (adapted from the snippet; M0-D17 run id; real migrator):
```ts
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import type { TestProject } from 'vitest/node'
import { runMigrations } from '../../scripts/lib/migrate'

declare module 'vitest' {
  export interface ProvidedContext {
    adminUrl: string
    templateDb: string
    runId: string
  }
}

/** Admin connection to the dev Postgres from `pnpm db:up` (superuser `planner`). Override for CI. */
export const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://planner:planner@localhost:54329/postgres'
export const withDb = (url: string, db: string) => url.replace(/\/[^/?]+(\?|$)/, `/${db}$1`)

export default async function setup(project: TestProject) {
  const runId = randomBytes(3).toString('hex')
  const templateDb = `planner_tpl_${runId}`
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`create database ${templateDb}`)
  } finally {
    await admin.end()
  }
  await runMigrations(withDb(ADMIN_URL, templateDb)) // closes its connection: a TEMPLATE must have none
  project.provide('adminUrl', ADMIN_URL)
  project.provide('templateDb', templateDb)
  project.provide('runId', runId)
  return async () => {
    const a = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
    try {
      const dbs = await a<{ datname: string }[]>`
        select datname from pg_database where datname = ${templateDb} or datname like ${`planner_t_${runId}_w%`}`
      for (const { datname } of dbs) await a.unsafe(`drop database if exists "${datname}" with (force)`)
    } finally {
      await a.end()
    }
  }
}
```
`tests/setup/db-worker.ts` (runs before each integration test file; top-level await is fine under Vitest):
```ts
import postgres from 'postgres'
import { afterAll, beforeEach, inject, vi } from 'vitest'
import { truncateAll } from '../helpers/db'

// Next APIs that throw outside a request (PLAN.md §4.2). M1 adds the `@/server/session` mock here.
vi.mock('next/cache', () => ({ refresh: vi.fn(), updateTag: vi.fn(), revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => undefined })), headers: vi.fn(async () => new Headers()) }))

const adminUrl = inject('adminUrl')
const dbName = `planner_t_${inject('runId')}_w${process.env.VITEST_POOL_ID ?? '1'}`
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
await admin.unsafe(`drop database if exists ${dbName} with (force)`)
await admin.unsafe(`create database ${dbName} template ${inject('templateDb')}`)
await admin.end()
const workerUrl = adminUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
process.env.DATABASE_URL = workerUrl // read lazily by src/server/env.ts on first use

const sql = postgres(workerUrl, { max: 1, onnotice: () => {} })
beforeEach(async () => {
  await truncateAll(sql)
})
afterAll(async () => {
  await sql.end()
})
```
`tests/helpers/db.ts`:
```ts
import type postgres from 'postgres'

/** Truncates every table in schema public (keeps drizzle.__drizzle_migrations). No-op when there are none (M0). */
export async function truncateAll(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`
  if (rows.length === 0) return
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await sql.unsafe(`truncate table ${list} restart identity cascade`)
}
```
Integration test (first real DB test, needed for G0) — `src/server/db/schema.int.test.ts` › `describe('database harness and migrations')`:
- `it('runs on a per-worker clone of the migrated template')` → `select current_database()` matches `/^planner_t_[0-9a-f]{6}_w\d+$/`.
- `it('has the M0 extensions')` → `select extname from pg_extension` ⊇ `['btree_gist', 'pg_trgm', 'pgcrypto']`.
- `it('applied exactly the journaled migrations')` → `select count(*)::int as n from drizzle.__drizzle_migrations` equals `JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')).entries.length` (= 1 in M0; stays true in later milestones).
- `it('orderKey collation sorts like JS <')` → `create temp table k (p text collate "C")`, insert `['a1', 'Zz', 'a0V', 'a0']`, `select p from k order by p` → `['Zz', 'a0', 'a0V', 'a1']` which equals `[...keys].sort()`; and the same values with `collate "en_US.utf8"` give a **different** order (`['a0', 'a0V', 'a1', 'Zz']`) — proves why X48 exists.
Each test opens `postgres(process.env.DATABASE_URL!, { max: 1 })` in `beforeAll` and ends it in `afterAll` (the `!` is allowed in test files by the lint config).

**S0.14 — `src/lib/csp.ts` contract stub (S1 implements it).**
```ts
/** Request header the proxy uses to hand the per-request CSP nonce to the root layout (PLAN.md §3.12). */
export const NONCE_HEADER = 'x-nonce'

export interface CspOptions {
  /** NODE_ENV === 'development': adds 'unsafe-eval' to script-src and ws:/wss: to connect-src. */
  dev: boolean
  /** SECURE_COOKIES === 'true': adds upgrade-insecure-requests and HSTS. */
  https: boolean
}

/** Base64 nonce, fresh per request. */
export function generateNonce(): string {
  throw new Error('NotImplemented: M0 S1.4')
}

/** The Content-Security-Policy value (M0-D10). */
export function buildCsp(_nonce: string, _opts: CspOptions): string {
  throw new Error('NotImplemented: M0 S1.4')
}

/** Static security headers for page responses (M0-D10). */
export function securityHeaders(_opts: CspOptions): ReadonlyArray<readonly [name: string, value: string]> {
  throw new Error('NotImplemented: M0 S1.4')
}
```

**S0.15 — G0 and handover.**
```bash
pnpm db:up
pnpm exec prettier --write .            # normalise scaffold files once (protected docs are ignored, M0-D14)
pnpm check                              # typecheck (next typegen + tsc) + lint + vitest (unit, ui, integration) + coverage
shasum -a 256 -c "$TMPDIR/m0-protected.sha256"     # every line OK
test ! -e AGENTS.md
git status --short | grep -E '^\?\? (\.env|node_modules|\.next)' && exit 1 || true   # ignored paths never show
```
Expected at G0: unit = `th.test.ts`, `schema.test.ts`; integration = `schema.int.test.ts`; ui has no test file yet (Vitest errors only when no test file exists in any project). If Vitest nevertheless fails because the `ui` project matched no file, add `src/i18n/th.render.test.tsx` (renders `th.home.title` in a `<p>` and asserts it) instead of using `passWithNoTests`. If the coverage threshold fails with zero domain files, gate the `thresholds` key on `fs.globSync('src/domain/**/*.ts').length > 0` and record a Decision.
**S0 must deliver to later streams (contract list):** installed deps (M0-D15); scripts (S0.4); configs; `th` keys (S0.10); `NONCE_HEADER`, `CspOptions`, `generateNonce`, `buildCsp`, `securityHeaders` signatures (S0.14); `orderKey`, `timestamptz` (S0.12); `runMigrations`, `MIGRATIONS_FOLDER` (S0.12); `truncateAll` (S0.13); the DOM contract in §5.S2 "UI contract" and the nav entries in S2.10 (written in this plan; S2 implements, S3 tests). No query keys, DTOs, zod form schemas, authz signatures or test factories exist in M0 (they start in M1/M2).

### 5.S1 — Server runtime: env, lazy DB client, CSP proxy + security headers, health route (platform-engineer · `src/server/env*.ts`, `src/server/db/client*.ts`, `src/lib/csp*.ts`, `src/proxy*.ts`, `src/app/api/**`, `scripts/lib/migrate.int.test.ts`)

Runs in parallel with S2 and S3. Never run `next dev`/`next build`/Playwright. G1 commands: `pnpm exec vitest run --project unit src/server src/lib/csp.test.ts src/proxy.test.ts`, `pnpm exec vitest run --project integration`, `pnpm exec eslint src/server src/lib/csp.ts src/proxy.ts src/app/api scripts --max-warnings 0`, `pnpm exec tsc --noEmit` (act only on errors in owned paths).

**S1.1 — `src/server/env.ts` (lazy zod env, M0-D20). Test first.**
`src/server/env.test.ts` (unit) › `describe('env')`:
| it | input (`parseEnv(source)`) | expected |
|---|---|---|
| applies defaults | `{ DATABASE_URL: 'postgres://planner:planner@localhost:54329/planner' }` | `{ NODE_ENV: 'development', SECURE_COOKIES: false, DB_POOL_MAX: 10, DATABASE_URL: … }` |
| parses booleans strictly | `SECURE_COOKIES: 'true'` → `true`; `'false'` → `false`; `'yes'` | `'yes'` throws `/SECURE_COOKIES/` |
| requires a postgres URL | missing `DATABASE_URL`; `'http://x'`; `'postgresql://a@b/c'` | throws `/DATABASE_URL/`; throws; accepted |
| bounds the pool | `DB_POOL_MAX: '0'` / `'51'` / `'20'` | throws / throws / `20` |
| never echoes values | invalid `DATABASE_URL: 'http://secret-pw@x'` | error message does not contain `secret-pw` |
| is lazy and cached | `resetEnvCache()`; stub `process.env.DATABASE_URL`; `getEnv()` twice | same object; `resetEnvCache()` → re-read |
| `.env.example` documents every key | read `.env.example`, collect `/^#?\s*([A-Z][A-Z0-9_]*)=/gm` | ⊇ `ENV_KEYS` |
```ts
// src/server/env.ts — no 'server-only': src/proxy.ts and scripts may import it.
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SECURE_COOKIES: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // M1 adds BETTER_AUTH_*, TRUSTED_*, ALLOW_TEST_HOOKS, APP_NOW, INITIAL_MANAGER_*; M4 adds UPLOAD_DIR, MAX_*_MB.
})

export type Env = z.output<typeof EnvSchema>
export const ENV_KEYS = Object.keys(EnvSchema.shape) as ReadonlyArray<keyof Env>

/** Validates a raw env object. Messages name the variable and the problem, never the value. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.code}`).join('; ')
    throw new Error(`Invalid environment: ${issues}`)
  }
  return result.data
}

let cached: Env | undefined
/** Lazy: nothing is validated at import time, so `next build` works without DATABASE_URL (PLAN.md §3.12). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
/** Tests only. */
export function resetEnvCache(): void {
  cached = undefined
}
```
Done-check: `pnpm exec vitest run --project unit src/server/env.test.ts` green.

**S1.2 — `src/server/db/client.ts` (lazy Drizzle over postgres.js). Tests first.**
Unit `src/server/db/client.test.ts` › `describe('db client (lazy)')`:
- `it('imports without DATABASE_URL')` → `delete process.env.DATABASE_URL; resetEnvCache(); await import('@/server/db/client')` resolves (no throw).
- `it('throws a clear error on first use without DATABASE_URL')` → `getDb()` throws `/DATABASE_URL/`.
Integration `src/server/db/client.int.test.ts` › `describe('db client')` (`afterAll(closeDb)`):
- `it('runs a query')` → `const [row] = await getDb().execute<{ one: number }>(sql\`select 1::int as one\`)` → `row?.one === 1`.
- `it('lazy db proxy forwards to the real instance')` → `await db.execute(sql\`select 1\`)` succeeds; `db.transaction` is a function.
- `it('runs sessions in UTC (X52)')` → `select current_setting('TimeZone') as tz` → `'UTC'`.
- `it('uses the en_US.utf8 ctype needed for Thai trigrams')` → `select datctype from pg_database where datname = current_database()` → `'en_US.utf8'`.
- `it('produces Thai trigrams')` → `select array_length(show_trgm('สวัสดี'), 1) as n` → `n > 0`.
- `it('closeDb resets the singleton')` → `await closeDb()`; next `getDb()` query still works.
```ts
// src/server/db/client.ts — no 'server-only' (PLAN X56): tsx scripts and Playwright import it.
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/server/env'
import * as schema from './schema'

export type Schema = typeof schema
export type Db = PostgresJsDatabase<Schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

type Holder = { sql?: postgres.Sql; db?: Db }
// globalThis survives Next dev HMR, so one pool per process.
const holder = ((globalThis as typeof globalThis & { __plannerDb?: Holder }).__plannerDb ??= {})

/** Creates the pool on first use (postgres.js connects lazily too). */
export function getDb(): Db {
  if (!holder.db) {
    const env = getEnv()
    holder.sql = postgres(env.DATABASE_URL, { max: env.DB_POOL_MAX, idle_timeout: 20, connect_timeout: 5, onnotice: () => {} })
    holder.db = drizzle(holder.sql, { schema })
  }
  return holder.db
}

/** Lazy `db` export used by actions/services (`db.transaction(...)`); every property is forwarded to getDb(). */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb()
    const value: unknown = Reflect.get(real, prop, real)
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value
  },
})

/** Ends the pool (tests, scripts). */
export async function closeDb(): Promise<void> {
  const current = holder.sql
  holder.sql = undefined
  holder.db = undefined
  await current?.end({ timeout: 0 })
}
```
Rules for later milestones (state them in the file header comment): scripts never import this module (it starts with `server-only`); they create their own `postgres(url, { max: 1 })` client and `drizzle()` it; never log a `DrizzleQueryError.message` for auth tables (params contain hashes). Done-check: both test files green.

**S1.3 — Migrator idempotency.** `scripts/lib/migrate.int.test.ts` › `describe('runMigrations')`:
- `it('is idempotent on an already-migrated database')` → `await runMigrations(process.env.DATABASE_URL!)` twice → no throw; `drizzle.__drizzle_migrations` count unchanged (= journal entries).
- `it('fails loudly on an unreachable database')` → `runMigrations('postgres://planner:planner@127.0.0.1:1/none')` rejects.
Done-check: `pnpm exec vitest run --project integration scripts` green.

**S1.4 — `src/lib/csp.ts` implementation (M0-D10). Test first.**
`src/lib/csp.test.ts` (unit) › `describe('csp')`:
- `it('production policy')` → `buildCsp('abc', { dev: false, https: false })` **equals**
  `"default-src 'self'; script-src 'self' 'nonce-abc'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'"`.
- `it('dev adds unsafe-eval and websockets')` → contains `script-src 'self' 'nonce-abc' 'unsafe-eval'` and `connect-src 'self' ws: wss:`.
- `it('https adds upgrade-insecure-requests')` → ends with `; upgrade-insecure-requests`; not present when `https: false`.
- `it('never uses strict-dynamic or a style nonce')` → for all four option combinations: no `strict-dynamic`, `style-src` has no `nonce-`.
- `it('nonces are fresh base64')` → 100 calls → 100 distinct values, each matching `/^[A-Za-z0-9+/]+=*$/` and length ≥ 24.
- `it('security headers')` → `new Map(securityHeaders({ dev: false, https: false }))` has `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`, and **no** `Strict-Transport-Security`; with `https: true` → `Strict-Transport-Security: max-age=31536000`.
Implementation (keep the S0.14 signatures; isomorphic code — `btoa`, not `Buffer`):
```ts
export function generateNonce(): string {
  return btoa(crypto.randomUUID())
}

export function buildCsp(nonce: string, opts: CspOptions): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'${opts.dev ? ` 'unsafe-eval'` : ''}`, // no 'strict-dynamic' (next#98015)
    `style-src 'self' 'unsafe-inline'`, // Emotion, sonner (and Mantine in M4) inject <style> without a nonce
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${opts.dev ? ' ws: wss:' : ''}`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    ...(opts.https ? ['upgrade-insecure-requests'] : []), // would break plain-HTTP LAN installs
  ].join('; ')
}

export function securityHeaders(opts: CspOptions): ReadonlyArray<readonly [string, string]> {
  return [
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
    ['X-Frame-Options', 'DENY'],
    ...(opts.https ? ([['Strict-Transport-Security', 'max-age=31536000']] as const) : []),
  ]
}
```
Done-check: `pnpm exec vitest run --project unit src/lib/csp.test.ts` green.

**S1.5 — `src/proxy.ts` (CSP nonce + headers; no session logic until M1). Test first.**
`src/proxy.test.ts` (unit) › `describe('proxy')`:
- `it('sets the CSP on the response and hands the nonce to the render')` → `const res = proxy(new NextRequest('http://localhost:3100/home'))`; `res.headers.get('content-security-policy')` contains `'nonce-X'` where `X` = `res.headers.get('x-middleware-request-x-nonce')` (Next's request-override header).
- `it('adds the static security headers')` → nosniff, referrer, permissions, `X-Frame-Options`; with `vi.stubEnv('SECURE_COOKIES', 'true')` + `resetEnvCache()` → HSTS present and CSP ends with `upgrade-insecure-requests`.
- `it('matcher skips /api, Next assets and the favicon')` → `const re = new RegExp('^' + config.matcher[0].source + '$')`: matches `/`, `/home`, `/settings/employees`; does **not** match `/api/health`, `/api/files`, `/_next/static/chunks/a.js`, `/_next/image`, `/favicon.ico`.
Each test stubs `DATABASE_URL` (valid dev URL) and calls `resetEnvCache()` because the proxy reads `getEnv()`.
```ts
// src/proxy.ts — Node runtime (Next 16). M1 adds session validation + login/must-change redirects ABOVE the nonce code.
import { NextResponse, type NextRequest } from 'next/server'
import { buildCsp, generateNonce, NONCE_HEADER, securityHeaders, type CspOptions } from '@/lib/csp'
import { getEnv } from '@/server/env'

export function proxy(request: NextRequest): NextResponse {
  const env = getEnv()
  const opts: CspOptions = { dev: env.NODE_ENV === 'development', https: env.SECURE_COOKIES }
  const nonce = generateNonce()
  const csp = buildCsp(nonce, opts)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(NONCE_HEADER, nonce) // read by src/app/layout.tsx
  requestHeaders.set('Content-Security-Policy', csp) // Next parses the nonce from here during SSR
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  for (const [name, value] of securityHeaders(opts)) response.headers.set(name, value)
  return response
}

export const config = {
  matcher: [
    {
      // /api excluded: route handlers set their own headers and uploads must not be buffered (PLAN.md §1.3)
      source: '/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
```
Note: `NODE_ENV` is set by Next itself (`development` under `next dev`, `production` under `next start`). Done-check: `pnpm exec vitest run --project unit src/proxy.test.ts` green. If importing `next/server` under Vitest fails, keep the matcher/headers tests and move the request-override assertion to the e2e security-header test (report it).

**S1.6 — `GET /api/health` (public readiness probe, M0-D11, M0-D24). Test first.**
`src/app/api/health/health.int.test.ts` › `describe('GET /api/health')` (`afterEach(closeDb)`, restore `DATABASE_URL`, `resetEnvCache()`):
- `it('200 { ok: true } when the DB answers')` → `const res = await GET()`; `res.status === 200`; `await res.json()` → `{ ok: true }`; `cache-control` = `no-store`; `x-content-type-options` = `nosniff`.
- `it('503 { ok: false } when the DB is unreachable')` → `await closeDb(); process.env.DATABASE_URL = 'postgres://planner:planner@127.0.0.1:1/none'; resetEnvCache()` → `GET()` → `503`, body `{ ok: false }`, same headers; the body never contains the URL.
- `it('needs no session')` → no cookies/headers mocked beyond db-worker defaults; still 200 (public by design).
```ts
// src/app/api/health/route.ts
import { sql } from 'drizzle-orm'
import { getDb } from '@/server/db/client'

export const dynamic = 'force-dynamic' // never evaluated by `next build` (no DB at build time)

const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const

/** Public readiness probe (Docker healthcheck, Playwright webServer.url). Reads no application data. */
export async function GET(): Promise<Response> {
  try {
    await getDb().execute(sql`select 1`)
    return Response.json({ ok: true }, { headers: HEADERS })
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown'
    console.error(`[health] database ping failed (${code})`) // never log the connection string
    return Response.json({ ok: false }, { status: 503, headers: HEADERS })
  }
}
```
Done-check: `pnpm exec vitest run --project integration src/app/api` green.

**S1.7 — Stream done-check.** All S1 tests green; `pnpm exec eslint src/server src/lib/csp.ts src/lib/csp.test.ts src/proxy.ts src/proxy.test.ts src/app/api scripts --max-warnings 0` clean; `pnpm exec tsc --noEmit` shows no error in owned paths. Report: files, test counts, any request (e.g. an env key S2/S3 need).

### 5.S2 — Thai UI shell (frontend-engineer · `src/app/{layout,page,not-found,error,global-error}.tsx`, `src/app/{globals,tokens}.css`, `src/app/fonts/**`, `src/app/(app)/**`, `src/components/**`, `src/hooks/**`, `src/lib/theme/**`, `src/lib/{format,keys,query-client}*.ts`, `tests/helpers/render.tsx`)

Runs in parallel with S1 and S3. Never run `next dev`/`next build`. G1: `pnpm exec vitest run --project unit src/lib`, `pnpm exec vitest run --project ui`, `pnpm exec eslint src/app src/components src/hooks src/lib tests/helpers --max-warnings 0`, `pnpm exec tsc --noEmit` (owned paths). MUI 9 only: `slots`/`slotProps`, `sx` (no system props), path imports (`@mui/material/Button`, `@mui/icons-material/HomeOutlined`). Every visible string comes from `th` (lint fails otherwise). Dense rows (sidebar) are plain elements + CSS Modules + `data-*` state (PLAN §3.9).

**UI contract (S3's e2e and later milestones rely on it — do not rename):**
| Element | Contract |
|---|---|
| `<html>` | `lang="th"`, `class` contains the two font variable classes and `light` (M0-D8) |
| Document title | `/home` → `th.meta.titleTemplate` with `%s` = `th.home.title`; default `th.meta.appName` |
| Sidebar container | `<aside id="app-sidebar" data-testid="app-sidebar" data-collapsed="false|true">` |
| Navigation | `<nav aria-label={th.nav.sidebarLabel}>`; each item a link with accessible name = its label (also when collapsed, via `aria-label`), `aria-current="page"` when active |
| Collapse toggle | `<button aria-label={th.nav.collapseSidebar | th.nav.expandSidebar} aria-expanded aria-controls="app-sidebar">`; tooltip `th.nav.toggleHint(label)` via `describeChild` (does not change the name) |
| Shortcut | `Cmd/Ctrl + \` (e.code `Backslash`) toggles the same state; ignored in editable targets |
| Narrow screens (< 900 px) | permanent sidebar hidden by CSS; `<button aria-label={th.nav.openMenu}>` opens a temporary MUI `Drawer` containing the same nav (expanded); `Esc` closes it |
| Skip link | first focusable element: link `th.nav.skipToContent` → `#main` |
| Main | `<main id="main" tabIndex={-1}>` |
| `/home` | `<h1>` = `th.home.title`; text `th.home.greeting`; text `th.home.today(<date>)`; `EmptyState` with `th.home.placeholderTitle` / `th.home.placeholderBody` |
| 404 page | `<h1>` = `th.errors.notFoundPage.title`, body text, link `th.common.backToHome` → `/home` |

**S2.1 — Fonts (M0-D9).**
```bash
cd /Users/thammasorn.har/Desktop/plan-system
for s in latin thai; do for w in 400 500 600 700; do
  cp "node_modules/@fontsource/ibm-plex-sans-thai/files/ibm-plex-sans-thai-$s-$w-normal.woff2" src/app/fonts/
done; done
cp plan/research/snippets/r1/src/app/fonts/OFL-IBMPlexSansThai.txt src/app/fonts/OFL.txt
ls src/app/fonts/*.woff2 | wc -l      # → 8
```
`src/app/fonts/fonts.ts` = `plan/research/snippets/r1/src/app/fonts.ts` with paths changed to `./ibm-plex-sans-thai-<subset>-<w>-normal.woff2` (same folder): exports `plexLatin` (`variable: '--font-plex-latin'`) and `plexThai` (`variable: '--font-plex-thai'`, `unicode-range` declaration), both `display: 'swap'`, `adjustFontFallback: false`. Done-check: `pnpm exec tsc --noEmit` clean for the file.

**S2.2 — Tokens + contrast (A11Y-3, UI-10, X51, M0-D22). Test first.**
`src/lib/theme/contrast.test.ts` (unit; reads `src/app/tokens.css` with `readFileSync(path.resolve('src/app/tokens.css'), 'utf8')`) › `describe('design tokens')`:
- `it('computes WCAG ratios')` → `contrastRatio('#FFFFFF', '#000000')` ≈ 21 (±0.01); `contrastRatio('#9C6500', '#FFEB9C')` ≈ 4.12 (the SPEC value that fails); `contrastRatio('#8F5C00', '#FFEB9C')` ≈ 4.76.
- `it('defines every SPEC §8.7 token in light and dark')` → both blocks contain `SPEC_TOKENS` (21 names: `brand-navy brand-blue brand-light load-over-bg load-over-fg load-full-bg load-full-fg load-light-bg load-light-fg heat-0 heat-50 heat-100 certain-bg certain-fg tentative-bg tentative-fg nonworking holiday timeoff today milestone`) plus `surface`, `faded-fg`; light and dark key sets are identical.
- `it('keeps SPEC light values except the X51 fixes')` → every light value equals SPEC §8.7 (case-insensitive) except `load-light-fg` and `tentative-fg` = `#8F5C00`.
- `it.each(TEXT_PAIRS × ['light','dark'])('%s on %s ≥ 4.5:1')` → `contrastRatio(fg, bg) >= 4.5`.
`src/lib/theme/contrast.ts` (pure, isomorphic):
```ts
export type TokenSet = Readonly<Record<string, string>>
/** fg/bg token pairs that carry text; later milestones append pairs (e.g. heat text in M9). Non-text tokens
 *  (--today 3.76:1, --milestone, --heat-*) are excluded on purpose (SPEC §8.9 applies to text). */
export const TEXT_PAIRS: ReadonlyArray<readonly [fg: string, bg: string]> = [
  ['load-over-fg', 'load-over-bg'], ['load-full-fg', 'load-full-bg'], ['load-light-fg', 'load-light-bg'],
  ['certain-fg', 'certain-bg'], ['tentative-fg', 'tentative-bg'],
  ['faded-fg', 'surface'], ['faded-fg', 'nonworking'], ['faded-fg', 'holiday'],
]
export function relativeLuminance(hex: string): number   // sRGB → linear (0.03928 threshold) → 0.2126R+0.7152G+0.0722B
export function contrastRatio(a: string, b: string): number // (Lmax + 0.05) / (Lmin + 0.05)
/** Parses `:root { --x: #RRGGBB; }` and `.dark { … }` blocks (one declaration per line). */
export function parseTokenBlocks(css: string): { light: TokenSet; dark: TokenSet }
```
`src/app/tokens.css` (one `--name: #RRGGBB;` per line — the parser depends on it):
| token | light (SPEC §8.7 unless noted) | dark (new) |
|---|---|---|
| `--brand-navy` | `#1F3864` | `#A9C1EA` |
| `--brand-blue` | `#2F5597` | `#8FAADC` |
| `--brand-light` | `#D9E2F3` | `#1E2A44` |
| `--load-over-bg` / `--load-over-fg` | `#FFC7CE` / `#9C0006` | `#5C1A22` / `#FFD9DE` |
| `--load-full-bg` / `--load-full-fg` | `#C6EFCE` / `#006100` | `#133D1F` / `#C6EFCE` |
| `--load-light-bg` / `--load-light-fg` | `#FFEB9C` / **`#8F5C00`** (X51) | `#4A3B00` / `#FFEB9C` |
| `--heat-0` / `--heat-50` / `--heat-100` | `#FFFFFF` / `#BDD7EE` / `#2E75B6` | `#121212` / `#1F3A56` / `#5B9BD5` |
| `--certain-bg` / `--certain-fg` | `#E2EFDA` / `#006100` | `#1B3A1B` / `#C6EFCE` |
| `--tentative-bg` / `--tentative-fg` | `#FFEB9C` / **`#8F5C00`** (X51) | `#4A3B00` / `#FFEB9C` |
| `--nonworking` / `--holiday` / `--timeoff` | `#F1F5F9` / `#E2E8F0` / `#CBD5E1` | `#1E293B` / `#273449` / `#334155` |
| `--today` / `--milestone` | `#EF4444` / `#7C3AED` | `#F87171` / `#A78BFA` |
| `--surface` (new) | `#FFFFFF` | `#121212` |
| `--faded-fg` (new, X51) | `#5B6878` (5.68 / 5.19 / 4.61 on surface / nonworking / holiday) | `#94A3B8` (7.31 / 5.71 / 4.89) |
Selectors: `:root { … }` for light and `.dark { … }` for dark (matches MUI `colorSchemeSelector: 'class'`). Done-check: `pnpm exec vitest run --project unit src/lib/theme` green.

**S2.3 — `src/lib/theme/theme.ts` (`'use client'`).** Start from `plan/research/snippets/r1/src/theme.ts`:
```ts
'use client'
import { createTheme } from '@mui/material/styles'
import { thTH } from '@mui/material/locale'

export type ColorScheme = 'light' | 'dark'

export const theme = createTheme(
  {
    cssVariables: { colorSchemeSelector: 'class' }, // .light / .dark on <html>
    colorSchemes: {
      light: { palette: { primary: { main: '#2F5597' }, secondary: { main: '#1F3864' } } },
      dark: { palette: { primary: { main: '#8FAADC' }, secondary: { main: '#D9E2F3' } } },
    },
    typography: { fontFamily: 'var(--font-plex-latin), var(--font-plex-thai), system-ui, sans-serif' },
    components: {
      MuiButton: { defaultProps: { size: 'small' } },
      MuiIconButton: { defaultProps: { size: 'small' } },
      MuiTextField: { defaultProps: { size: 'small' } },
    },
  },
  thTH, // pickers' thTH is added with @mui/x-date-pickers (M0-D16)
)
```
Done-check: tsc clean.

**S2.4 — `src/lib/query-client.ts` (PLAN §3.5). Test first.** `src/lib/query-client.test.ts` (unit, node = "server"): `getQueryClient()` twice → two different instances; defaults `staleTime === 60_000`, `retry === 1`, `refetchOnWindowFocus === true`. Implementation = `plan/research/snippets/r4/client/lib/query-client.ts` with those three defaults (PLAN wins over the snippet's `refetchOnWindowFocus: false`), `environmentManager.isServer()` (not the deprecated `isServer`), browser singleton.

**S2.5 — `ToasterHost` + `AppProviders`.**
`src/components/providers/ToasterHost.tsx` (`'use client'`) = the `ToasterHost` of `plan/research/snippets/r4/client/components/ToasterHost.tsx` **without** `toastUndo`/`toastPromise` (M1, X04), with `containerAriaLabel={th.common.notifications}` and colours from `(theme.vars ?? theme).palette.*` so dark mode follows the CSS variables.
`src/components/providers/AppProviders.tsx`:
```tsx
'use client'
import type { ReactNode } from 'react'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query-client'
import { theme, type ColorScheme } from '@/lib/theme/theme'
import { ToasterHost } from './ToasterHost'

/** Order per PLAN.md §3.9. M1 inserts UndoProvider; the DatePicker milestone inserts LocalizationProvider. */
export function AppProviders({ nonce, scheme, children }: { nonce: string | undefined; scheme: ColorScheme; children: ReactNode }) {
  const queryClient = getQueryClient() // browser singleton; never useState(new QueryClient()) (r4 fact 8)
  return (
    <AppRouterCacheProvider options={{ key: 'mui', enableCssLayer: true, ...(nonce ? { nonce } : {}) }}>
      <ThemeProvider theme={theme} defaultMode={scheme} storageManager={null}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          {children}
          <ToasterHost />
        </QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
```

**S2.6 — Root layout, `/` redirect, 404/error pages, `globals.css`.**
`src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { AppProviders } from '@/components/providers/AppProviders'
import { th } from '@/i18n/th'
import { NONCE_HEADER } from '@/lib/csp'
import type { ColorScheme } from '@/lib/theme/theme'
import { plexLatin, plexThai } from './fonts/fonts'
import './tokens.css'
import './globals.css'

export const metadata: Metadata = {
  title: { default: th.meta.appName, template: th.meta.titleTemplate },
  description: th.meta.description,
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, interactiveWidget: 'resizes-content' }

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined // set by src/proxy.ts (x-nonce contract)
  const scheme: ColorScheme = 'light' // M0-D8; M1 reads user_preferences.theme
  return (
    <html lang="th" className={`${plexLatin.variable} ${plexThai.variable} ${scheme}`} suppressHydrationWarning>
      <body>
        <AppProviders nonce={nonce} scheme={scheme}>{children}</AppProviders>
      </body>
    </html>
  )
}
```
`src/app/page.tsx`: `import { redirect } from 'next/navigation'; export default function RootPage(): never { redirect('/home') }` (X32; 307).
`src/app/not-found.tsx` (server component): MUI `Box` + `Typography component="h1"` with `th.errors.notFoundPage.title`, body, `<Button component={Link} href="/home">{th.common.backToHome}</Button>` (`Link` = `@/components/Link`).
`src/app/error.tsx` (`'use client'`; read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` for the exact prop names in 16.3): title/body from `th.errors.errorPage`, a button `th.common.retry` that calls the retry/reset prop. Test first: `src/app/error.test.tsx` (ui) → renders the Thai title and the button; clicking it calls the prop once.
`src/app/global-error.tsx` (`'use client'`): its own `<html lang="th"><body>` with plain elements (no providers), the same texts and a retry button.
`src/app/globals.css`: `html, body { height: 100%; }` and `:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }` (visible focus, SPEC §8.9).
Done-check: `pnpm exec vitest run --project ui src/app` green; tsc clean.

**S2.7 — `src/lib/keys.ts` (X49, M0-D12). Test first.**
`src/lib/keys.test.ts` (unit) › `describe('matchesHotkey')` with `HOTKEYS.toggleSidebar`:
| event | expected |
|---|---|
| `{ code: 'Backslash', key: '\\', ctrlKey: true }` | true |
| `{ code: 'Backslash', key: 'ฃ', metaKey: true }` (Thai Kedmanee) | true |
| `{ code: 'Backslash', key: '\\' }` (no modifier) | false |
| `{ code: 'Backslash', key: '\|', ctrlKey: true, shiftKey: true }` | false |
| `{ code: 'Backslash', key: '\\', ctrlKey: true, altKey: true }` | false |
| `{ code: 'IntlYen', key: '\\', ctrlKey: true }` (key fallback) | true |
| `{ code: 'KeyK', key: 'k', metaKey: true }` | false |
```ts
export interface Hotkey {
  /** KeyboardEvent.code — physical key, layout-independent (Thai layout safe). */
  code: string
  /** KeyboardEvent.key fallback for layouts that move the key. */
  key?: string
  /** Cmd or Ctrl (either, every platform — M0-D12). */
  mod?: boolean
  shift?: boolean
  alt?: boolean
}
export type HotkeyEvent = Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

export function matchesHotkey(e: HotkeyEvent, hk: Hotkey): boolean {
  const mod = e.metaKey || e.ctrlKey
  if (mod !== Boolean(hk.mod) || e.shiftKey !== Boolean(hk.shift) || e.altKey !== Boolean(hk.alt)) return false
  return e.code === hk.code || (hk.key !== undefined && e.key === hk.key)
}

/** Inputs, textareas, selects, contenteditable and the BlockNote editor (M4) are editable targets. */
export function isEditableTarget(target: EventTarget | null): boolean // Element check + closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],.bn-editor')

/** App-wide shortcut registry; M3's `?` help dialog reads it (X07). */
export const HOTKEYS = {
  toggleSidebar: { code: 'Backslash', key: '\\', mod: true },
} as const satisfies Record<string, Hotkey>
```
`isEditableTarget` is covered in S2.8's jsdom tests. Done-check: unit test green.

**S2.8 — `src/hooks/useHotkeys.ts`. Test first.**
`src/hooks/useHotkeys.test.tsx` (ui) — a harness component registers `[{ hotkey: HOTKEYS.toggleSidebar, handler }]`:
- `fireEvent.keyDown(document.body, { code: 'Backslash', key: 'ฃ', ctrlKey: true })` → handler called once and `event.defaultPrevented === true`.
- same event dispatched on a focused `<input>` / `<textarea>` / `<div contenteditable="true">` → not called.
- binding with `allowInEditable: true` on an input → called.
- an earlier listener calls `preventDefault()` (capture phase on `document`) → not called.
- after `unmount()` → not called (listener removed).
```ts
'use client'
import { useEffect, useEffectEvent } from 'react'
import { isEditableTarget, matchesHotkey, type Hotkey } from '@/lib/keys'

export interface HotkeyBinding {
  hotkey: Hotkey
  handler: (e: KeyboardEvent) => void
  /** default false: shortcuts are ignored while typing (X49) */
  allowInEditable?: boolean
}

/** Global keydown bindings on window; skips events already handled (e.defaultPrevented). */
export function useHotkeys(bindings: readonly HotkeyBinding[], opts: { enabled?: boolean } = {}): void {
  const enabled = opts.enabled ?? true
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    for (const b of bindings) {
      if (!matchesHotkey(e, b.hotkey)) continue
      if (!b.allowInEditable && isEditableTarget(e.target)) return
      e.preventDefault()
      b.handler(e)
      return
    }
  })
  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
```
(`useEffectEvent` is stable in React 19.2+; if the installed types lack it, keep the latest bindings in a ref updated in `useLayoutEffect` — never write `ref.current` during render, react-hooks `refs` rule.) Done-check: ui test green.

**S2.9 — `src/components/Link.tsx` + `src/components/common/EmptyState.tsx`.**
`Link.tsx` = `plan/research/snippets/r1/src/components/Link.tsx` (`'use client'; import NextLink from 'next/link'; export default NextLink`) — the only way to pass `next/link` as MUI `component=` from a server component.
`EmptyState.tsx` (`'use client'`): `export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode })` — centred `Stack`, optional icon (`aria-hidden`), title as `Typography variant="h6" component="p"`, description `Typography variant="body2" sx={{ color: 'text.secondary' }}`, optional action. Test first: `src/components/common/EmptyState.test.tsx` (ui, `renderWithProviders`) → renders title, description and the action button; omits the description element when absent.
`tests/helpers/render.tsx` (create this first in S2; later milestones reuse it):
```tsx
import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { theme } from '@/lib/theme/theme'

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <ThemeProvider theme={theme} storageManager={null}>{children}</ThemeProvider>
      </QueryClientProvider>
    )
  }
}
/** Renders with the app theme and a fresh QueryClient (retry off). */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { queryClient, ...render(ui, { wrapper: makeWrapper(queryClient), ...options }) }
}
```

**S2.10 — Data-driven nav, `Sidebar`, `AppShell`, `(app)/layout.tsx` (X33, KEY-02, NFR-07b part). Tests first.**
`src/components/shell/AppShell.test.tsx` (ui; `vi.mock('next/navigation', () => ({ usePathname: () => '/home' }))`; `renderWithProviders(<AppShell><p>content</p></AppShell>)`):
- renders `navigation` named `th.nav.sidebarLabel` with link `th.nav.home` → `href="/home"`, `aria-current="page"`; children inside `main#main`.
- clicking the button named `th.nav.collapseSidebar` → `app-sidebar` has `data-collapsed="true"`; the button is now named `th.nav.expandSidebar` with `aria-expanded="false"`; the home link keeps its accessible name.
- `fireEvent.keyDown(document.body, { code: 'Backslash', key: 'ฃ', ctrlKey: true })` toggles; `{ metaKey: true, key: '\\' }` toggles back.
- with a rendered `<input>` focused, the shortcut does not toggle.
- clicking `th.nav.openMenu` opens a drawer with a second navigation; `Escape` closes it (`waitForElementToBeRemoved`).
- the first `Tab` from the body focuses the skip link `th.nav.skipToContent`.
`src/components/shell/nav.ts`:
```ts
import { th } from '@/i18n/th'

/** A key of Sidebar's icon map — nav.ts stays data-only (no component imports). Later keys: M1 'settings',
 *  M2 'projects' | 'clients', M3 'my' | 'teamTasks', M5 'calendar', M9 'workload' | 'people'. */
export type NavIcon = 'home'
export interface NavItem {
  /** stable id used by tests and badges: 'home', 'my', 'tasks', 'workload', 'calendar', 'people', 'clients', 'settings' (X84) */
  id: string
  href: string
  label: string
  icon: NavIcon
  /** shown only to managers (M1+: settings) */
  managerOnly?: boolean
  // M3 adds `badge?: NavBadge` with `export type NavBadge = 'myTaskCount'`; M9 widens it to 'myTaskCount' | 'workloadOver' (X84).
}
/** Top group. Only implemented areas appear (X33: no dead links). Final order (X84, SPEC §8.1):
 *  home, my, tasks, workload, calendar — M3 appends my + tasks, M5 appends calendar, M9 inserts workload before calendar. */
export const PRIMARY_NAV: readonly NavItem[] = [{ id: 'home', href: '/home', label: th.nav.home, icon: 'home' }]
/** Bottom group (SPEC §8.1 "👥 ทีมงาน 🏢 ลูกค้า ⚙️ ตั้งค่า"). Empty in M0 and not rendered while empty.
 *  Final order: people (M9), clients (M2), settings (M1, managerOnly) — M2 inserts clients before settings, M9 people before clients.
 *  The projects section header (M2) is a separate constant, never part of either group. */
export const BOTTOM_NAV: readonly NavItem[] = []
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
```
`src/components/shell/Sidebar.tsx` (`'use client'`): props `{ collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }`. Header row: app name `th.meta.appName` (hidden when collapsed) + toggle `IconButton` (only when `onToggle`; icons `@mui/icons-material/MenuOpen` / `Menu`) wrapped in `<Tooltip title={th.nav.toggleHint(label)} describeChild>`. Body: `<nav aria-label={th.nav.sidebarLabel}>` → `<ul>` of `PRIMARY_NAV` rows (and, at the bottom, a second `<ul>` of `BOTTOM_NAV` rows only when it is non-empty) rendered as `<Link className={styles.row} href aria-current aria-label={collapsed ? item.label : undefined} onClick={onNavigate}>` with an icon map `const NAV_ICONS: Record<NavIcon, typeof HomeOutlined> = { home: HomeOutlined }` (every milestone that widens `NavIcon` adds its entry here, so typecheck catches a missing icon) and the label `<span>` hidden when collapsed (collapsed rows show a `Tooltip` with the label, `placement="right"`). `usePathname()` drives `isActive`. Styles in `Sidebar.module.css` reading `var(--mui-palette-*)` and tokens (active row: `--brand-light` background + `--brand-navy` text + a 3 px left bar, so state is not colour-only).
`src/components/shell/AppShell.tsx` (`'use client'`):
```tsx
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false) // M1 persists it in user_preferences (X33)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const toggle = () => setCollapsed((c) => !c)
  useHotkeys([{ hotkey: HOTKEYS.toggleSidebar, handler: toggle }])
  return (
    <div className={styles.shell} data-collapsed={collapsed}>
      <a className={styles.skipLink} href="#main">{th.nav.skipToContent}</a>
      <aside id="app-sidebar" data-testid="app-sidebar" data-collapsed={String(collapsed)} className={styles.sidebar}>
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </aside>
      <header className={styles.mobileBar}>
        <IconButton aria-label={th.nav.openMenu} onClick={() => setDrawerOpen(true)}><MenuIcon /></IconButton>
        <span>{th.meta.appName}</span>
      </header>
      <Drawer variant="temporary" open={drawerOpen} onClose={() => setDrawerOpen(false)} slotProps={{ paper: { sx: { width: 264 } } }}>
        <Sidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
      <main id="main" tabIndex={-1} className={styles.main}>{children}</main>
    </div>
  )
}
```
`AppShell.module.css`: grid `248px 1fr` (collapsed `56px 1fr`, transition on width); `@media (max-width: 899.95px)` → `.sidebar { display: none }`, `.mobileBar { display: flex }` (hidden otherwise); `.skipLink` visually hidden until `:focus`; `.main` max content width 1200 px with padding (grid pages override later).
`src/app/(app)/layout.tsx` (server component): `export default function AppLayout({ children }: LayoutProps<'/'>) { return <AppShell>{children}</AppShell> }` — M1 puts `requirePageUser()` at the top (before any Suspense, X41). If `LayoutProps<'/'>` does not fit a route-group layout after `next typegen`, type the props as `{ children: ReactNode }`.
Done-check: `pnpm exec vitest run --project ui src/components src/hooks` green. If `next/link` misbehaves in jsdom, `vi.mock('@/components/Link', …)` with a plain `<a>` in the test (report it).

**S2.11 — `src/lib/format.ts` (UI-12, M0-D23). Test first.**
`src/lib/format.test.ts` (unit):
| call | expected |
|---|---|
| `formatThaiDate('2026-09-30')` | `'30 ก.ย. 2569'` |
| `formatThaiDate('2026-12-28')` | `'28 ธ.ค. 2569'` |
| `formatThaiDate('2027-01-04')` | `'4 ม.ค. 2570'` |
| `formatThaiDate('2026-09-30', 'long')` | `'30 กันยายน 2569'` |
| `formatThaiDate('2026-02-30')`, `formatThaiDate('2026-9-30')`, `formatThaiDate('')` | throw `RangeError` |
| `formatWeekHeader('2026-09-28')` / `formatWeekHeader('2027-01-04')` | `'28/9'` / `'4/1'` |
| `formatThaiInstantDate(new Date('2026-09-29T23:30:00Z'))` | `'30 ก.ย. 2569'` (Bangkok is already the 30th) |
| `formatThaiInstantDate(new Date('2026-09-30T16:59:59Z'))` / `('2026-09-30T17:00:00Z')` | `'30 ก.ย. 2569'` / `'1 ต.ค. 2569'` |
| `vi.stubEnv('TZ', 'America/Los_Angeles')` then `formatThaiDate('2026-09-30')` | still `'30 ก.ย. 2569'` |
```ts
export type ThaiDateStyle = 'medium' | 'long'
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Plan date 'YYYY-MM-DD' → "30 ก.ย. 2569" (SPEC §8.8, B.E.). Builds a UTC Date and formats in UTC — with
 *  todayBangkok() (M1) the only places allowed to construct a Date from a plan date (PLAN.md §3.6). */
export function formatThaiDate(iso: string, style: ThaiDateStyle = 'medium'): string
/** Grid week header "30/9" (no year). */
export function formatWeekHeader(weekStart: string): string
/** An instant (timestamp) shown as a Thai date in Asia/Bangkok. Not for plan dates. */
export function formatThaiInstantDate(instant: Date, style: ThaiDateStyle = 'medium'): string
```
Parse with `ISO.exec`, reject when `Date.UTC(y, m - 1, d)` round-trips to a different day; format with `new Intl.DateTimeFormat('th-TH', { dateStyle: style, timeZone: 'UTC' | 'Asia/Bangkok' })`; `formatWeekHeader` uses the parsed integers (no Intl). Never `toFixed`, never local-time getters. M1 adds `formatWeekday`; M4 `formatRelative`. Done-check: unit test green.

**S2.12 — `/home` placeholder (X32, M0-D6).**
`src/app/(app)/home/request-date.ts`:
```ts
import 'server-only'
import { formatThaiInstantDate } from '@/lib/format'
/** M0 only: request-time date in Asia/Bangkok. M1 replaces the call site with formatThaiDate(serverToday()) (X45). */
export function requestDateLabel(): string {
  return formatThaiInstantDate(new Date())
}
```
`src/app/(app)/home/page.tsx` (server component): `export const metadata: Metadata = { title: th.home.title }`; renders `Typography variant="h4" component="h1"` `th.home.title`, a `Typography` with `th.home.greeting`, a `Typography sx={{ color: 'text.secondary' }}` with `th.home.today(requestDateLabel())`, then `<EmptyState title={th.home.placeholderTitle} description={th.home.placeholderBody} />`. No links (no other area is implemented yet, X32). Done-check: tsc + lint clean (the page is covered by e2e).

**S2.13 — Stream done-check.** `pnpm exec vitest run --project unit src/lib src/i18n`, `pnpm exec vitest run --project ui` green; `pnpm exec eslint src/app src/components src/hooks src/lib tests/helpers --max-warnings 0` clean (ignore errors in other streams' files); `pnpm exec tsc --noEmit` clean for owned paths; `grep -rnE "https?://" src/app src/components src/hooks src/lib/theme src/lib/format.ts --include=*.ts --include=*.tsx --include=*.css | grep -v "localhost"` → nothing (no remote asset, NFR-09). Report files, tests and any i18n key added (with its namespace).

### 5.S3 — E2E harness + m0 smoke (test-engineer · `playwright.config.ts`, `e2e/**`)

Runs in parallel with S1 and S2, coding against the UI contract in §5.S2 and the `th` keys from S0.10. **Never runs Playwright tests** (the integrator does at G2); verifies with `pnpm exec playwright test --list`, ESLint and tsc. Thai text is allowed in `e2e/**` by lint, but every UI string is imported from `src/i18n/th.ts`.

**S3.1 — `e2e/env.ts` (single source of e2e constants).**
```ts
const ADMIN_URL = process.env.E2E_ADMIN_DATABASE_URL ?? 'postgres://planner:planner@localhost:54329/postgres'

export const E2E = {
  port: 3100,
  baseUrl: 'http://localhost:3100',
  dbName: 'planner_e2e',
  adminUrl: ADMIN_URL,
  databaseUrl: ADMIN_URL.replace(/\/[^/?]+(\?|$)/, '/planner_e2e$1'),
  /** Server "today" for M1+ (X45) and the browser clock (PLAN.md §4.5). */
  appNow: '2026-09-30T10:00:00+07:00',
  /** e2e-only secret, ≥ 32 chars; never used outside planner_e2e. */
  authSecret: 'e2e-only-secret-not-for-production-0123456789',
  uploadDir: '.e2e-uploads',
} as const
```

**S3.2 — E2E database: `e2e/db.ts`, `e2e/prepare-db.ts`, `e2e/global-setup.ts` (M0-D18).**
```ts
// e2e/db.ts
import postgres from 'postgres'
import { runMigrations } from '../scripts/lib/migrate'
import { E2E } from './env'

/** Idempotent: create planner_e2e if missing, then apply pending migrations. Never drops (M1 resetDb truncates). */
export async function prepareE2eDb(): Promise<void> {
  const admin = postgres(E2E.adminUrl, { max: 1, onnotice: () => {} })
  try {
    const [row] = await admin<{ exists: boolean }[]>`select exists(select 1 from pg_database where datname = ${E2E.dbName}) as exists`
    if (!row?.exists) await admin.unsafe(`create database ${E2E.dbName}`)
  } finally {
    await admin.end()
  }
  await runMigrations(E2E.databaseUrl)
}
```
```ts
// e2e/prepare-db.ts — run by webServer.command BEFORE `pnpm build` (readiness URL /api/health needs the DB)
import { prepareE2eDb } from './db'
prepareE2eDb().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
```
```ts
// e2e/global-setup.ts — also covers reuseExistingServer (command not run). M1 adds nothing here: resetDb runs per spec file.
import { prepareE2eDb } from './db'
export default async function globalSetup(): Promise<void> {
  await prepareE2eDb()
}
```

**S3.3 — `playwright.config.ts`** (base `plan/research/snippets/r4/playwright/playwright.config.ts`, PLAN §4.5; no setup project / storageState — X46 logs in through the API per spec from M1):
```ts
import { defineConfig, devices } from '@playwright/test'
import { E2E } from './e2e/env'

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1, // one shared planner_e2e; specs reset in beforeAll from M1
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: E2E.baseUrl,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'pnpm exec tsx e2e/prepare-db.ts && pnpm build && pnpm start -p 3100',
    url: `${E2E.baseUrl}/api/health`,
    timeout: 300_000,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL: E2E.databaseUrl,
      ALLOW_TEST_HOOKS: '1', // consumed from M1 (clock, rate limit off)
      APP_NOW: E2E.appNow, // consumed from M1 (X45)
      BETTER_AUTH_URL: E2E.baseUrl,
      BETTER_AUTH_SECRET: E2E.authSecret,
      SECURE_COOKIES: 'false',
      UPLOAD_DIR: E2E.uploadDir,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
})
```
`next start` prints a harmless warning with `output: 'standalone'` (r4 fact 43). Process env wins over `.env`, so the dev `DATABASE_URL` in `.env` is not used.

**S3.4 — `e2e/fixtures.ts`: clock pin + CSP / external-request / page-error guards (every test, auto).** The three guards are **named exports** (X91, C71) — the auto fixture calls them, and M11's `e2e/perf/fixtures.ts` imports them (never copies them).
```ts
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import { E2E } from './env'

export type GuardLog = { csp: string[]; external: string[]; errors: string[] }
export const newGuardLog = (): GuardLog => ({ csp: [], external: [], errors: [] })
export const isLocalUrl = (url: URL): boolean => url.hostname === 'localhost' || url.hostname === '127.0.0.1'

/** CSP guard: every `securitypolicyviolation` in any frame of the page is recorded. */
export async function installCspGuard(page: Page, log: GuardLog): Promise<void> {
  await page.exposeFunction('__e2eCspViolation', (v: string) => { log.csp.push(v) })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const w = window as unknown as { __e2eCspViolation: (v: string) => Promise<void> }
      void w.__e2eCspViolation(`${e.violatedDirective} blocked=${e.blockedURI} at ${e.sourceFile}:${e.lineNumber}`)
    })
  })
}
/** External-request guard (NFR-09): nothing may leave the machine; aborted and recorded. */
export async function installExternalRequestGuard(context: BrowserContext, log: GuardLog,
    isAllowed: (url: URL) => boolean = isLocalUrl): Promise<void> {
  await context.route((url) => (url.protocol === 'http:' || url.protocol === 'https:') && !isAllowed(url), async (route) => {
    log.external.push(route.request().url())
    await route.abort()
  })
}
/** Page-error guard: uncaught errors and console errors not matched by `allowed`. */
export function installPageErrorGuard(page: Page, log: GuardLog, allowed: readonly RegExp[] = []): void {
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !allowed.some((re) => re.test(m.text()))) log.errors.push(`console: ${m.text()}`)
  })
}
export function expectGuardsClean(log: GuardLog): void {
  expect(log.csp, 'CSP violations').toEqual([])
  expect(log.external, 'external requests').toEqual([])
  expect(log.errors, 'page errors').toEqual([])
}

type Options = { allowedConsoleErrors: RegExp[] }
type Guards = { guards: GuardLog }

export const test = base.extend<Options & Guards>({
  allowedConsoleErrors: [[], { option: true }],
  guards: [
    async ({ page, context, allowedConsoleErrors }, use) => {
      const log = newGuardLog()
      await installCspGuard(page, log)
      await installExternalRequestGuard(context, log)
      installPageErrorGuard(page, log, allowedConsoleErrors)
      await page.clock.setFixedTime(new Date(E2E.appNow)) // before the first goto (PLAN.md §4.5)
      await use(log)
      expectGuardsClean(log)
    },
    { auto: true },
  ],
})
export { expect }
// M1 adds resetDb(fixture?, opts?) and loginAs(page, who) (PLAN.md §4.5, X91).
```
Rules every later spec inherits (C7): the guards stay on in every spec (no spec overrides `guards` or removes the external-request route); `allowedConsoleErrors` is set per `describe` only, and only as narrowly as the deliberate failure needs (e.g. `test.use({ allowedConsoleErrors: [/status of 404/] })` for a spec that fetches a hidden id, `[/status of 415/]` for a rejected upload) — never a catch-all pattern.

**S3.5 — `e2e/pages/shell.ts` (page object; every later spec navigates through it).**
```ts
import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../src/i18n/th'

export class ShellPage {
  constructor(readonly page: Page) {}
  sidebar(): Locator { return this.page.getByTestId('app-sidebar') }
  nav(): Locator { return this.page.getByRole('navigation', { name: th.nav.sidebarLabel }) }
  navLink(label: string): Locator { return this.nav().getByRole('link', { name: label, exact: true }) }
  collapseButton(): Locator { return this.page.getByRole('button', { name: th.nav.collapseSidebar, exact: true }) }
  expandButton(): Locator { return this.page.getByRole('button', { name: th.nav.expandSidebar, exact: true }) }
  menuButton(): Locator { return this.page.getByRole('button', { name: th.nav.openMenu, exact: true }) }
  async goto(path = '/home'): Promise<void> { await this.page.goto(path) }
  async pressToggleShortcut(): Promise<void> { await this.page.keyboard.press('ControlOrMeta+Backslash') }
  async expectCollapsed(collapsed: boolean): Promise<void> {
    await expect(this.sidebar()).toHaveAttribute('data-collapsed', String(collapsed))
  }
}
```

**S3.6 — `e2e/m0-smoke.spec.ts`.** `import { test, expect } from './fixtures'`; strings from `th`; `formatThaiInstantDate` from `../src/lib/format`; `buildCsp` from `../src/lib/csp`. Scenarios in §7.3 (each one a `test(...)`); no `waitForTimeout`; wait on UI state only.

**S3.7 — Stream done-check.** `pnpm exec playwright test --list` lists every m0 test without compile errors; `pnpm exec eslint e2e playwright.config.ts --max-warnings 0` clean; `pnpm exec tsc --noEmit` clean for owned paths. Report which tests are expected to fail before S1/S2 integrate (all of them until the UI and proxy exist).

---

## 6. Integration (orchestrator)

**Expected requests** (apply after Build, before G2):
| From | Likely request | Resolution |
|---|---|---|
| S2 | an extra `th` key in an M0 namespace | S2 may Edit it itself (PLAN §2.3 rule 3); verify `th.test.ts` still passes |
| S2/S3 | DOM-contract detail differs (e.g. Drawer nav needs its own test id) | fix the implementation to match §5.S2 "UI contract"; change the contract only with a Decision and update both sides |
| S1 | `next/server` cannot be imported in Vitest | keep matcher/header unit tests; the e2e security-header test covers the request-override path (S1.5 note) |
| S2 | `useEffectEvent` missing from the installed React types | ref + `useLayoutEffect` fallback (S2.8 note) |
| any | new dependency | refuse unless a Decision row is added (CLAUDE.md); install once with `pnpm add` by the integrator |

**Wiring order and commands (G2):**
1. I1 — `pnpm install --frozen-lockfile` (lockfile in sync), `pnpm exec node -v` → `v22.23.x`.
2. I2 — `pnpm db:up && pnpm db:migrate` → applied / no-op.
3. I3 — `pnpm db:generate` → **"No schema changes, nothing to migrate"**; `pnpm exec drizzle-kit check` → no collisions; `git status --short drizzle` shows only the M0 files.
4. I4 — `pnpm exec prettier --check .` (fix with `pnpm format` if needed; protected docs are ignored) and `pnpm check` → green (typecheck incl. `next typegen`, lint with `--max-warnings 0`, Vitest unit + ui + integration, coverage gate).
5. I5 — snapshot the protected docs into the index: `git add CLAUDE.md SPEC.md PROGRESS.md PLAN.md tech-stack.md docs plan .claude`.
6. I6 — dev smoke (SPEC §12 M0 "pnpm dev เปิดได้"): start `pnpm dev` in the background (`run_in_background`); poll until `curl -fsS http://localhost:3000/api/health` returns `{"ok":true}`; then `curl -fsS http://localhost:3000/home -o "$TMPDIR/m0-home.html" && grep -q 'lang="th"' "$TMPDIR/m0-home.html" && grep -q '<h1' "$TMPDIR/m0-home.html"` and `curl -sI http://localhost:3000/home | grep -i "content-security-policy:.*unsafe-eval"` (dev policy); stop the dev server (kill the background task). Must happen **after** I5 so a `CLAUDE.md` write is caught.
7. I7 — `pnpm test:e2e` (builds once via `webServer`, `next start -p 3100`) → `m0-smoke` green. Only one `next build` per checkout: make sure no other build runs.
8. I8 — protected-doc gate: `git diff --exit-code -- CLAUDE.md SPEC.md PROGRESS.md docs/` **and** `test ! -e AGENTS.md`. Any diff in `CLAUDE.md` means `agentRules: false` did not take effect — restore with `git checkout -- CLAUDE.md`, fix `next.config.ts`, re-run I6–I8.
9. I9 — hygiene: `git status --short --ignored | grep -E '\.env$|node_modules|\.next|test-results|playwright-report|coverage|\.e2e-uploads'` only under `!!` (ignored); `grep -rn "fonts.googleapis\|cdn\." src` → nothing.

---

## 7. Verification

### 7.1 AC → test map

SPEC §12 M0 defines no AC ids; its "Done when" and the in-scope rows (§1.1) are mapped below. No partial ACs (X12–X14) touch M0.

| Requirement | Test(s) |
|---|---|
| SCAF-05a `pnpm dev` opens | §6 I6 (health + `/home` HTML contains `th.home.title`) |
| SCAF-05b `pnpm check` green | §6 I4 (G2), G0 (S0.15), G4 |
| SCAF-05c e2e smoke opens the first page | `e2e/m0-smoke.spec.ts` › "root redirects to /home", "home renders the Thai shell" |
| SCAF-01 toolchain strict | G2 lint (`--max-warnings 0`, Thai ban, no-any, ban-ts-comment, eslint-comments) + typecheck (TS 6 strict, `noUncheckedIndexedAccess`) |
| SCAF-02 Drizzle + dev DB + scripts | `src/server/db/schema.int.test.ts` (migrations = journal), `client.int.test.ts`, `scripts/lib/migrate.int.test.ts`; §6 I2–I3 |
| SCAF-03 th.ts + shell + font | `src/i18n/th.test.ts`; `AppShell.test.tsx`; e2e "home renders the Thai shell", "self-hosted Thai font is used" |
| UT-09 domain coverage gate | `vitest.config.ts` thresholds active in `pnpm test` (G0/G2) |
| A11Y-3 / UI-10 tokens + contrast | `src/lib/theme/contrast.test.ts` (all four `it`s) |
| UI-11 no Thai outside i18n | lint rule 5a (G0/G2) |
| UI-12 Thai dates | `src/lib/format.test.ts` |
| UI-14 self-hosted font | e2e "self-hosted Thai font is used" |
| UI-01 part / X33 sidebar shell | `AppShell.test.tsx`; e2e "sidebar collapses with the shortcut and the button" |
| KEY-02 `Cmd/Ctrl+\` (e.code) | `keys.test.ts`, `useHotkeys.test.tsx`, `AppShell.test.tsx`; e2e "sidebar collapses…" |
| NFR-07b part (narrow drawer) | `AppShell.test.tsx` (drawer + Esc); e2e "narrow screens use a temporary drawer" |
| NFR-08c headers + CSP | `src/lib/csp.test.ts`, `src/proxy.test.ts`; e2e "security headers and CSP nonce"; CSP guard on every e2e test |
| NFR-09 offline | e2e external-request guard on every test; S2.13 grep; §6 I9 grep |
| DEP-07 env | `src/server/env.test.ts` (incl. `.env.example` sync) |
| DEP-16 dev compose | G0 `pnpm db:up --wait`; `client.int.test.ts` (UTC, `en_US.utf8`, Thai trigrams) |
| DM-01 extensions | `schema.int.test.ts` "has the M0 extensions"; `client.int.test.ts` "produces Thai trigrams" |
| DM-18 part orderKey/timestamptz | `schema.test.ts`; `schema.int.test.ts` "orderKey collation sorts like JS <" |
| ARC-01/02/03 lint guards | lint config blocks 2, 3, 5a–5d (G0/G2) |
| X32 `/` → `/home` | e2e "root redirects to /home" |
| PUBLIC-health | `health.int.test.ts`; e2e "health endpoint is public and uncached" |
| M0-D21 Thai error pages | `src/app/error.test.tsx`; e2e "unknown page shows the Thai 404" |

### 7.2 Authz matrix rows added

None. M0 has no server action and no data-reading route; SPEC §3.2 rows begin in M1 (employees) and M2 (projects). The one route is public by design:

| PERM id | Action / route | M | L | Me | W | Anonymous | Mutates | Test |
|---|---|---|---|---|---|---|---|---|
| — (PUBLIC-health) | `GET /api/health` | 200 | 200 | 200 | 200 | 200 | no | `health.int.test.ts` "needs no session"; e2e "health endpoint is public and uncached" |

M1 creates `tests/authz/matrix.int.test.ts` and may add a `public` row for `/api/health` there.

### 7.3 E2E scenarios — `e2e/m0-smoke.spec.ts`

Determinism: browser clock pinned to `E2E.appNow` by the auto fixture; the server has no business clock in M0, so the only date assertion computes its expectation with the same helper at test time (`th.home.today(formatThaiInstantDate(new Date()))`, M0-D6). No reset needed (no tables). Viewport 1440×900 unless stated. All selectors via `ShellPage` and `th`.

| # | test | steps | assertions |
|---|---|---|---|
| 1 | root redirects to /home | `request.get('/', { maxRedirects: 0 })`; `page.goto('/')` | status 307, `location` ends with `/home`; `page` URL is `/home` |
| 2 | home renders the Thai shell | `shell.goto('/home')` | `html[lang=th]` and its class contains `light`; `page.title()` = `th.meta.titleTemplate.replace('%s', th.home.title)`; `h1` = `th.home.title`; texts `th.home.greeting`, `th.home.today(formatThaiInstantDate(new Date()))`, `th.home.placeholderTitle`; `meta[name=viewport]` content contains `interactive-widget=resizes-content`; `shell.navLink(th.nav.home)` has `aria-current="page"` |
| 3 | self-hosted Thai font is used | collect responses ending in `.woff2` while loading `/home`; `await page.evaluate(() => document.fonts.ready)` | ≥ 1 woff2 response, all from `localhost:3100/_next/static/media/` with status 200; loaded `document.fonts` families include `plexThai` and `plexLatin` (substring match); `getComputedStyle(h1).fontFamily` contains `plexLatin` before `plexThai` |
| 4 | security headers and CSP nonce | `const res = await page.request.get('/home')`; read headers + body | `nonce` = capture of `/'nonce-([^']+)'/` in `content-security-policy`; header equals `buildCsp(nonce, { dev: false, https: false })`; no `strict-dynamic`, no `unsafe-eval`, no `upgrade-insecure-requests`; every `<script` tag in the body carries `nonce="<nonce>"`; `x-content-type-options: nosniff`; `referrer-policy: strict-origin-when-cross-origin`; `permissions-policy` = `camera=(), microphone=(), geolocation=()`; `x-frame-options: DENY`; no `strict-transport-security`; no `x-powered-by`; a second request gets a different nonce |
| 5 | sidebar collapses with the shortcut and the button | `shell.goto()`; `shell.expectCollapsed(false)`; `shell.pressToggleShortcut()`; then click `shell.expandButton()`; then `shell.collapseButton().click()` | collapsed → `data-collapsed=true`, `expandButton()` visible with `aria-expanded=false`, `shell.navLink(th.nav.home)` still visible by name; after the button click → expanded; after the last click → collapsed |
| 6 | keyboard: skip link and focus | `shell.goto()`; `page.keyboard.press('Tab')`; `Enter` | skip link `th.nav.skipToContent` focused and visible; after Enter, `#main` is focused |
| 7 | narrow screens use a temporary drawer | `page.setViewportSize({ width: 800, height: 900 })`; `shell.goto()`; `shell.menuButton().click()`; `Escape` | `shell.sidebar()` not visible and `shell.nav()` not visible (permanent nav is `display: none`); after the click `shell.nav()` (now the drawer's) is visible with `shell.navLink(th.nav.home)`; after Escape `shell.nav()` is hidden again |
| 8 | health endpoint is public and uncached | `request.get('/api/health')` (no cookies) | 200, JSON `{ ok: true }`, `cache-control` contains `no-store`, `x-content-type-options: nosniff` |
| 9 | unknown page shows the Thai 404 | `test.use({ allowedConsoleErrors: [/status of 404/] })`; `page.goto('/no-such-page')` | response status 404; `h1` = `th.errors.notFoundPage.title`; link `th.common.backToHome` → `/home` |
| all | guards (auto fixture) | — | zero CSP violations, zero non-localhost requests, zero page errors / console errors |

**Update older specs:** none (first milestone). Forward note for M1 (its plan must include it): `m0-smoke` tests 1–7 and 9 must log in first (`loginAs(page, 'manager')`) because the proxy will redirect anonymous users to `/login?next=`; test 2's date expectation becomes `th.home.today(formatThaiDate('2026-09-30'))` once `/home` uses `serverToday()` with `APP_NOW`; test 8 stays anonymous.

### 7.4 Golden / perf / manual checks

- Golden: none (no data until M1).
- Perf: none in M0 (M6 smoke, M11 full).
- Manual (orchestrator, once, note results in the close-out report):
  1. Chrome at 1280 px and 800 px: shell, drawer, focus ring visible on Tab.
  2. macOS with the Thai Kedmanee keyboard layout active: `⌘\` still toggles the sidebar (X49).
  3. Safari (latest): Thai text renders in IBM Plex Sans Thai, not Thonburi (r1 §14 uncertainty).
  4. DevTools Network with "Offline" after first load → reload shows no request to a non-local host.

---

## 8. Definition of done

- [ ] SPEC §12 M0 "Done when": `pnpm dev` opens (§6 I6), `pnpm check` green (§6 I4), e2e smoke passes (§6 I7).
- [ ] Every row of §1.1 has its test(s) from §7.1 passing.
- [ ] `pnpm check` green with `pnpm db:up` (unit, ui and integration projects all ran ≥ 1 test file each by G2; coverage gate active).
- [ ] `pnpm test:e2e` green: `e2e/m0-smoke.spec.ts` (no older specs exist).
- [ ] `pnpm db:generate` → "No schema changes"; `drizzle/` contains only `0000_extensions.sql` + `meta/`.
- [ ] `git diff --exit-code -- CLAUDE.md SPEC.md PROGRESS.md docs/` clean after `pnpm dev` and e2e; no `AGENTS.md`; `README.md` not created.
- [ ] `pnpm exec node -v` → v22.23.x; no `npm`/`npx` in any script, doc step or config (`grep -rn "npx \|npm run\|npm exec" package.json playwright.config.ts e2e scripts` → nothing).
- [ ] No `any`, no `@ts-ignore`, no undescribed `eslint-disable` (enforced by lint); no Thai literal outside `src/i18n/**`, tests, e2e, scripts.
- [ ] No `localStorage`/`sessionStorage` (lint); no runtime CDN/Google Fonts (e2e guard + grep).
- [ ] CLAUDE.md hard rules with no code in M0 (authz-before-data, masking, action pattern, multi-table tx, cd integers, `week_start` ranges, WEEK↔DAY, undo instead of confirm, name-only task creation) are untouched; the guards that protect them later are active: Thai-literal ban, `src/domain` import/`Date` bans, no-any, ban-ts-comment, eslint-comments, storage ban, schema-only-via-`schema.ts` + journaled custom migrations.
- [ ] Authz: no new action/route needing rows (§7.2); `/api/health` public by Decision M0-D11.
- [ ] `PROGRESS.md` updated (§10); Decisions M0-D1…M0-D25 and the X-rows of §3.1 present; Deviations X51, M0-D4 and M0-D25 present.
- [ ] `.env` untracked; `.env.example` tracked; `pnpm-lock.yaml` and `pnpm-workspace.yaml` (incl. any `minimumReleaseAgeExclude`) tracked.
- [ ] First commit `feat(m0): …` on `main` and tag `m0` (§10).

---

## 9. Risks and gotchas

| # | Pitfall (source) | Mitigation (step) |
|---|---|---|
| 1 | `next dev` 16.3 appends a managed block to `CLAUDE.md` when it detects an agent (r1 §2.6) | `agentRules: false` written in S0.4 before any `next` command; `--no-agents-md`; I5–I8 diff gate |
| 2 | `npm`/`npx` inside the repo fail with EBADDEVENGINES; bare `node` is v26 (r1 §10.3) | only `pnpm <script>` / `pnpm exec` / `pnpm dlx`; the single global `npm install -g pnpm` runs in S0.1 before `devEngines` exists |
| 3 | `pnpm add <pkg>` without a version pulls TS 7 / ESLint 10 / Drizzle 1.0 RC (PLAN §1.2) | S0.4 writes exact specifiers into `package.json` and installs once (S0.5); integrator installs only with a Decision |
| 4 | pnpm 12 `strictDepBuilds` → `ERR_PNPM_IGNORED_BUILDS`; unknown `pnpm-workspace.yaml` keys are errors (r1 §10.1–10.2) | `allowBuilds` in S0.4; never add `useNodeVersion`/`onlyBuiltDependencies`/`minimumReleaseAge` |
| 5 | TS 6: `types: []` default (TS2591 `process`), `baseUrl` = error TS5101, `noUncheckedSideEffectImports` (r4 fact 3) | S0.6 tsconfig; `const [row] = rows; row?.x` pattern |
| 6 | `tsc` fails on a clean checkout until `next typegen` (r1 §2.2); concurrent `next typegen` writes race | `typecheck` script = `next typegen && tsc --noEmit`; streams run only `pnpm exec tsc --noEmit` after S0 ran typegen |
| 7 | `tsconfig` `**/*.ts` would include `plan/research/snippets/**` (imports packages that are not installed) | `exclude` `plan`, `docs`, `.claude` (S0.6); ESLint ignores them (S0.7) |
| 8 | Prettier would rewrite `CLAUDE.md`/`SPEC.md`/`PLAN.md` | `.prettierignore` (S0.7, M0-D14) |
| 9 | Vitest fails with no test files; coverage thresholds with no domain files (r6a M0-08) | S0 ships `th.test.ts`, `schema.test.ts`, `schema.int.test.ts`; fallbacks in S0.15; never `--passWithNoTests` |
| 10 | Two concurrent integration runs drop each other's DBs | per-run DB names (M0-D17, S0.13) |
| 11 | Playwright starts `webServer` before `globalSetup`; `/api/health` needs the DB | DB prepared inside `webServer.command` and again in `globalSetup` (M0-D18, S3.2) |
| 12 | `next start` with `output: 'standalone'` prints a warning (r4 fact 43) | harmless; Docker (M11) runs `node server.js` after copying `.next/static` + `public` |
| 13 | `'strict-dynamic'` + Next bug #98015 can block boundary chunks / hang navigation (r1 §7.2) | no `'strict-dynamic'` (S1.4 test asserts it) |
| 14 | Emotion and sonner inject `<style>` without a nonce (r4 fact 23) | `style-src 'self' 'unsafe-inline'`, never mixed with a style nonce (S1.4 test) |
| 15 | `upgrade-insecure-requests`/HSTS break plain-HTTP LAN installs | emitted only when `SECURE_COOKIES=true` (S1.4) |
| 16 | `/api` must not pass through the proxy (10 MB body buffering, M4 uploads) | matcher excludes `/api` (S1.5 test) |
| 17 | `next/font` default fallbacks put `system-ui` before the Thai family (Safari → Thonburi) (r1 §6.2) | `adjustFontFallback: false`, explicit stack in the theme (S2.1, S2.3); manual check 3 |
| 18 | Postgres `initdb` copies the container `TZ` into `postgresql.conf`; alpine/C-locale images produce no Thai trigrams | `-c timezone=UTC`, no `TZ` env, Debian `postgres:17` (S0.11); asserted in `client.int.test.ts` |
| 19 | `pg_isready` over the socket reports healthy during the init-time server | TCP check `-h 127.0.0.1` (S0.11) |
| 20 | Importing the DB client during `next build` without `DATABASE_URL` | lazy `getEnv()`/`getDb()` + `dynamic = 'force-dynamic'` on `/api/health` (S1.1, S1.2, S1.6) |
| 21 | `'server-only'` throws in Vitest and in `tsx` scripts | Vitest alias (S0.13); scripts never import `db/client.ts` (S1.2 header rule; see cross-milestone note in the report) |
| 22 | Drizzle migrator silently skips out-of-order journal entries (r2 §9.3) | only S0 generates; I3 expects "No schema changes" |
| 23 | `tsx` compiles this package as CommonJS: no top-level await / `import.meta` in scripts | `main().catch(...)` pattern (S0.12, S3.2) |
| 24 | MUI 9 removed v5 props; `Tooltip` with a string title renames the button's accessible name | `slots`/`slotProps`/`sx` only; `describeChild` on the toggle tooltip (S2.10) |
| 25 | MUI components passed as props from RSC resolve to `undefined` (mui#48214); `component={NextLink}` from RSC fails | MUI composition in client components; `@/components/Link` re-export (S2.9) |
| 26 | react-hooks v7 errors: `set-state-in-effect`, `refs`, `purity` (r1 §4) | `useEffectEvent` (S2.8); request-time date computed in `request-date.ts`, not inline in the component (S2.12) |
| 27 | Thai keyboard layout gives Thai `e.key` for shortcuts (PLAN §1.3) | `e.code` first (S2.7 tests include `key: 'ฃ'`) |
| 28 | `next/navigation`/`next/link` in jsdom | mock `usePathname`; Link fallback mock (S2.10) |
| 29 | `formatThaiDate` drifting by a day in timezones west of UTC (r5 §10.2) | UTC-anchored Date + `timeZone: 'UTC'`; test with `TZ=America/Los_Angeles` (S2.11) |

---

## 10. Close-out

1. **PROGRESS.md** (orchestrator only):
   - Status table: M0 → ✅; "Milestone ปัจจุบัน" → `M1 — ยังไม่เริ่ม`; tick every line of "แผนของ milestone ปัจจุบัน".
   - `## Decisions`: ensure the §3.1 X-rows and M0-D1…M0-D25 are present (kickoff copied them; add any Decision a stream reported, e.g. a new `allowBuilds` entry or a script fallback).
   - `## Deviations`: keep the existing MUI row (M0-D4); add
     `| <date> | §8.7 | --load-light-fg / --tentative-fg = #9C6500 | #8F5C00; added --surface, --faded-fg; dark set defined | #9C6500 on #FFEB9C = 4.12:1 < 4.5:1 required by §8.9 (X51, M0-D22) |` and
     `| <date> | §7.2 | drizzle/9999_triggers.sql | journaled custom migrations (drizzle-kit generate --custom) | the migrator runs only journaled files (M0-D25) |`.
   - `## Known issues / TODO ถัดไป`: ESLint 9 is EOL (upgrade = own Decision); Node 22 EOL 2027-04-30; strict style CSP deferred to M11 (optional); `/home` date uses the real request time until M1 (M0-D6); date pickers not installed yet (M0-D16).
2. **Commit** (orchestrator, after G4 = §6 I1–I9 green once more):
```bash
git add -A
git status --short | grep -E '(^|/)\.env$|node_modules/|\.next/' && echo "STOP: ignored file staged" && exit 1
git commit -F - <<'MSG'
feat(m0): scaffold Next.js 16 + MUI 9 Thai shell with strict toolchain, dev DB and test harness

Delivered (SPEC §12 M0): SCAF-01..05, TST-3, UT-09, A11Y-3, UI-01 (shell), UI-10, UI-11, UI-12, UI-14,
KEY-02, NFR-07b (drawer), NFR-08c, NFR-09, DEP-07, DEP-16, DM-01, DM-18 (orderKey), ARC-01..03.
Decisions M0-D1..M0-D25; deviations X51 (token contrast), M0-D25 (journaled custom migrations) and OWN-2 (MUI).

<attribution trailer required by the session, e.g. Co-Authored-By: …>
MSG
git tag m0
git log --oneline -1 && git tag --list m0
```
   If `git config user.name`/`user.email` are unset, stop and ask the owner which identity to use (do not invent one).
3. Review scope for M1 = `git diff m0`.

