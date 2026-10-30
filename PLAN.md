# PLAN — Implementation plan for Team Working OS (multi-agent)

> **Audience:** Claude Code (orchestrator session + subagents) implementing `SPEC.md`, and the product
> owner following progress in `PROGRESS.md`.
> **Written:** 2026-09-30, from SPEC v3.0 (30 ก.ย. 2026), CLAUDE.md, docs/**, and the owner's stack decisions of the same day.
> **Language:** English for engineering instructions; Thai only where quoting UI text or SPEC.

---

## 0. How to use this plan

### 0.1 What is where

| File | Purpose |
|---|---|
| `SPEC.md` | **Single source of truth** — requirements (FR/BR/AC), permissions, schema, build order. |
| `CLAUDE.md` | Non-negotiable working rules (authz, numbers/dates, architecture, UX, deps, DB). |
| `PLAN.md` (this file) | *How* to build it: resolved decisions, multi-agent operating model, architecture conventions and contracts, testing strategy, milestone index, risks. |
| `plan/mNN-*.md` | One file per milestone (M0–M11): streams (machine-readable), step-by-step tasks, tests-first lists, AC → test map, definition of done. |
| `plan/traceability.md` | Every FR/BR/AC/permission row/NFR → milestone → test file. |
| `plan/research/*.md` | Verified library/API facts (versions, exact APIs, pitfalls) gathered on 2026-09-30. Consult before using a library API from memory. |
| `.claude/agents/*.md` | Subagent roles used by the plan (domain, backend, frontend, grid, editor, test, platform engineers + read-only spec reviewer). |
| `.claude/workflows/implement-milestone.js` | Saved workflow that runs one milestone end-to-end (kickoff → contracts → parallel build → gates → adversarial review → fixes → close-out). |
| `PROGRESS.md` | Live status, the current milestone's checklist, Decisions, Deviations, Known issues. |

### 0.2 Precedence when documents disagree

`SPEC.md` > `CLAUDE.md` > `PLAN.md` + `plan/**` > `docs/**`.
If this plan contradicts SPEC, follow SPEC and record the correction in `PROGRESS.md › Decisions`
(and fix the plan in the same commit). Owner decisions recorded in `PROGRESS.md` (e.g. MUI) are
already reflected in SPEC §7.1.

### 0.3 Start-of-session protocol (every session, every agent that orchestrates)

1. Read `PROGRESS.md` → which milestone, which checklist items are done.
2. Read `PLAN.md` §0–§2 (this section and the operating model) and skim §3–§4 headings.
3. Read `plan/mNN-*.md` for the current milestone end-to-end.
4. Read SPEC §0–§3 and the SPEC sections the milestone file lists under "Read first".
5. Continue from the first unchecked item in `PROGRESS.md › แผนของ milestone ปัจจุบัน`.

### 0.4 Keeping the plan honest

- When reality differs from the plan (library API changed, a step is wrong), fix the plan file in the
  same commit as the code and add a `Decisions` row. Never leave the plan describing something the
  code does not do.
- Never implement anything listed as *out of scope* in a milestone file, SPEC §1.4 or SPEC §13.

---

## 1. Resolved decisions and toolchain facts

Everything in this section was decided or verified on 2026-09-30. Evidence is in
`plan/research/` (index: `plan/research/README.md`). Every milestone's kickoff copies the rows of
§1.4 that apply to it into `PROGRESS.md › Decisions`.

### 1.1 Owner decisions (2026-09-30)

| # | Decision | Consequences |
|---|---|---|
| OWN-1 | **Architecture stays SPEC §7.1**: a full-stack Next.js app in TypeScript. The Python/FastAPI backend proposed in `tech-stack.md` is rejected. | CLAUDE.md applies verbatim. One copy of the domain math (`src/domain`) serves both server and client. |
| OWN-2 | **UI kit = Material UI (MUI 9)** instead of Tailwind v4 + shadcn/ui. | The BlockNote editor uses `@blocknote/mantine` themed to MUI (there is no official MUI package). `cmdk` is used headless inside an MUI `Dialog`, and `sonner` stays. SPEC §7.1, §7.2 and §12 M0 are amended, and the change is recorded in `PROGRESS.md › Deviations`. |
| OWN-3 | **Files on a local disk volume** (`UPLOAD_DIR`), as SPEC §7.6/§10 say. No MinIO: its community edition was archived in April 2026, source-only with no images or maintenance. | The `storage.ts` interface keeps an S3-compatible driver (e.g. SeaweedFS or Garage) possible later without touching callers. |

### 1.2 Pinned toolchain and libraries (verified on 2026-09-30)

Install these exact versions or ranges. `pnpm add <pkg>@latest` would pull incompatible majors,
e.g. TypeScript 7.

| Area | Package(s) | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | **22.23.x** via `devEngines.runtime` (`^22.23.0`, `onFail: "download"`); `engines.node` `">=22.22.2 <23"` | The dev machine has Node 26 globally. pnpm downloads and uses Node 22 for every `pnpm run/exec`. Docker uses `node:22-alpine`. Node 22 reaches end of life on 2027-04-30; moving to 24 is a later Decision. |
| Package manager | pnpm | **12.8.1** (`packageManager` field) | Install with `npm install -g pnpm@12.8.1 --allow-scripts=pnpm` (this machine has no corepack). Settings go in `pnpm-workspace.yaml`. |
| Framework | next, eslint-config-next | **16.3.7** | Uses `src/proxy.ts`, not `middleware.ts`. Version-matched docs ship in `node_modules/next/dist/docs`; read them before using a Next API. |
| React | react, react-dom, @types/react(-dom) | **19.3.0** | |
| Language | typescript | **~6.0.3** | **Not 7.x**: typescript-eslint 8.71 requires TypeScript < 6.1. |
| Lint/format | eslint **9.39.x**; typescript-eslint **8.71.0**; @eslint-community/eslint-plugin-eslint-comments ^4.8.1; eslint-config-prettier ^10.1.8; prettier **3.9.9** | | ESLint 9 is end-of-life but it is what eslint-config-next's peers support. ESLint 10 needs a `settings.react.version` workaround; the config is identical, so upgrade later (Decision). |
| UI | @mui/material, @mui/icons-material, @mui/material-nextjs | **9.4.0** | `AppRouterCacheProvider` from `@mui/material-nextjs/v16-appRouter`. |
| UI | @emotion/react, @emotion/styled, @emotion/cache | 11.14.0 / 11.14.1 / 11.14.0 | |
| Date inputs | @mui/x-date-pickers **9.14.0** (MIT), dayjs **1.11.23** | | `AdapterDayjsBuddhist` + `adapterLocale="th"`. Range pickers are Pro, so use two pickers. New dependency (Decision). |
| Fonts | @fontsource/ibm-plex-sans-thai **5.3.0** (dev-only source) | | The woff2 files and the OFL licence are copied into `src/app/fonts/` and loaded with `next/font/local`. |
| Auth | better-auth **1.7.6** (+ dev CLI `auth` 1.7.6) | | The CLI is used only for `auth check schema`; auth tables are hand-written in `schema.ts`. |
| Validation | zod **4.6.5** | | Use `z.uuid()` and `z.iso.date()`; call `z.config(z.locales.th())` once in `src/lib/z.ts`. |
| DB | drizzle-orm **0.45.3**, drizzle-kit **0.31.11**, postgres **3.4.9**; PostgreSQL **17** (`postgres:17`, the Debian image) | | Don't use the Drizzle 1.0 RC. Don't use alpine or C-locale Postgres, because Thai trigram search needs the `en_US.utf8` ctype. |
| Scripts | tsx ^4.23 | | Run scripts through `pnpm exec tsx --env-file-if-exists=.env …`. |
| Client data | @tanstack/react-query **5.104.0** (+ devtools), @tanstack/react-virtual **3.14.13** | | |
| Drag and drop | @dnd-kit/core **6.3.1**, @dnd-kit/sortable **10.0.0**, @dnd-kit/utilities **3.2.2**, @dnd-kit/modifiers **9.0.0** | | Use these classic packages, not the pre-1.0 `@dnd-kit/react`. |
| Palette / toasts | cmdk **1.1.1**, sonner **2.0.8** | | |
| Ordering | fractional-indexing **4.0.0** | | Never pass the `digits` argument. |
| Uploads | file-type **22.1.1** (ESM, Node ≥ 22) | | |
| Editor | @blocknote/core, @blocknote/react, @blocknote/mantine **0.55.0 exact**; @mantine/core, @mantine/hooks **9.6.3** | | MPL-2.0. **Never** use `@blocknote/xl-*` (GPL/commercial). |
| Unit/integration tests | vitest **~5.0.2**, @vitest/coverage-v8, vite **^8.3.1**, @vitejs/plugin-react **^6.1.1**, jsdom **^30.1.1**, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/user-event 14.6.7, @testing-library/jest-dom 7.0.1, fast-check **4.10.2** | | |
| E2E | @playwright/test **~1.63.0** (Chromium) | | |
| Misc | server-only 0.0.1 | | Aliased to an empty module in Vitest. |

Do not use: TypeScript 7, ESLint 10 (for now), Drizzle 1.0 RC, `@dnd-kit/react`, `@blocknote/xl-*`,
`@blocknote/shadcn` (it needs Tailwind), react-hook-form (unless a Decision justifies it), MinIO,
or any v2.1 stack extras (Zustand, TanStack Table, date-fns-tz, Recharts, next-intl, Auth.js, job
runners, SheetJS). See `r5-v21-mining.md` for the full list of conflicts.

### 1.3 API facts that change how code is written

Read the linked research section before writing code in each area.

**Toolchain and workflow** (r1, r4)
- Once `devEngines.runtime` is set, **`npm`/`npx` fail inside the repo** (EBADDEVENGINES), and bare
  `node` is v26. Always use `pnpm <script>`, `pnpm exec <bin>` or `pnpm dlx <pkg>`.
- `pnpm-workspace.yaml` must contain `allowBuilds: { esbuild: true, sharp: false, unrs-resolver: false }`.
  Any new dependency with an install script needs an explicit entry (Decision). pnpm's 24 h
  `minimumReleaseAge` may add `minimumReleaseAgeExclude` entries; commit them.
- `next.config.ts` must set **`agentRules: false` before anyone runs `pnpm dev`**. Otherwise `next dev`
  writes a block into `CLAUDE.md`. M0's gate also checks `git diff --exit-code CLAUDE.md SPEC.md PROGRESS.md docs/`.
- **Only one `next dev` and one `next build` per checkout.** Streams never run them; the integrator
  owns build, dev server and e2e.
- `typecheck` = `next typegen && tsc --noEmit`, because the generated `PageProps`/`LayoutProps`/`RouteContext` are needed.
- TypeScript 6: `"types": ["node"]`, no `baseUrl` (use `paths` only), and `noUncheckedSideEffectImports`
  is on by default. With `noUncheckedIndexedAccess`, write `const [row] = rows; row?.x`.

**Next.js 16.3** (r1)
- Use `src/proxy.ts`, which runs on the Node runtime. Its matcher covers page routes and excludes `/api`, `/_next`, fonts and static files,
  so 25 MB uploads are not buffered or truncated by the proxy. For pages it **validates the session** with
  `auth.api.getSession({ headers, returnHeaders: true })` and forwards `Set-Cookie`. This is required for the
  FR-103 7-day sliding renewal: RSC renders cannot set cookies. The proxy also redirects to
  `/login?next=` when there is no session (AC-101) and to `/account/password` when `mustChangePassword`
  (AC-103), and it sets the CSP nonce and security headers.
- `params`, `searchParams`, `cookies()` and `headers()` are async. Use the generated `PageProps<'/…'>` helpers.
- No `cacheComponents` and no `'use cache'`; every route is dynamic. After a mutation that changes
  RSC-rendered UI, call **`refresh()` from `next/cache` inside the server action**. Do not call client
  `router.refresh()` (known no-op bug #99028) or one-argument `revalidateTag` (it no longer typechecks).
  TanStack-driven views update through cache writes and invalidation.
- **Server Actions are dispatched one at a time per client.** Keep actions fast. Do reads, lock
  heartbeats and autosave-on-leave through route handlers. `saveAllocations` never calls `refresh()`.
- `serverActions.bodySizeLimit: '4mb'`; page JSON is capped at 2 MB by zod.
- `export const viewport = { width: 'device-width', initialScale: 1, interactiveWidget: 'resizes-content' }` (for BlockNote).
- Standalone output: copy `.next/static` and `public` next to `server.js`, set `HOSTNAME=0.0.0.0`, and set
  `outputFileTracingRoot`. Keep the DB client lazy so `next build` works without `DATABASE_URL`.
- CSP, verified clean across MUI, the pickers, BlockNote, server actions and streaming:
  `default-src 'self'; script-src 'self' 'nonce-<n>'` (+ `'unsafe-eval'` in dev only; **no `'strict-dynamic'`**,
  because of Next bug #98015); `style-src 'self' 'unsafe-inline'` (Emotion, Mantine and sonner inject styles);
  `img-src 'self' blob: data:; font-src 'self'; connect-src 'self'` (+ `ws:` in dev);
  `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
  `upgrade-insecure-requests` only when `SECURE_COOKIES=true`. From M0 on, e2e fails on any `securitypolicyviolation`.

**MUI 9.4** (r1, r4)
- Create the theme in a `'use client'` module: `cssVariables: { colorSchemeSelector: 'class' }` plus
  `colorSchemes: { light, dark }`, with `thTH` locales for MUI and the pickers. `AppRouterCacheProvider options={{ nonce, enableCssLayer: true }}`.
  The server renders `<html class="light|dark">` from the user's preference, and `storageManager={null}` (no localStorage).
- MUI 9 API: `slots`/`slotProps`, not `InputProps`, `PaperProps`, `TransitionProps` or `componentsProps`; no
  system props on Box/Stack/Typography (use `sx`); `Grid` takes `size`. Code written from v5 memory will not typecheck.
- To pass `next/link` as `component=`, use a client re-export (`src/components/Link.tsx`). Keep MUI-heavy
  composition in client components.
- CSS Modules override MUI, because MUI styles sit in `@layer mui`. Grid cells read `var(--mui-palette-…)` and the SPEC tokens.
- Icons: use path imports (`@mui/icons-material/Add`).

**Better Auth 1.7.6** (r2; verified config in `snippets/r2/v2/gen/auth.ts`)
- `emailAndPassword { enabled, disableSignUp: true, minPasswordLength: 8, autoSignIn: false }`;
  `session { expiresIn: 604800, updateAge: 86400, cookieCache: { enabled: false } }`;
  `advanced.useSecureCookies = SECURE_COOKIES === 'true'`; `trustedOrigins` from `BETTER_AUTH_URL` (+`TRUSTED_ORIGINS`);
  `advanced.ipAddress.trustedProxies` from `TRUSTED_PROXIES`; `nextCookies()` is the **last** plugin.
- Admin plugin, used only for its schema and sign-in ban enforcement: `createAccessControl` roles
  `{ manager: adminAc-like, worker: userAc-like }`, `adminRoles: ['manager']`, `defaultRole: 'worker'`,
  `bannedUserMessage` taken from `th`. Schema must include `user.ban_expires` and `session.impersonated_by`.
- `disabledPaths`: `/sign-up/email`, `/update-user`, `/change-email`, `/delete-user`, `/change-password`,
  the password-reset and verification paths, and **every `/admin/*` path**. Employee management runs through our transactional
  services with direct inserts: `hashPassword` from `better-auth/crypto`, `account.providerId='credential'`,
  `accountId=userId`, user ids from `crypto.randomUUID()`, emails trimmed and lowercased.
- Login, logout, change-password and sign-out-everywhere are **server actions** calling `auth.api.*` (no authClient).
  Ban means `banned=true` and deleting that user's sessions (AC-104). Banned sign-in returns 403 `BANNED_USER`, mapped to Thai.
- FR-106: table `auth_login_failures(email, ip, created_at)` plus `hooks.before` (≥ 5 failures in 15 min for
  the IP+email pair → `APIError('TOO_MANY_REQUESTS', { code: 'LOGIN_LOCKED' })`) and `hooks.after` (record a failure on
  `INVALID_EMAIL_OR_PASSWORD`, clear on success). Take the IP from `getIP` in `better-auth/api`.
- Built-in rateLimit: enabled in production with a backstop rule `/sign-in/email { window: 60, max: 30 }`, and
  disabled when `ALLOW_TEST_HOOKS=1` (e2e logs in often).
- `session.user.role` is typed `string | null` and must be narrowed in `authz.ts`. Auth tables use `timestamptz`.

**Drizzle 0.45 / postgres.js / PostgreSQL 17** (r2, r4)
- Verified support: `pgEnum`, `check()`, stored `generatedAlwaysAs`, partial and unique partial indexes,
  GIN with `.op('gin_trgm_ops')`, `date({ mode: 'string' })`, numeric returned as a string, composite PKs, self and
  circular FKs. There is no API for EXCLUDE constraints or extensions, so those go in **custom migrations**
  (`pnpm exec drizzle-kit generate --custom --name=<n>`). Name every index explicitly.
- The migrator applies only journal entries **newer than the last one applied**, never compares hashes, and runs all of them in one
  transaction. So **only the contracts stream generates migrations**, sequentially; never edit an applied migration.
- Always `timestamp(..., { withTimezone: true })`; plan dates use `date({ mode: 'string' })`. Map counts with `Number`.
- Errors arrive as `DrizzleQueryError` with the Postgres error in `.cause` (`23P01`, `23505`, `23503`, `23514`,
  `P0001`). Never log `.message` for auth tables, because the params include hashes.
- Fractional-index columns use the `orderKey` customType → `text COLLATE "C"` (the default `en_US.utf8`
  collation mis-orders keys). Sort by `position, id`. The client compares keys with `<`, never `localeCompare`.
- The DB runs in UTC: **never** derive plan dates in SQL (`current_date`, `now()::date`); pass `serverToday()`.
- SPEC DDL corrections, validated on PG 17.11: add `user.ban_expires` and `session.impersonated_by`; add the trigram
  indexes §6.4 promises on `projects.name`, `clients.name`, `"user".name` and `"user".nickname`; wrap `committed`
  in `coalesce(…, 0)`; AM and PM half-days on the same date conflict under the exclusion constraint (see §1.4);
  restoring deleted time off can hit `23P01` (handle it); `numeric(4,2)` silently rounds 0.125, which is harmless because BR-27 values are multiples of 25.
- **BR-20b race:** the trigger cannot see uncommitted rows. **Every allocation writer must first bump or
  lock the assignment row** (`UPDATE task_assignments SET version = version + 1 WHERE id = $1 AND version = $2`
  or `SELECT … FOR UPDATE`) before touching allocations.

**BlockNote 0.55** (r3; harness in `snippets/r3/`)
- Client-only: a Server page → client `EditorClient` using `next/dynamic(..., { ssr: false })` → `PageEditor`. Import only
  `@blocknote/mantine/style.css`; never `inter.css`. There are no remote assets.
- Options: `tables: { headers: true, cellBackgroundColor: true }` (no split cells, no cell text colour),
  `uploadFile` returns `{ type, props }` and must **never reject**, and a custom `pasteHandler` handles Excel,
  Sheets and TSV tables. The stock handler mis-detects TSV as markdown.
- There is no Thai locale. The dictionary lives in `th.editor.blocknote` (`satisfies Dictionary`), and slash items use Thai titles plus
  English aliases. **Ranking matters**: with the stock filter `/หน้า` selects `ย่อหน้า`, so use `rankSuggestionItems`.
  Add word-start guards for `/`, `:` and `@` (otherwise `10:30` becomes an emoji and `1/2` a heading).
- Use a custom attachment block with type `file` and a `size` prop (FR-527), an upload-only file panel, and conversion of
  external `<img>` to links. The server validates and sanitises block JSON (the url must match `^/api/files/<uuid>$`,
  hrefs cannot be `javascript:`, and depth and size are capped). Wrap the editor in an error boundary.
- Autosave: dirty-check against `JSON.stringify(editor.document)` using a baseline taken from the editor itself
  (jsonb reorders keys). Flush on blur, on `visibilitychange` and on unmount.
- The global Cmd+K handler must return early when `e.defaultPrevented` (BlockNote's link shortcut). Global undo ignores
  events from `.bn-editor`. Same-origin links go through `router.push`.

**Client libraries** (r4; code in `snippets/r4/`)
- Grid data: independent **8-week chunk queries** (`useQueries`, key `['grid', ctx, id, { from, expand, zoom, includeOthers }]`)
  instead of `useInfiniteQuery`, because refetching an infinite query is sequential. On a successful save, write the server
  result into every chunk with `setQueriesData`; refetch only after a conflict or an error.
- Grid saves: `useMutation` with `scope: { id: 'grid-save:<ctx>' }`. `baseVersion` is read inside `mutationFn`.
  A snapshot rollback only happens when this is the only pending mutation; otherwise invalidate
  (`snippets/r4/client/components/grid/useSaveAllocations.ts`).
- TanStack Virtual: one scroll container with two virtualizers, `useFlushSync: false`, `getItemKey` = period key,
  `anchorTo: 'end'` if columns are ever prepended, and `measure()` when widths change. In jsdom, stub
  `offsetWidth`/`offsetHeight`. Cover grid behaviour in Playwright.
- dnd-kit tree: use the corrected projection in `snippets/r4/client/components/tree/tree-projection.ts`, which caps depth
  including the subtree height and finds real sibling neighbours. **Never** put `restrictToVerticalAxis` on
  `DndContext`. The server re-validates every move.
- cmdk: `<Command shouldFilter={false} loop vimBindings={false}>` inside an MUI `Dialog` with `slotProps`.
- sonner: `duration: 8000` for undo toasts, with one `ToasterHost` themed from MUI.
- fractional-indexing: generate keys **only on the server** between the real neighbours, inside the transaction, holding a
  per-sibling-scope `pg_advisory_xact_lock`.
- file-type: legacy Office formats are detected as `cfb`, and csv/txt/svg have no magic bytes. Use the classifier matrix in
  `snippets/r4/server/classify-upload.ts`. Thai CSVs may be Windows-874: decode UTF-8 first, then fall back.
- Zod 4: `z.uuid()` (strict RFC; fixtures use real v4 UUIDs), `z.iso.date()`, `z.flattenError`. No react-hook-form: forms
  are controlled MUI inputs plus `schema.safeParse` on the client, and the same schema runs in `action()`.

**Testing** (r4)
- Vitest 5: `pool` defaults to forks. There is no `poolOptions`; `maxWorkers` is top-level. `projects` are `unit` (node), `ui`
  (jsdom) and `integration` (node + DB). `VITEST_POOL_ID` gives each worker its own DB cloned from a migrated
  template (`snippets/r4/vitest/tests/setup/db-*.ts`). Coverage thresholds are keyed by glob (`'src/domain/**'`).
  Mock `next/cache` and `next/headers` in integration tests, and alias `server-only`.
- Playwright 1.63: `page.clock.setFixedTime('2026-09-30T10:00:00+07:00')` before `goto` (timers keep running);
  `install()` + `runFor()` only for timer assertions. Clipboard permissions work in Chromium, and so does synthetic paste
  via `DataTransfer` + `ClipboardEvent`.
- Keyboard layouts: with the Thai Kedmanee layout `e.key` is Thai, so **shortcuts match `e.code`**
  (`KeyF`, `KeyH`, `KeyZ`, `KeyK`, `Digit*`, `Numpad*`, `Period`, `Comma`), with `e.key` as the fallback. The cell parser accepts the Thai
  digits ๐–๙.
- Over plain HTTP (`SECURE_COOKIES=false` on a LAN) the browser has no `crypto.randomUUID` and no async clipboard API:
  never call `randomUUID` in client code, and `copyText()` falls back to `execCommand('copy')`.

### 1.4 Cross-milestone decisions (what lands where)

These settle every "milestone N needs something from milestone > N" problem and every ambiguity
found in research (sources: `r6a-*`, `r6b-*`, `r8-golden.md`). Milestone files cite the IDs.

**Pulled forward / split across milestones**

| ID | Decision | Milestones |
|---|---|---|
| X01 | Implement all of `src/domain/dates.ts` test-first in **M1**, because deactivation and `serverToday()` need it. M5 adds only `capacity.ts`. | M1, M5 |
| X02 | `units.ts`: `numericToCd`/`cdToNumeric` (string-based) land in **M1** for work schedules. Formatting, parsing and fraction conversions land in M6. | M1, M6 |
| X03 | `certainty.ts`: `effectiveCertainty` + `certaintySource` in **M3** (task panel, grouping). M6 adds the total/committed split plus a parity test against the §6.5 SQL `coalesce`. | M3, M6 |
| X04 | Client undo framework (`UndoProvider`, 8 s toast, Cmd+Z/Shift+Z) in **M1**, because deleting positions (M1) and archiving and member removal (M2) must not use confirm dialogs. Server-side `deleted_batch` restore arrives with tasks in M3 and is reused by M4, M5 and M8. | M1, M3+ |
| X05 | `user_preferences` table + `getPreferences`/`setPreference` (zod-validated known keys, debounced, not audited) in **M1**. Features add keys later. | M1+ |
| X06 | `overload.ts` BR-40 levels and BR-45 tones in **M7** (day-level status). BR-41 causes, excess amounts and the workload pages in M9. | M7, M9 |
| X07 | `?` shortcut-help dialog backed by a data-driven registry in **M3**; later milestones register their shortcuts. | M3+ |
| X08 | Command palette shell (cmdk in an MUI Dialog, global Cmd/Ctrl+K, sidebar search button) + page search in **M4**. "สร้าง milestone" command in M8. Every other category and the quick commands in M10. | M4, M8, M10 |
| X09 | People directory `GET /api/people/options` (id, name, nickname, position, colour, active), readable by **any logged-in user** for pickers and mentions. Workload numbers stay under §3.3. First consumer M2. | M2+ |
| X10 | Tables per milestone. M0: custom migration `0000_extensions` (pg_trgm, btree_gist, pgcrypto). M1: auth tables, positions, work_schedules, user_preferences, audit_log, auth_login_failures. M2: clients, projects, project_members. M3: tasks (no `milestone_id`), task_assignments. M4: pages, page_locks, files. M5: holidays, leave_types, time_off + custom `time_off_no_overlap`. M6: allocations + custom `allocations_week_day_guard` (SPEC trigger). M8: milestones + `tasks.milestone_id`. | all |
| X11 | `seed-golden` grows by milestone and is built from `scripts/lib/fixtures.ts` builders. M1: positions, users (one shared `demo1234` hash, `must_change_password=false`), schedules. M2: clients, projects, LEADs + MEMBER rows derived from assignees (POS: Ivy, Mint; Mobile: Mint; CRM: Ivy; Store: Jack). M3: tasks in JSON order + assignments + overrides. M4: charters via `ensureProjectCharters()`. M5: `--fixture F2\|F3\|F4`, each F1 + its own setup (**not cumulative**). M6: WEEK allocations. M11's `seed:demo` composes the builders. | M1–M6, M11 |
| X12 | AC-203 across milestones. M1: login blocked, sessions revoked, assignable-user query excludes deactivated users. M2: the member picker excludes them. M3: the assignee picker excludes them. M6: grid shows the "ปิดใช้งาน" label (AC closed). | M1–M6 |
| X13 | AC-603 "พร้อมแผนเดิม". M3 restores the task tree + assignments; M6 extends the same test to allocations. | M3, M6 |
| X14 | AC-604: plan via FR-612 in **M6**; verified on `/people/[id]` in **M9**. | M6, M9 |
| X15 | FR-409 load and FR-303 client load → **M9**. M2's overview and client page have no load figures. Project tabs appear with their milestone (M2 ภาพรวม, M3 งาน, M4 เอกสาร, M6 แผนงาน), never as disabled placeholders. | M2–M9 |
| X16 | FR-404. M2's `removeMember` returns `blockedByAssignments: 0` and removes the member with undo. M3 implements the count and the two-option toast ("ยกเลิกการมอบหมายทั้งหมด" / "ยกเลิกการนำออก"), with the combined operation in one transaction and one undo entry. | M2, M3 |
| X17 | FR-406. M2 archives immediately with an undo toast and no confirm (P2). M6 appends "ปลดภาระ X วัน-คน ในอนาคต", where X = Σ allocations with `week_start ≥ weekStart(today)` on live tasks, honouring BR-50. | M2, M6 |
| X18 | FR-405. M2 creates `src/lib/query-keys.ts` + `invalidateLoad(qc)` and the certainty action calls `refresh()`. M6 and M9 register their queries. M6 e2e proves the update happens without a reload. | M2, M6, M9 |
| X19 | BR-50/51/52 and `completed.ts` → **M6**. In M3 the completion toast is "ติ๊กเสร็จแล้ว · เลิกทำ" without numbers, and completion never touches plans. | M3, M6 |
| X20 | FR-610/BR-31. **M3** moves assignments with `UPDATE task_assignments SET task_id = child, version = version + 1`, and allocations follow automatically. Undo reverses it (moves back + soft-deletes the child). | M3 |
| X21 | Milestone features (field, grouping, bulk link) are **absent** from M3: no stubs, no disabled options. All of it lands in M8. | M3, M8 |
| X22 | `/my`. M3: my open assigned leaf tasks in non-archived projects, grouped by project, tickable. M9 switches to the FR-1009 buckets; the sidebar count = my incomplete tasks in "สัปดาห์นี้". | M3, M9 |
| X23 | FR-906. M5 shows capacity before → after per affected week. M9 adds new/worsened overload lines with links (project names masked). | M5, M9 |
| X24 | FR-907. M5 calendar = leave + holidays; M8 adds ◆. | M5, M8 |
| X25 | FR-402. From M4, `createProject` creates the charter in the same transaction, and the idempotent `ensureProjectCharters()` runs from bootstrap/seed for older projects. | M4 |
| X26 | FR-407. M2 permanent delete: one tx (cascade + audit), then unlink files best-effort after commit. M4 adds the file-key collection. | M2, M4 |
| X27 | M6 renders **DAY-resolution weeks** (written by BR-25 at range boundaries) as read-only totals with ⋯ and a tooltip; edits skip them with the toast "สัปดาห์นี้มีแผนรายวัน". M6's domain includes BR-21 spreading and the WEEK→DAY split with clamp-and-spill, because BR-25 needs them. BR-22 editing, BR-23, BR-24, `NEEDS_CHOICE` and the dialog land in **M7**. | M6, M7 |
| X28 | GridResponse keeps the full contract from M6: `milestones: []` and `lateForMilestone: false` until M8. | M6, M8 |
| X29 | The project-grid footer switch "รวมงานโปรเจคอื่นของคนเหล่านี้" lands in **M6**. It returns only per-period `{ total, committed }` of other projects, with no names or ids. Allowed because everyone in the grid is a co-member. | M6 |
| X30 | Visibility helpers in **M2** `authz.ts`: `visibleProjectIds`, `visibleUserIds`, `canSeeUserDetails`, plus `services/masking.ts` and a `masking.int.test.ts` skeleton. Consumers: M5 calendar ("ลา"), M6 leave labels, M9 person grid and workload, M10 search and home. | M2+ |
| X31 | FR-1007 badge in **M9**: server-rendered initial value + a client component querying `['workload','badge']`, invalidated by load-changing actions. | M9 |
| X32 | `/` redirects to **`/home`**. M0 ships a placeholder `/home` (greeting + links to implemented areas); M10 replaces it with the dashboard. After login and after a forced password change, the user lands on `/home` (or on `?next=`). | M0, M1, M10 |
| X33 | Sidebar nav is data-driven and items appear with their milestone (no dead links). M0: collapsible shell (`Cmd+\`). M1: collapsed state persisted in preferences. M2: projects. M4: page trees + remembered expansion. | M0–M4 |

**Rules that apply everywhere**

| ID | Decision |
|---|---|
| X40 | `pnpm check` = typecheck + lint + **all Vitest projects including integration** + domain coverage. It requires `pnpm db:up`, because authz tests are part of every DoD. SPEC says "unit test"; this is a superset. |
| X41 | Response codes: not visible → 404 / `NOT_FOUND`; visible but not allowed → 403 / `FORBIDDEN`; global manager-only **actions** → `FORBIDDEN`; manager-only **pages** (`/settings/*`) → `notFound()`; unauthenticated → 401 (routes), redirect (pages) or `UNAUTHENTICATED` (actions); `mustChangePassword` → 403 `MUST_CHANGE_PASSWORD` or redirect. Do authz at the top of a page/layout, **before any Suspense boundary**, so 404s keep their status. |
| X42 | **Archived projects are read-only**: `view` is allowed; every other need gets `FORBIDDEN` ("โปรเจคถูก archive แล้ว") except unarchive (M, L) and permanent delete (M). Enforced once, in `requireProject`. Archived projects are hidden from the sidebar and pickers. |
| X43 | Visibility (§3.3). `visibleUserIds`: manager → all; a worker who is LEAD of ≥ 1 **non-archived** project → all; otherwise self ∪ users sharing ≥ 1 non-archived project. Deactivated users are included. `visibleProjectIds`: manager → all; worker → their member projects (archived included, read-only). |
| X44 | Audit every mutating action (a superset of FR-1201) **except** `user_preferences` and lease heartbeats, in the same transaction. Summaries come from `th.audit.*` builders and never store secrets (`{ passwordChanged: true }`). From M1, the authz matrix asserts one audit row per mutating `allow` case. |
| X45 | Clock: `src/server/clock.ts` exposes `serverNow()`/`serverToday()`. They honour **`APP_NOW`** (e.g. `2026-09-30T10:00:00+07:00`) only when **`ALLOW_TEST_HOOKS=1`**, which Docker compose never sets; startup logs a warning if it is set. Domain functions take `today` as a parameter. |
| X46 | E2E runs against a **production build** (`next build && next start -p 3100`, base URL `http://localhost:3100`) with `ALLOW_TEST_HOOKS=1`, `APP_NOW` and `planner_e2e`. Before each spec file, reset from the Playwright process: truncate all tables + `seedGolden()` (+ fixture) in one transaction. Log in through the API per role (no stored state). Use page objects in `e2e/pages/*.ts`. Each milestone plan includes an "update older specs" step. |
| X47 | Keep SPEC's code samples' intent but adapt them: `z.uuid()` not `z.string().uuid()`; Thai summaries and labels come from `th.*` (no Thai template literals in `src/server`, no Thai TypeScript literal types); `refresh()` instead of `revalidateTag(tag)`. |
| X48 | Ordering: `orderKey` (`text COLLATE "C"`) for every `position`; keys are generated on the server between real neighbours under `pg_advisory_xact_lock(hash(scope))`; `ORDER BY position, id`. If two neighbours are equal, re-key the siblings with `generateNKeysBetween`. |
| X49 | Keyboard: one helper matches `e.code` first (Thai layout); global shortcuts ignore editable targets and `e.defaultPrevented`. |
| X50 | Dates in forms: MUI X `DatePicker` + `AdapterDayjsBuddhist` + `thTH`, converting ISO string ↔ Dayjs only at the component edge. Ranges use two pickers. |
| X51 | Colour tokens: SPEC's `--load-light-fg` / `--tentative-fg` `#9C6500` on `#FFEB9C` gives 4.12:1, below the 4.5:1 of §8.9. Use `#8F5C00` (4.76:1). "Faded" numbers use `#5B6878`, which passes on white, `--nonworking` and `--holiday`; `#64748B` fails on the grey backgrounds. Never use opacity. Dark-mode counterparts are defined for every token. A unit test checks each pair's contrast. (Deviation.) |
| X52 | The DB runs in UTC: never compute plan dates in SQL. The Postgres services run with `-c timezone=UTC -c log_timezone=Asia/Bangkok`. Don't set `TZ` on them: initdb would write it into `postgresql.conf`. |
| X54 | Tooling must ignore the documents. Prettier (`.prettierignore`), ESLint (global ignores) and `tsconfig` (`exclude`) skip `CLAUDE.md SPEC.md PROGRESS.md PLAN.md tech-stack.md plan/ .claude/ docs/`, so `pnpm format` never rewrites them and `plan/research/snippets/**` is never typechecked. |
| X55 | Test DB names include a per-run id (`planner_tpl_<run>`, `planner_test_<run>_w<ID>`), so concurrent integration runs from parallel streams don't collide. Playwright starts `webServer` before `globalSetup`, so the e2e DB is prepared inside the `webServer.command` (migrate + seed), and `globalSetup` only verifies it. |
| X56 | `import 'server-only'` appears **only** in `src/server/session.ts` and `src/server/clock.ts` (the modules that need Next request context). `db/client.ts`, `env.ts`, `auth.ts`, services and repo stay importable from tsx scripts, `auth check schema` and Playwright `resetDb`. Services never read the clock; callers pass `today` in. tsx compiles scripts as CommonJS: no top-level await and no `import.meta`. |
| X59 | Additional conventions from M1 planning. `publicAction()` is the unauthenticated variant of `action()`, used only by login. **Services write the audit rows** inside the caller's transaction, so bootstrap and seeds audit too (actor `null`). Test factories insert with plain Drizzle, never through the repo, because the repo is written in parallel. **S0 never creates runtime files under `src/domain/**`**: untested stubs break the 95 % coverage gate; domain signatures are documented in the plan file instead. Session mocks are plain functions, not `vi.fn`, because `restoreMocks` resets `vi.fn` implementations. The integration project includes `tests/**`, `scripts/**` and `src/**` `*.int.test.ts`. Each preference key is added by the milestone that first consumes it. |
| X57 | **No `loading.tsx` and no Suspense above a page that may return 404.** AppShell renders children directly, and page authz runs before any Suspense (X41). Page loaders are wrapped in `orNotFound()` (`src/server/page-helpers.ts`). |
| X58 | Shared helpers added during planning: `requireClient` (M2); `requireTasks`/`requireAssignments` for multi-id inputs (M3); `GET /api/clients/options` (M2); the shortcut registry `src/lib/shortcuts.ts`, built on `HOTKEYS` in `src/lib/keys.ts` (M0/M3); `src/lib/temp-id.ts` for optimistic ids (M3). Tree moves send intent (`parentId`, `afterId`), never order keys; the r4 `SortableTree` snippet's client-side key generation must not be copied. |
| X60b | M5 additions: `GET /api/leave-types` + `qk.leaveTypes` + `invalidateLeaveTypes`. The masked leave shape sent to other viewers is `{ userId, start, end, half, label: th.masking.leave }`, with no entry id, type, colour or note (M5-D7). `seedGolden` ensures the 4 default leave types before `applyFixture`. Capacity numbers before M6 display through `cdToNumeric` (2 decimals). |
| X53 | Never use `localStorage` for data. Clipboard and ids work on plain HTTP (`copyText` fallback; ids come from the server). |

**Domain-specific rulings** (the full list with rationale is in the gap reports)

| ID | Area | Decision |
|---|---|---|
| X60 | Auth / employees (M1) | Password policy for every password: 8–128 characters, not equal to the email or its local part (after trim + lowercase), and on self-change not equal to the current password. Random password: 12 characters generated in the browser with `crypto.getRandomValues`, unambiguous alphabet (no 0/O/1/l/I), at least one upper, lower and digit; shown once and never cached. Deactivation keeps memberships, assignments and plans, excludes the user from pickers, shows the "ปิดใช้งาน" label and sets capacity 0 from `deactivated_on` (inclusive). Self-deactivation is blocked. The last active manager is protected by locking the active manager rows `FOR UPDATE`. A role change does not revoke sessions, because the role is read from the DB on every request. Schedules: weekday toggles 1–7, fraction ∈ {0.25, 0.5, 0.75, 1.0}, at least one working day, default Mon–Fri 1.00, no effective dating (it applies to all dates). Positions are optional and ordered with up/down; deleting a used position is blocked (message with the count). Colour: auto-assign the least-used of 12 accessible colours. `/account/password` is the account page (change password + "ออกจากระบบทุกอุปกรณ์"). |
| X61 | Clients / projects (M2) | The project form's client picker lists all non-archived clients to the project's editors (M/L). LEAD is optional at creation, with a non-blocking "ยังไม่มี LEAD" warning. A worker LEAD cannot remove or demote the last LEAD (`CONFLICT`); a manager can, with a warning. Client names are unique including archived ones. Workers see only clients of their projects; any other client page → 404. The sidebar lists visible non-archived projects sorted by `Intl.Collator('th')`. |
| X62 | Tasks (M3) | Enter creates a sibling at the same level; an empty name is a no-op; names are 1–500 characters. The server enforces `newDepth + subtreeHeight ≤ 2`; Tab that exceeds the limit is a silent no-op (AC-602). Cross-project moves are rejected (BR-33). Only a subtree's task rows are soft-deleted, under one batch. Restore checks the 30-day window, authz, that the project is not archived and that the parent is alive. Removing an assignee soft-deletes it under a batch; re-adding creates a new assignment; undoing an old removal that would conflict is skipped with a toast. A Me picker lists members only; L/M list all active users with the hint "จะถูกเพิ่มเป็นสมาชิก" (BR-60, same tx). Parent tasks cannot be assigned. Completing a parent completes only the parent unless "ติ๊กทั้งหมด" is chosen; no cascade. Grouping: a multi-assignee task appears under each assignee; tree operations work only in ungrouped, manual-order view. Task list API: a flat list, and the client builds the tree. |
| X63 | Pages (M4) | FR-510 is called **"protected"** (`pages.locked`, 🔒) and FR-540 the **"edit lease"** (`page_locks`, `services/page-lease.ts`, X80). Protection inherits to sub-pages; workers cannot edit, move or delete in a protected subtree. Root depth is 0 and max 9 (= 10 levels); moves stay within one space/project and are depth-checked. Duplicating deep-copies the tree with remapped `subpage` ids, does not copy files, and the copy is never a charter. The charter cannot be deleted. `+` creates a blank page, and the blank page offers the template chooser. Downloads are authorised by `files.project_id` (null = wiki → any user). Lease: upsert `WHERE user_id = me OR expires_at < now()`; 2-minute expiry; heartbeat every 30 s and whenever the tab becomes visible again; takeover is an unconditional upsert. A save is accepted iff `version = baseVersion` and the user can edit (a lease is not required). The displaced editor flushes, then turns read-only; the taker edits only after a fresh fetch. Leave-page save uses `PUT /api/pages/:id/content` with `keepalive` when ≤ 60 KB (Deviation: a route-handler write); larger unsaved pages show a `beforeunload` prompt. Mentions resolve through `GET /api/pages/titles?ids=`, which returns `{ visible: false }` or `{ deleted: true }` without leaking titles. Page icons come from a curated ~60-emoji grid (no new dependency). |
| X64 | Calendar / leave (M5) | `dayCapacityCd(..., deactivatedOn?)` returns 0 from the deactivation date. `standardDayCd` ignores holidays, leave and deactivation. The exclusion constraint also rejects AM + PM on the same date: pre-check and say "ทับกับ … — ถ้าลาทั้งวันให้แก้รายการเดิมเป็นเต็มวัน", with `23P01` → `OVERLAP` as the backstop. Leave may cover weekends and holidays (no capacity effect). A half day subtracts 50 cd, clamped at 0. Past leave is editable by the person and the manager (audited). CSV import: UTF-8 (BOM allowed) with a windows-874 fallback; optional header; RFC 4180 quotes; ISO dates only; duplicate dates within the file are an error; existing dates are upserted; all-or-nothing with a preview; at most 500 rows. Holidays are hard-deleted with an undo re-insert. A leave type in use is archived instead of deleted. The month view is a custom CSS grid, Monday first. |
| X65 | Grid (M6–M7) | `saveAllocations({ items: [{ taskAssignmentId, baseVersion, changes[] }], onDayWeekConflict?, clientOpId })` runs in **one transaction** across assignments: lock rows with `SELECT … ORDER BY ta.id FOR UPDATE OF ta`, authz per item (any hidden item → 404 for the batch), any version mismatch → `VERSION_CONFLICT` with each item's current state, one audit row per assignment (a superset of §7.4). Period keys are prefixed **`W:YYYY-MM-DD` / `D:YYYY-MM-DD`**. Every aggregate is **`{ total, committed }`**. FRACTION unit: cd ÷ the cell's own period capacity; when capacity is 0, days are shown; 2 decimals. Input parsing: exact decimal, accepts `,5`, `1,5` and Thai digits, rounded once to 25 cd half-up in integer math; > max or < 0 → reject the cell; 0 → delete. `f` = exact capacity (not rounded); `h` = `25·floor((2·cap+50)/100)`. Cells with capacity 0, read-only cells and M6 DAY weeks are skipped; each gesture is one undo entry. Paste anchors at the top-left of the selection; it tiles when the selection is an exact multiple of the block and otherwise pastes once; it skips read-only targets; empty clipboard cells clear their target. The fill handle copies and tiles, never increments. Cmd+←/→ moves the block one column, only across columns of the same kind. Timeline: a fixed column space of today ± 156 weeks (extendable) + 8-week chunk queries; the API default window is 4 weeks back and 12 ahead; `from`/`to` are Mondays, `to` is exclusive, the span is ≤ 53 weeks. The row "รวม" total is computed over the timeline range, which satisfies the `week_start` rule. The certainty view toggle keeps rows editable and excludes them only from sums. Footer: people = assignees on live tasks of this project (deactivated users included); % shows "—" when capacity is 0. Clamp-and-spill applies to every DAY write, so no day exceeds 100 cd: excess goes to working days with room, then to scheduled days lost to leave or holidays, then to weekends, with a warning. Undo: one entry per gesture holding week snapshots. FR-612 `planAssignmentRange(dryRun)`: a week is "whole" when the range covers every scheduled day; in boundary weeks only in-range days are replaced; N = 0 clears. |
| X66 | Milestones (M8) | Deleting a milestone **soft-deletes** it (batch) and reads ignore deleted milestones, so bound tasks count as unbound and undo re-links them exactly. Dragging ◆ moves it ±7 days per week column (keeping the weekday) or ±1 day in day columns; the keyboard alternative is a date popover; only M/L may move it. Clicking a date cell pre-fills that date. BR-71 queries are bounded to `(m.date, m.date + 3 years]`; a WEEK row in the milestone's own week never counts as late. DUE_SOON when 0 ≤ date − today ≤ 7. Progress counts non-deleted bound tasks at any depth. The service checks `task.project_id = milestone.project_id`. |
| X67 | Workload (M9) | Colour follows the selected view's load (total or committed; the "ยังไม่แน่นอน" view uses the tentative palette). The glyph always shows the BR-40 level (OVER 🔴, RISK ⚠) with the number. Bands are integer (`5·load ≥ 4·cap`). Excess: OVER = committed − cap, RISK = total − cap. People shown: active members of ≥ 1 non-archived project + anyone with load > 0 in range (deactivated labelled); managers without memberships are excluded. Filters select people; cells always show full load. Windows include the current week. The person grid adds `{ kind: 'project' }` rows (visible projects only) and one masked row without ids. The unit preference applies to grids only. |
| X68 | Home / search (M10) | Greeting by Bangkok hour (05–11:59 เช้า, 12–17:59 บ่าย, otherwise เย็น). The leave card shows three lines: วันนี้ / สัปดาห์นี้ / สัปดาห์หน้า (masked). There is no quick-add in the home card (FR text wins over the mock). Search: escape `\ % _`, rank titles and names by `word_similarity`, show page title hits first, run content search only for ≥ 3 characters (unordered, LIMIT 8), `SET LOCAL statement_timeout = '500ms'`, show at most 8 per category, and apply per-category visibility in SQL. Quick commands: สร้าง task (current project, else a picker), สร้างหน้า, แจ้งลา, ไปหน้าวันนี้ (= `/home`). |
| X69 | Deploy (M11) | Compose files start with `name: planner`, and every service uses `env_file: ../.env` (no `${}` interpolation). The healthcheck is `pg_isready -h 127.0.0.1 -U planner -d planner`, and migrate retries for about 60 s. The runner stage creates `/data/uploads` owned by the app user. `backup.sh` is a sleep-until-02:00 loop with a `once` mode, tmp-then-move writes and 14-day retention. Restore: `pg_restore --clean --if-exists --no-owner`. The README covers offline install (buildx `linux/amd64`, `docker save`/`load`), Caddy `tls internal` for `.local` names, and upgrades. Full e2e runs against the production build; `e2e/m11-deploy.spec.ts` smoke-tests the compose stack. `seed:demo` A.2 nested task: first add child "ติดตั้งระบบที่สาขา" (takes Mint + the plan), then the unassigned "เตรียมคู่มือสาขา". |

**SPEC v3.1 additions (2026-10-30)** — task statuses per project, blockers, board, `/tasks`, live blocks in pages (§1.7)

| ID | Decision | Milestones |
|---|---|---|
| X70 | The **M3** migration adds `task_status_category`, `task_statuses`, `tasks.status_id` (composite FK `(project_id, status_id)` → `task_statuses (project_id, id)`) and `task_blockers` (composite FKs to `tasks (project_id, id)`). M3 extends M2's `createProject` to insert the five FR-621 defaults in the same transaction; the idempotent `ensureAllProjectStatuses(tx)` (per project: `ensureProjectStatuses(tx, projectId)`) runs from bootstrap/seed for projects created before M3 (same pattern as X25). `seed-golden` tasks get their project's default status. | M3 |
| X71 | One service, `services/taskStatus.ts#setStatus(taskIds, statusId)`, implements BR-80 and is used by the checkbox (BR-82), board drag, multi-select and quick-add in a column. The FR-608 prompt fires whenever the target category is `DONE`. The completion toast stays as X19 (no load numbers until M6). Undo uses `revertTaskStatus({ items: [{ taskId, statusId, completedOn }] })`, which writes those values exactly (M3-D28). A status that live tasks use cannot change category into or out of `DONE` (SPEC FR-623, M3-D27). | M3, M6 |
| X72 | `deleteTaskStatus` soft-deletes the status with a batch and moves its tasks in one transaction, returning `{ batch, moved: [{ taskId, fromStatusId, completedOn }] }`. `restoreTaskStatusBatch({ batch, moveToStatusId, moved })` re-checks authz, restores the status and resets only the tasks whose current status is still the destination, so it never overwrites later edits. BR-84 is checked inside the same transaction. | M3 |
| X73 | `src/domain/blockers.ts#wouldCreateCycle(edges, blockerId, blockedId)` returns the cycle path or `null`; the ancestor/descendant check reuses the task-tree helpers. The service loads the project's active edges. `softDeleteTree` soft-deletes edges touching the subtree in the same batch and restore brings them back. Badge counts `{ open, total }` (BR-86) are computed in SQL. | M3 |
| X74 | The board uses dnd-kit (already pinned) for cross-column drag only. `TaskBoard`/`TaskCard` in `src/components/tasks/` are shared by the project tab, `/tasks`, the M9 person tab and the M10 embed block. Preference key `tasks.view` = `'LIST' \| 'BOARD'`. | M3, M9, M10 |
| X75 | `/tasks` ("งานของทีม") and its data-driven sidebar item (X33) land in **M3**. `GET /api/tasks` filters visibility in SQL via `visibleProjectIds` with cursor pagination (200 per page); no name or id from an invisible project ever appears in the response (masking leak test). | M3 |
| X76 | Grid task rows show the blocker badge (FR-643): `GridRow` of kind `task` gains `blockers: { open: number; total: number }` from **M6**. Completion through any status path still only works via `completed_on` (BR-80 → BR-50), so `completed.ts` is unchanged. | M6 |
| X77 | The person page "งาน" tab renders M3's `TeamTasks` (list = flat rows grouped by project; board = `TaskBoard`) with `fixedUserId` and `syncUrl={false}` (FR-667) in **M9**; `/my` keeps the X22 grouping as its default. | M9 |
| X78 | Live blocks (§4.13) in **M10**: BlockNote custom blocks `taskView` and `projectWorkload` whose `props` hold view config only (no project id). Reads go through `GET /api/pages/:pageId/embed/{tasks,workload}` → `requirePage(view)` → the page's project; a wiki page shows the placeholder. Thai slash items with aliases (`/มุมมองงาน` `/tasks` `/board`, `/ภาระทีม` `/workload`). The `content_text` walker skips both blocks. M10 adds the "งานและภาระของทีม" section to the charter template (Appendix B.1); M4's template omits it. Masking tests cover the embed workload endpoint. | M4, M10 |
| X79 | Permissions: the §3.2 row "จัดการชุดสถานะงานของโปรเจค" was **appended at the end** of the SPEC table, so it is **PERM-23** and PERM-01…22 keep their numbers. PERM-11's text widened (status change, blockers) with the same need. Status-set management is M + L (MEMBER → 403, non-member → 404, archived → 403 per X42). | M3 |

**Rulings from the 2026-10-30 planning round (X80–X96)** — folded from the writer/reviewer reports of M3–M11
(`plan/research/handoff-2026-10-30.md` §7, ids G1–G58). Where a milestone file and this table disagree, this table wins.

| ID | Decision | Milestones |
|---|---|---|
| X80 | **File naming.** Service and repo files are kebab-case (`page-lease.ts`, `task-tree.ts`, `my-tasks.ts`, `time-off.ts`, `day-context.ts`). Documented exception: M3's v3.1 services `taskStatus.ts`, `taskStatuses.ts`, `taskBlockers.ts`, `teamTasks.ts` keep camelCase because M6–M11 cite them. Namespaces (import names) are camelCase. M4-D36 lists M4's other deliberate name differences (`savePageContent`, `qk.search(q, scope)`, `pagesTreeScope`). | all |
| X81 | **Inventory additions to §3.1.** Components: `pages/PageTree.tsx` (sidebar + project tab; replaces `shell/SidebarPageTree`), `palette/groups.tsx` (`PALETTE_GROUPS`), `palette/commands.ts` (`PALETTE_COMMANDS`), `tasks/{board,status,blockers,team}/`, `milestones/`. Routes: `api/people`, `api/people/[userId]/time-off`, `api/projects/[id]/{load,milestones,statuses}`, `api/clients/[id]/load`, `api/milestones/targets`, `api/tasks`, `api/home`, `api/search`, `api/search/index`, `api/pages/[id]/embed/{tasks,workload}`. A new route parameter keeps the name of its sibling folder (`[id]`, M10-D1). M11 files: `playwright.{perf,deploy}.config.ts`, `docker/docker-compose.offline.yml`, `scripts/*.sh`, `scripts/assets/`, `scripts/lib/{demo,demo-content,perf-data,perf-stats,script-user,wait-for-db}.ts`, `tests/{deploy,hardening}/`, `e2e/perf/`; scripts `perf:e2e`, `deploy:smoke`, `offline:check`, `e2e:image` (`perf` uses `--env-file-if-exists`). | M3–M11 |
| X82 | **Query keys and invalidation (§3.5).** Added: `projectStatuses`, `teamTasksAll`, `teamTasks` (M3); `gridAll`/`gridChunk` (M6); `projectMilestones`, `milestoneTargets` (M8); `peopleDirectory`, `projectLoad`, `clientLoad`, `personTimeOff` (M9); `searchIndex`, `pageEmbedTasks(All)`, `pageEmbedWorkload(All)`, `search(q, scope: 'all' \| 'title' = 'all')`, `pagesTreeScope` (M4/M10). Invalidation: `invalidateTasks` → also milestones (M8), home + embed tasks (M10); `invalidateLoad` → also `['sidebar']` (M9) and embed workload (M10); `invalidateMilestones(qc, projectId)` → also `['grid','person']` and home. After a grid save, **`invalidateAfterGridSave(qc, ctx)`** in `src/lib/grid/save-invalidate.ts` is the single extension point (M6; M8 adds milestones, M9 the other grid context + sidebar). | M3–M10 |
| X83 | The JSON fetch helper in `src/lib/api.ts` is **`getJson`** (never `getJSON`). | all |
| X84 | **Project tab order** uses M2-D10's scale: ภาพรวม 0, แผนงาน 1 (M6), งาน 2 (M3), เอกสาร 3 (M4). `PRIMARY_NAV` final order: home, my, tasks, workload, calendar (M9 S0.9). Nav badges: `NavItem.badge?: NavBadge`, `NavBadge = 'myTaskCount' \| 'workloadOver'`; ids `'my'`/`'tasks'` (M3-D40). | M2–M9 |
| X85 | **Grid contracts (§3.10).** Columns: `ColKind 'W'\|'D'` + `role`, `buildColumns(weeks, expanded, dayDatesByWeek)`, `timelineWeeks`, `chunksForRange(visibleWeeks)` (M6-D35; M7 lifts the `expanded` restriction). `HEADER_ROWS = 1` / `FOOTER_ROWS = 3` in `src/lib/grid/columns.ts` (M8 sets `HEADER_ROWS = 2`); `aria-row*` derive from them; page objects never locate by `aria-rowindex`/`nth()`. Row keys `t:<taskId>`, `a:<taskAssignmentId>`, `p:<projectId>`, `m:<userId>`; cells `cell-<rowKey>-<periodKey>`, footer `cell-footer-{load,capacity,util}-<pk>`. `AssigneeCell` gains `days?`, `fallback?`, `warn?`; `GridPeriod` gains `date`, `expanded?`; task rows carry `completedWeek`, `blockers` (X76) and `milestoneId` (M8 via `LIVE_MILESTONE_ON`). `GridContextInfo` covers `'project' \| 'person'` with `canManage` (false in the person context). `SaveAllocationsOk`/`PlanAssignmentRangeOk` gain `lateness` (M8). `VERSION_CONFLICT` payload field is **`current`**; `NEEDS_CHOICE` = `{ week, weeks, pairs }`; `VALIDATION.issues[].reason` ∈ `MAX \| NEGATIVE \| MIXED_WEEK_AND_DAY \| UNREPRESENTABLE` (+ `DAY_WEEK` in M6 only, removed by M7). X65 gains `UNREPRESENTABLE` (FR-612 and BR-25 boundary spill, M6-D6). `GridChunk.zoom 'WEEK'\|'DAY'` ↔ URL `zoom=week\|day` via `src/lib/grid/fetch.ts` (`gridChunkUrl`, `fetchGridChunk`). `planWeek` checks `COLLAPSE` **before** the "x = Σ days" no-op (M7-D2). Day helpers: `repo.allocations.dayLoadsForProjects(tx, { userIds, weeks, excludeProjectId?, projectIds? })`, `spreadDayLoads`, `personDayLoads(rows, periods, { extra? })` (extension point for M9). `CellMenu` (M7) accepts additive `items?` (M8). | M6–M9 |
| X86 | **Errors.** `mapDbError`: 23P01 on `allocations_one_resolution_per_week` → `INTERNAL` (checked before `OVERLAP`). Client code reads extra failure fields via `ActionFailure.extra` (M6-D25). Route handlers parse their params with zod inside the handler; a **malformed id is a 404 `NOT_FOUND`**, like an unknown or invisible one (X41; M2 `projectAccess`, M4 `getLivePageOrNotFound`, M9 `requireVisibleUser` already do this). Query-string validation errors stay 400. `route()` is unchanged. | M1, M6+ |
| X87 | **Data-access names (§3.4.5).** Repo barrels `repo.tasks`, `repo.assignments` (= `./task-assignments`), `repo.statuses`, `repo.blockers`, `repo.milestones`, `repo.allocations`, `repo.people`; services `tasks`, `taskTree`, `taskStatus`, `taskStatuses`, `taskBlockers`, `teamTasks`, `myTasks`, `assignments`, `grid`, `allocations`, `milestones`, `workload`, `home`, `search`, `embed` (M3-D39 + later files). Task list loader `repo.tasks.listLiveWithBlockerCounts(tx, projectId)` → `TaskListRow`; assignees `repo.assignments.listActiveForProject` (gains `version` in M6); `repo.assignments.listActiveForUserLive` (M9); `repo.people.getPerson` (M9). `tasks.milestone_id` is read **only** through `LIVE_MILESTONE_JOIN`/`LIVE_MILESTONE_ON` (M8). Authz additions: `requireStatus` (M3), `requireMilestone` (M8), `requireVisibleUser` (M9). | M3–M10 |
| X88 | **Palette.** Search-result groups live in M4's `PALETTE_GROUPS` (`src/components/palette/groups.tsx`); commands live in M8's `PALETTE_COMMANDS` registry (`src/components/palette/commands.ts`, `CommandsGroup` renders first and renders nothing when no command is visible). `PaletteCommandCtx` is built only in `useCommandCtx()` and is open for additive fields (M10 adds `navigate`, `openLeaveDialog`, `beginCreateTask`, `createPageHere`); tests use `fakeCommandCtx()`. The cmdk group accessible name is unverified — page objects keep a `[cmdk-group]` fallback. | M4, M8, M10 |
| X89 | **Keyboard and blocks.** A page-local `N` handler wins; the global `N` is a deferred fallback (`useFallbackHotkey`, M10-D25). Interactive custom editor blocks isolate their native events from BlockNote (M10-D8). New block types extend M4's `BLOCK_TYPES` + exported `checkBlockProps` (M4-D37). | M4, M10 |
| X90 | **"Today" in services.** Every service that a script can call takes `today: ISODate` as a parameter instead of calling `serverToday()` (which imports `server-only` and throws under tsx; X56): e.g. `setStatus`, `createTask` where it needs a date, `countMyOpenTasks(tx, userId, today)`, `getCalendar(tx, viewer, range, today)`, `buildTable(..., today)`. Seeds may call user-only services as the golden Manager via `scriptSessionUser` (extends X59; M11-D4). | M3–M11 |
| X91 | **Test harness (§4.3–§4.5).** `resetDb(fixture?, opts = {})` is always called as `test.beforeAll(async () => { await resetDb(…) })` (options in the 2nd argument); `WORLD_PART_IMPLIES` (M1, starts empty) gets one entry per owner: `allocations ⇒ tasks + timeOff` (M6), `dayAllocations ⇒ allocations` (M7), `milestones ⇒ tasks + allocations` (M8). `AuthzRow.with?: WorldPart[]`; route rows name their action as `'POST /api/files'` (the M11 audit sweep matches on it; M1's T-META-01 covers actions only). Outcomes include `'413'`/`'415'`. Factories insert with plain Drizzle. `resetDb(fixture?, { extras?, alsoFixtures?, syntheticGrid?, milestones? })` also empties `UPLOAD_DIR` (`.e2e-uploads`); fixtures are not cumulative unless `alsoFixtures` is given (F2+F3 in M9). AC-503 paste is tested both with a real `ClipboardItem` and with `page.evaluate` + `DataTransfer` (M4-D34). The default Playwright config ignores `e2e/perf/**` and `m11-deploy.spec.ts`; the perf DB is `planner_perf` (X55). `tests/integration/**` count tests are edited by the orchestrator (count-only edits, relative counts — M11-D28). S0 may add **type-only** declarations to `src/domain/types.ts` (X59 clarification). Each milestone's S4 appends its rows file to `tests/authz/rows/index.ts`. | all |
| X92 | **Seeds.** See §3.13 (builders, A.2-constant exceptions, no `addLeave`). Synthetic builders `addSyntheticGridProject` (M6) and `addSyntheticWorkload` (M9) take `DbOrTx`, compose after `seedGolden`, use `perf-NN@example.com`, positions from golden data, the project's default status, no audit rows and `client_id = null`. | M6–M11 |
| X93 | **Audit entities** (§3.4.6): `user`, `position`, `client`, `project`, `project_member`, `task`, `task_assignment`, `task_status`, `task_blocker`, `page`, `file`, `holiday`, `leave_type`, `time_off`, `allocation` (`ALLOCATION_AUDIT_ENTITY`), `milestone`. | all |
| X94 | **Deploy facts** (verify in M11, marked `[uncertain]` until then): the db service sets `environment: TZ: UTC` even with `env_file` (X52 over X69; r6b §4.11's `TZ: Asia/Bangkok` fragment is wrong); the builder image sets `pnpm_config_verify_deps_before_run=false` under `NODE_ENV=production`; the `devEngines` Node runtime package must be present in `node_modules` so the image never downloads Node offline (checked with `--network none`). | M11 |
| X95 | **Rule clarifications.** X66 lateness bound = `week_start ≥ date − 6` and `period_start > date` (M8-D6). From M9, `/my` returns `MyTaskBucketsResponse` (FR-1009 buckets) instead of groups-by-project; the home "this week" card reads its `THIS_WEEK` bucket, superseding r7's FR-1101a "plan OR due this week" (M10-D13). | M8–M10 |
| X96 | **Where the audit row is written.** CLAUDE.md's order `zod → authz → service → audit → revalidate` is satisfied whenever the audit row is written in the **same transaction, after the data change, before revalidate/refresh**. Default stays X59 (the service writes it, so bootstrap/seeds audit with actor `null`). Accepted as written: m03 (task create/status), m04 (page create/rename/save, file upload) and m08 (M8-D25 thin actions) write it in the action because the summary needs action-level data. Scripts calling those services write the same audit row themselves via M11's `AUDIT_IN_SERVICE` map (M11-D34) so nothing is audited twice or missed. The M11 audit sweep checks rows, not placement. Services callable from scripts take `today` as a required parameter and do not import `clock.ts` — **m03 declares it in its own signatures** (`createTask`, `setStatus`, `revertStatuses`, `deleteTaskStatus`, `restoreTaskStatusBatch`; M3-D43), so M11-D35 only verifies. In-action audits are listed in M3-D43 (task/assignment/member/status actions; blocker services audit themselves) and M4-D38 (`createPage`, `renamePage`, `savePageContent` + keepalive `PUT`, `POST /api/files`). | M1–M11 |

### 1.5 Local toolchain setup (this machine — done in M0)

```bash
npm install -g pnpm@12.8.1 --allow-scripts=pnpm   # no corepack on Node 26
# package.json gets: "packageManager": "pnpm@12.8.1",
#   "devEngines": { "runtime": { "name": "node", "version": "^22.23.0", "onFail": "download" } },
#   "engines": { "node": ">=22.22.2 <23" }   and .nvmrc = 22
pnpm install                  # downloads Node 22.23.x for all pnpm run/exec
pnpm db:up                    # postgres:17 on localhost:54329
```

From then on: no `npm`/`npx` in the repo, `pnpm exec` for binaries, and `pnpm dlx` for one-off tools.

### 1.6 SPEC amendments made on 2026-09-30

The owner's UI decision (OWN-2) was written into SPEC §7.1 (UI, Editor and Command palette rows),
§7.2 (`components/ui` = MUI wrappers) and §12 M0. Everything else that differs from SPEC samples or
DDL is recorded as a Decision or Deviation (X47, X51, X63 leave-page save, X65 batch save, §1.3 DDL
corrections) and copied into `PROGRESS.md` when its milestone starts.

### 1.7 SPEC v3.1 amendments made on 2026-10-30

The owner asked for multi-step task statuses ("รอข้อมูล", "ติดปัญหา", …) that each project defines, links to the
task that blocks another, a kanban board, a team-wide task view and Notion/AFFiNE-style live views inside project
pages. SPEC was amended to v3.1: P7 and §1.4 gain one exception (per-project status sets), §2 glossary, §3.2 (PERM-11
widened, PERM-23 appended), §4.6.1–4.6.3, §4.12, new §4.13, new §5.10 (BR-80…87), §6.2 DDL, §7.2, new §7.8,
§8.1, new §8.10, §11.1, §12 M3/M10, §13 items 2/6/8, §14 D11–D13 and Appendix B.1. The rulings are X70–X79 (§1.4),
and the owner's reasons are in `PROGRESS.md › Decisions` (2026-10-30). AFFiNE itself was evaluated and **not** adopted:
its backend is under the AFFiNE EE licence, the free self-host tier is limited to 10 members per workspace, and the
standalone `@blocksuite/affine` npm package stopped at 0.22.4 — only the linked-view concept was borrowed. No new
library is needed (BlockNote, dnd-kit, TanStack Query).

---

## 2. Multi-agent operating model

### 2.1 Roles

| Role | Runs as | Owns (during Build) | Typical work |
|---|---|---|---|
| **Orchestrator** | the main Claude Code session | `PROGRESS.md`, git, cross-stream requests, final gates, commit/tag | kickoff, delegating streams, integration decisions, close-out. Delegates feature code; keeps its own context small (reads summaries, not whole diffs). |
| `domain-engineer` | subagent | `src/domain/**`, pure helpers in `src/lib/**` named by the brief | SPEC §5 rules test-first (Vitest + fast-check), ≥ 95 % coverage. |
| `backend-engineer` | subagent | `src/server/**`, `src/app/api/**`, `drizzle/**`, `scripts/**` (as briefed) | schema + migrations (contracts stream only), repo, services, actions, route handlers, authz, audit, seeds. |
| `frontend-engineer` | subagent | `src/app/**` (non-API), `src/components/**` (except grid/editor), `src/hooks/**`, its i18n namespace | MUI screens, TanStack Query wiring, optimistic updates, undo toasts, a11y. |
| `grid-engineer` | subagent | `src/components/grid/**`, `src/lib/grid/**` | PlanGrid (M6–M9). |
| `editor-engineer` | subagent | `src/components/editor/**`, `src/lib/editor/**` | BlockNote integration (M4). |
| `test-engineer` | subagent | `tests/**`, `e2e/**` | authz matrix, masking leak tests, integration, golden, Playwright. |
| `platform-engineer` | subagent | root configs, `docker/**`, `README.md`, perf scripts | M0 scaffold/tooling, M11 deploy/hardening. |
| `spec-reviewer` | subagent (read-only) | nothing | lens reviews and adversarial refutation of findings. |

Role definitions (system prompts, hard rules, verification commands) live in `.claude/agents/`.

### 2.2 The milestone loop

Every milestone runs the same eight steps. `plan/mNN-*.md` supplies the content; this section
supplies the procedure.

| # | Step | Who | Output | Gate to pass |
|---|---|---|---|---|
| 1 | **Kickoff** | orchestrator | preflight OK; checklist + decisions copied into `PROGRESS.md`; row set 🟨 | previous milestone ✅, tree clean, DB up |
| 2 | **Contracts (S0)** | one agent, alone | dependencies installed in one batch; schema + migrations; shared types/zod schemas; action/route signatures with stub bodies; authz signatures; i18n namespaces; query keys; test helpers named in the plan | **G0:** `pnpm check` green |
| 3 | **Build (S1…Sk)** | parallel subagents per the streams DAG | each stream implements its section test-first, within its owned paths | **G1:** scoped tests/lint/typecheck of owned paths green |
| 4 | **Requests & wiring** | orchestrator (or integrator agent) | cross-stream requests applied (deps, i18n keys, small API tweaks) | — |
| 5 | **Integration** | integrator agent (or orchestrator) | everything wired; failures fixed at root cause | **G2:** `pnpm check` + **full** e2e suite green |
| 6 | **Review panel** | 5 × `spec-reviewer` (lenses) + 1–2 skeptics per finding | confirmed findings only | — |
| 7 | **Fix rounds** (≤ 3) | owners of the affected paths, in parallel | fixes + regression tests | **G3:** G2 again, then a review round with 0 confirmed findings |
| 8 | **Close-out** | orchestrator | DoD ticked; PROGRESS updated (✅, Decisions, Deviations, Known issues); `feat(mN): …` commit; tag `mN` | **G4:** final `pnpm check` + full e2e green |

Rules of the loop:
- **Never start Build before G0.** Streams code against S0's contracts; a stream that finds a contract
  wrong implements the closest correct thing and reports a `decision` + `request`.
- **Never review a red tree.** Review starts only after G2.
- **Never commit a red tree.** If gates cannot be made green, set the row to ⛔ in PROGRESS.md with the
  reason and stop for the owner (see §2.9).
- A milestone is "done" only when every AC it owns (see its file §7.1) is covered by a passing test.

### 2.3 File ownership and shared files

Parallel agents share one working tree. Conflicts are prevented by construction:

1. **Exclusive ownership.** Each stream lists `owns` globs in its milestone file. During Build a stream
   creates/modifies only those paths. Everything else is read-only for it.
2. **Single owner for shared files in a milestone** — normally S0:
   - `package.json`, `pnpm-lock.yaml` (dependencies are installed once, by S0, in one `pnpm add` batch)
   - `src/server/db/schema.ts`, `drizzle/**` (only S0 generates migrations)
   - `src/lib/query-keys.ts`, `src/lib/contracts/**` (shared DTO types)
   - `src/server/authz.ts` **signatures** (S0) — the backend stream then owns the bodies
3. **`src/i18n/th.ts`** is the one file many streams touch. S0 creates every namespace the milestone
   needs (with the keys the plan lists). Afterwards a stream may add keys **only inside its own
   namespace**, using the Edit tool (never Write — Edit refuses stale writes, Write would clobber).
4. **Requests instead of edits.** Anything outside ownership goes into the stream report's
   `requests` (`path · change`). The orchestrator applies requests after Build (step 4).
5. **No state-changing git, no installs, no repo-wide formatters** inside streams. Only the
   orchestrator or integrator commits, installs (after S0) or formats the whole repo.
6. **No `next build`, no `next dev`, no e2e inside streams.** Next allows only one of each per checkout.
   Streams verify with Vitest, ESLint and typecheck; the integrator owns build, dev server and Playwright (G2).
   Never use `npm`/`npx` in the repo (use `pnpm exec`/`pnpm dlx`, §1.3).
7. **Scoped verification.** `pnpm typecheck` is global. While other streams are mid-flight, a stream
   acts only on errors inside its own paths. G2 is where the whole tree must be clean.
8. **Migrations are generated only by S0** (the Drizzle migrator silently skips out-of-order journal
   entries). At G2 the integrator re-runs `pnpm db:generate` and expects "No schema changes".
9. **Worktrees** (`isolation: "worktree"`) are for throwaway spikes only (e.g. "does BlockNote paste an
   Excel table as a table block?"). Feature streams do not use worktrees: merging shared files costs
   more than ownership discipline, and parallel migration journals corrupt ordering.

### 2.4 Brief template (manual runs with the Agent tool)

When not using the saved workflow, the orchestrator launches each stream with the Agent tool
(`subagent_type` = the stream's agent; all independent streams of a DAG level **in one message** so
they run concurrently) using this brief:

```text
You are stream <ID> — "<title>" — of milestone M<N> of Team Working OS. Repo root = cwd.
Read, in order: PLAN.md §2 and the §3/§4 subsections for your role; plan/mNN-<slug>.md end-to-end,
then execute section "<5.ID>" step by step (test-first where it says so); the SPEC sections it cites.
OWNERSHIP — you may create/modify ONLY: <globs>. Everything else is read-only; other streams are
running in parallel. Need anything outside ownership (dependency, schema, i18n key outside your
namespace, another module's API, PROGRESS.md)? Do not do it — list it under "requests".
No git state changes, no installs, no repo-wide formatters.
Upstream results: <one paragraph per upstream stream: status, summary, key files>
Finish with the verification commands from your agent file and the plan section.
Final message = report: status · files · tests · commands+results · decisions · requests · open issues.
```

### 2.5 Gates in detail

| Gate | Command(s) | Must be true |
|---|---|---|
| G0 | `pnpm check` | typecheck, lint, unit + integration tests green with S0 stubs in place |
| G1 | `pnpm vitest run <owned tests>` · `pnpm eslint <owned paths>` · `pnpm tsc --noEmit` (owned paths clean) | stream-local |
| G2 | `pnpm db:up && pnpm db:migrate && pnpm check` then `pnpm test:e2e` | everything green, including **all previous milestones' e2e** |
| G3 | G2 + a review round with zero confirmed findings | — |
| G4 | G2 once more, DoD checklist, PROGRESS updated, commit + tag | — |

`pnpm check` = `tsc --noEmit` + `eslint .` + `vitest run` (unit **and** integration projects; needs the
dev Postgres from `pnpm db:up`). Coverage gate: `src/domain/**` ≥ 95 % (enforced in vitest config).

### 2.6 Review panel and adversarial verification

After G2, five read-only reviewers inspect `git diff m<N-1>` (plus untracked files), each through
one lens (`scope`, `authz`, `rules`, `tests`, `ux` — definitions in `.claude/agents/spec-reviewer.md`).
Each finding must cite `file:line`, quote the code, and name the rule (SPEC id, CLAUDE.md rule or plan
step). Every finding is then handed to independent skeptics (2 for blocker/major, 1 for minor) whose
job is to **refute** it with evidence (e.g. the wrapper already calls authz; a recorded Decision covers
it). A finding survives unless all skeptics refute it. Survivors are grouped by owning path and fixed
in parallel; then G2 re-runs and a new review round starts (max 3 rounds; a finding that survives two
fix attempts goes to `Known issues` for the owner).

### 2.7 Two ways to run a milestone

**A. Saved workflow (preferred when multi-agent orchestration is authorised).** The Workflow tool
needs explicit opt-in: the user says e.g. *"run the implement-milestone workflow for M3"* (or has
ultracode on). Then:

```text
Workflow({ name: "implement-milestone", args: { milestone: 3 } })
```

It performs steps 1–8 above using the agent roles in `.claude/agents/`. If it stops (it returns
`stoppedAt`), read its report, fix the cause, and either resume
(`Workflow({ scriptPath, resumeFromRunId })` — completed agents are cached) or continue manually.

**B. Manual orchestration with the Agent tool** (always available). The orchestrator performs the
same eight steps itself: S0 via one Agent call; then each DAG level of streams via one message with
several Agent calls (background) using the §2.4 brief; waits for completion notifications; applies
requests; runs gates (or delegates to an integrator agent); launches the five reviewers in one
message; verifies each finding with skeptic agents; delegates fixes; closes out.

Either way the orchestrator must personally confirm G4 before committing — never trust a subagent's
"green" claim without seeing the command output.

### 2.8 Sessions, context and resuming

- Prefer **one fresh Claude Code session per milestone**. Everything needed to resume lives in
  `PROGRESS.md` (checklist), git history and the plan files.
- Mid-milestone resume: read `PROGRESS.md › แผนของ milestone ปัจจุบัน`; run `git status` and
  `pnpm check` to see the true state; continue with the first unchecked item.
- Orchestrator context hygiene: delegate file reading and debugging to subagents; ask them for
  summaries; reference paths instead of pasting file contents into prompts; never paste whole SPEC
  sections into briefs (agents read them).

### 2.9 Stop conditions (ask the owner)

Keep going without asking (CLAUDE.md: "ไม่ต้องหยุดรอ") for ordinary ambiguity — choose the simplest
option consistent with SPEC §1.3, record it in `Decisions`, continue. **Stop and ask** only when:
1. A requirement cannot be met technically and every alternative changes user-visible behaviour
   materially (record a Deviation proposal and ask).
2. A security/privacy trade-off would weaken SPEC §3 or §9.
3. Gates stay red after the fix rounds.
4. An action would destroy data or history (dropping tables, rewriting git history, deleting docs).
5. Scope questions that SPEC §13 marks "รอเจ้าของผลิตภัณฑ์ยืนยัน" (e.g. cost/rate card).

### 2.10 Git conventions

- `git init` happens in M0. Work on `main`; one commit per milestone: `feat(m<N>): <summary>`
  (English) + body listing delivered FR/AC ids + the attribution trailer the session requires; then
  `git tag m<N>` (review scope for the next milestone = `git diff m<N>`).
- Intermediate WIP commits inside a milestone are allowed (`wip(m<N>): …`) when a session must end
  mid-milestone; squash is not required.
- Never commit `.env`, `node_modules`, `.next`, `uploads/`, `backups/`, test artifacts
  (`playwright-report/`, `test-results/`, `coverage/`). The `.xlsx` files in `docs/reference/` are committed.
- Never force-push, rewrite history, or delete tags.

---

## 3. Architecture and conventions

These are **cross-milestone contracts**. Milestone files use these names. If a milestone needs
something not defined here, its S0 defines it and the milestone file records a Decision.
Library-specific facts (versions, option names, pitfalls) are in §1.2–§1.3 and `plan/research/`.
Check them before writing library code from memory.

### 3.1 Repository layout (target state after M11)

```
/
├─ CLAUDE.md SPEC.md PROGRESS.md PLAN.md tech-stack.md(resolved note) README.md(M11)
├─ plan/                 mNN-*.md · traceability.md · research/ (reports + verified snippets)
├─ docs/                 read-only context (never edit)
├─ .claude/              agents/*.md · workflows/implement-milestone.js
├─ package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc tsconfig.json next.config.ts
├─ eslint.config.mjs prettier.config.mjs .prettierignore vitest.config.ts playwright.config.ts drizzle.config.ts
├─ .env.example .env(gitignored) .gitignore .dockerignore
├─ docker/               Dockerfile docker-compose.yml docker-compose.dev.yml Caddyfile backup.sh
├─ drizzle/              generated migrations + custom SQL migrations (all listed in meta/_journal.json)
├─ scripts/              migrate.ts bootstrap.ts seed-golden.ts seed-demo.ts seed-perf.ts import-holidays.ts
│                        db-reset.ts perf-check.ts · lib/fixtures.ts (composable seed builders)
├─ tests/
│  ├─ setup/             db-global.ts (template DB) · db-worker.ts (per-worker DB + mocks) · ui.ts (jsdom)
│  ├─ stubs/             empty.ts ('server-only' alias)
│  ├─ helpers/           db.ts (truncate) · world.ts · as-user.ts · factories.ts · outcome.ts
│  ├─ authz/             matrix.int.test.ts · rows/<area>.ts · masking.int.test.ts
│  └─ golden/            golden.int.test.ts
├─ e2e/                  global-setup.ts · fixtures.ts (resetDb, loginAs, clock) · pages/*.ts (page objects)
│                        · m<N>-<slug>.spec.ts
├─ public/               favicon, static images (no remote assets)
└─ src/
   ├─ proxy.ts           page gate: session validation + cookie renewal, login/must-change redirects,
   │                     CSP nonce + security headers (matcher excludes /api, /_next, static)
   ├─ app/
   │  ├─ layout.tsx      <html lang="th" class={scheme}>, fonts, viewport export, <AppProviders nonce>
   │  ├─ page.tsx        redirect → /home
   │  ├─ fonts/          woff2 (IBM Plex Sans Thai: latin + thai × 400/500/600/700) + OFL + fonts.ts
   │  ├─ tokens.css      SPEC §8.7 tokens (+ dark) as CSS variables
   │  ├─ (auth)/login, (auth)/account/password
   │  ├─ (app)/layout.tsx  requirePageUser() → AppShell (sidebar + palette)
   │  ├─ (app)/home, my, tasks, workload, calendar
   │  ├─ (app)/people, people/[id] · (app)/clients, clients/[id]
   │  ├─ (app)/projects, projects/[id]/{overview,plan,tasks,pages}  (layout holds tab config)
   │  ├─ (app)/p/[pageId]
   │  ├─ (app)/settings/{employees,positions,holidays,leave-types}
   │  └─ api/            auth/[...all] · health · sidebar · people/options · files · files/[id] ·
   │                     projects/[id]/tasks · projects/[id]/statuses · tasks · tasks/my ·
   │                     pages/[id]/embed/{tasks,workload} · pages/tree · pages/titles · pages/[id] ·
   │                     pages/[id]/lock · pages/[id]/content (keepalive save) · calendar ·
   │                     grid/project/[projectId] · grid/person/[userId] · workload · workload/cell ·
   │                     workload/badge · search · home
   ├─ domain/            ★ pure: types.ts dates.ts units.ts capacity.ts allocation.ts certainty.ts
   │                     completed.ts overload.ts milestone.ts status.ts blockers.ts (+ *.test.ts)
   ├─ server/
   │  ├─ env.ts          zod-validated env (lazy; build must work without DATABASE_URL)
   │  ├─ db/             schema.ts (incl. orderKey customType) · client.ts (lazy db, Tx, DbOrTx)
   │  ├─ auth.ts         Better Auth instance · session.ts  getSessionUser(), requirePageUser()
   │  ├─ authz.ts        ★ every permission decision (§3.4.4)
   │  ├─ errors.ts  action.ts  route.ts  audit.ts  clock.ts  storage.ts
   │  ├─ repo/           one file per entity; functions take `tx: DbOrTx` first
   │  ├─ services/       business logic (domain + repo); run inside the caller's transaction
   │  └─ actions/        'use server' files, one per area; thin (§3.4.2)
   ├─ components/
   │  ├─ Link.tsx        client re-export of next/link (MUI `component=` prop)
   │  ├─ providers/      AppProviders (MUI cache+theme, QueryClient, ToasterHost, UndoProvider, Hotkeys)
   │  ├─ shell/          AppShell, Sidebar, SidebarProjects, UserMenu, ShortcutHelp (page trees: pages/PageTree.tsx, X81)
   │  ├─ common/         UserName, UserAvatar, PersonPicker, ProjectChip, CertaintyBadge, StatusGlyph,
   │  │                  EmptyState, InlineEditText, DateField, DeleteProjectDialog (only confirm dialog)
   │  ├─ undo/           UndoProvider, useUndo, toastUndo
   │  ├─ tree/           SortableTree (dnd-kit) used by task outliner + page tree
   │  ├─ palette/        CommandPalette + command registry
   │  ├─ grid/           PlanGrid + hooks + CSS Modules
   │  ├─ editor/         EditorClient (dynamic, ssr:false), PageEditor, schema, blocks, slash, paste, lease
   │  └─ tasks/ (TaskList, TaskBoard, TaskCard, StatusChip, BlockerBadge) pages/ projects/ people/
   │     calendar/ workload/ home/ settings/ account/
   ├─ hooks/             useHotkeys, usePreferences, useToday, useDebouncedCallback
   ├─ lib/               z.ts (zod + Thai locale) · format.ts · keys.ts (e.code helper) · copy-text.ts ·
   │                     query-keys.ts · invalidate.ts · api.ts (fetch JSON helper) · action-result.ts ·
   │                     query-client.ts · contracts/ (DTOs) · schemas/ (zod shared by forms+actions) ·
   │                     grid/ (pure grid model) · editor/ (paste, tsv, suggest ranking, content-text,
   │                     sanitize) · tree/ (projection) · csv/ (holidays parser) · theme/ (tokens, theme)
   └─ i18n/              th.ts ★ (all UI text) · templates.th.ts (Appendix B page templates)
```

Import rules. ESLint enforces the first rule; the other two are enforced by convention and `server-only`.
- `src/domain/**` imports nothing outside `src/domain/**`. It has no IO and no `Date` except `dates.ts#todayBangkok`.
- Client components never import `src/server/**`. Only `session.ts` and `clock.ts` start with
  `import 'server-only'` (X56); other server modules must stay importable from tsx scripts and Playwright.
- `src/lib/**` is isomorphic (safe for client and server) except files named `*.server.ts`.

### 3.2 Scripts (package.json)

| Script | Command |
|---|---|
| `dev` / `build` / `start` | `next dev` / `next build` / `next start` (`output: 'standalone'`; the warning printed by `next start` is harmless) |
| `typecheck` | `next typegen && tsc --noEmit` |
| `lint` | `eslint . --max-warnings 0` |
| `format` | `prettier --write .` |
| `test` | `vitest run --coverage` (projects `unit`, `ui`, `integration`; domain threshold 95 %) |
| `test:unit` / `test:ui` / `test:int` | `vitest run --project unit` / `--project ui` / `--project integration` |
| `test:e2e` | `playwright test` |
| `check` | `pnpm typecheck && pnpm lint && pnpm test` (needs `pnpm db:up`) |
| `db:up` / `db:down` | `docker compose -f docker/docker-compose.dev.yml up -d --wait` / `down` |
| `db:generate` | `drizzle-kit generate` (custom SQL: `pnpm exec drizzle-kit generate --custom --name=<n>`) |
| `db:migrate` | `tsx --env-file-if-exists=.env scripts/migrate.ts` (the programmatic migrator also used by Docker `migrate`) |
| `db:studio` | `drizzle-kit studio` |
| `db:reset` | `tsx --env-file-if-exists=.env scripts/db-reset.ts` (truncate; dev/test only) |
| `bootstrap` | `tsx --env-file-if-exists=.env scripts/bootstrap.ts` (idempotent, SPEC §10.4) |
| `seed:golden` / `seed:demo` / `seed:perf` | `tsx --env-file-if-exists=.env scripts/seed-*.ts` (refuse when `NODE_ENV=production`) |
| `import:holidays` | `tsx --env-file-if-exists=.env scripts/import-holidays.ts <file.csv>` |
| `perf` | `tsx scripts/perf-check.ts` (M11) |

Each script is added by the milestone that first needs it; no placeholders are created early. Run
everything through pnpm; `npm` and `npx` fail inside the repo (§1.3).

### 3.3 Configuration conventions

- **TypeScript 6** (`tsconfig.json`): `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `types: ["node"]`, `moduleResolution: "bundler"`, `paths: { "@/*": ["./src/*"] }` (no `baseUrl`),
  `plugins: [{ name: "next" }]`. Working reference: `plan/research/snippets/r1/tsconfig.json`.
- **Prettier** (`prettier.config.mjs`): `{ semi: false, singleQuote: true, trailingComma: 'all', printWidth: 110, objectWrap: 'preserve' }`.
  `.prettierignore` lists `node_modules .next coverage playwright-report test-results drizzle pnpm-lock.yaml docs plan/research`.
- **ESLint** (`eslint.config.mjs`): copy the validated `plan/research/snippets/r4/lint/eslint.config.mjs` (it runs on
  ESLint 9.39 and 10.11). It layers `eslint-config-next` (core-web-vitals + typescript), typescript-eslint
  `recommendedTypeChecked` (`projectService: true`), `no-explicit-any: error`, `ban-ts-comment` (descriptions required),
  `@typescript-eslint/no-deprecated: error`, eslint-comments `require-description` + `no-unused-disable`,
  `reportUnusedDisableDirectives: error`, `react-hooks/incompatible-library: off` (TanStack Virtual),
  `settings.react.version` pinned, and three project rules:
  1. **No Thai characters** (`[฀-๿]`) in `Literal`, `TemplateElement` or `JSXText` outside
     `src/i18n/**`, `scripts/**`, `tests/**`, `e2e/**`, `**/*.test.*`, `**/*.spec.*`.
  2. **`src/domain/**` import bans**: `react*`, `next*`, `drizzle-orm*`, `postgres`, `@/server|app|components|hooks|lib/*`,
     and Node IO modules.
  3. **No `Date`** in `src/domain/**` (`new Date`, `Date()`, `Date.now/parse/UTC`) except `dates.ts`.
  Then `eslint-config-prettier/flat` last. Global ignores: `.next out build next-env.d.ts drizzle coverage
  playwright-report test-results uploads backups .e2e-uploads plan/research`.
- **Next config** (`next.config.ts`): `output: 'standalone'`, `poweredByHeader: false`, `reactStrictMode: true`,
  **`agentRules: false`**, `outputFileTracingRoot: __dirname` (or `turbopack.root`),
  `experimental.serverActions.bodySizeLimit: '4mb'`, no remote image patterns, no `cacheComponents`.
- **Drizzle config**: `schema: './src/server/db/schema.ts'`, `out: './drizzle'`, `dialect: 'postgresql'`,
  `strict: true`, `verbose: true`, `dbCredentials.url` from env (drizzle-kit auto-loads `.env`).
- **Dev DB** (`docker/docker-compose.dev.yml`): `name: planner-dev`, `postgres:17` (Debian), host port **54329**,
  `planner/planner/planner`, healthcheck `pg_isready -h 127.0.0.1 -U planner -d planner`. `.env`:
  `DATABASE_URL=postgres://planner:planner@localhost:54329/planner`.
- **pnpm** (`pnpm-workspace.yaml`): `allowBuilds: { esbuild: true, sharp: false, unrs-resolver: false }`,
  plus any `minimumReleaseAgeExclude` entries pnpm adds.

### 3.4 Server layering

#### 3.4.1 Errors (`src/server/errors.ts`)

| Class | HTTP | Action `code` | Use |
|---|---|---|---|
| `UnauthenticatedError` | 401 | `UNAUTHENTICATED` | no or invalid session |
| `MustChangePasswordError` | 403 | `MUST_CHANGE_PASSWORD` | FR-104 gate for actions and routes |
| `NotFoundError` | 404 | `NOT_FOUND` | missing **or not visible** (never reveal existence) |
| `ForbiddenError` | 403 | `FORBIDDEN` | visible but not allowed for this role; archived-project writes |
| `ValidationError` | 400 | `VALIDATION` | zod or business validation (`fieldErrors` from `z.flattenError`) |
| `ConflictError` | 409 | `CONFLICT` / `VERSION_CONFLICT` / `OVERLAP` / `LAST_MANAGER` / … | concurrency, overlaps, uniqueness, guards |
| `NeedsChoiceError` | 409 | `NEEDS_CHOICE` | BR-24 (M7), extends `AppError`, carries `{ week, weeks, pairs }` (X85) |
| `RateLimitedError` | 429 | `LOGIN_LOCKED` | FR-106 |

`message` is always Thai, from `th.errors[code]` or a specific `th.<ns>.*` builder. Postgres errors
(`e.cause.code`: 23P01 → `OVERLAP` **except** on `allocations_one_resolution_per_week` → `INTERNAL`, 23505 → `CONFLICT`,
P0001 `WEEK_DAY_CONFLICT` → internal error) are mapped in one place (X86). Unknown errors are logged server-side, without query params, and returned as `INTERNAL`.

#### 3.4.2 Server actions (`src/server/action.ts`)

```ts
export type ActionError = { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } & Record<string, unknown>
export type ActionResult<T extends object> = ({ ok: true } & T) | ActionError
export interface ActionCtx { user: SessionUser }

export function action<S extends z.ZodType, T extends object>(
  schema: S,
  handler: (input: z.infer<S>, ctx: ActionCtx) => Promise<T>,
  opts?: { allowWhenMustChangePassword?: boolean },
): (input: z.input<S>) => Promise<ActionResult<T>>
// 1) user = await getSessionUser() → UnauthenticatedError   2) mustChangePassword → MustChangePasswordError
//    (unless opts.allowWhenMustChangePassword: changeOwnPassword, signOutEverywhere, logout)
// 3) schema.safeParse → ValidationError   4) handler   5) AppError/DB error → ActionError (extra fields kept:
//    VERSION_CONFLICT carries `current`, NEEDS_CHOICE carries `{ week, weeks, pairs }`, VALIDATION may carry `issues`;
//    the client reads them through `ActionFailure.extra` — X86)
```

Canonical body (SPEC §7.3 adapted per X47):

```ts
'use server'
export const deleteTask = action(z.object({ taskId: z.uuid() }), async ({ taskId }, { user }) => {
  return db.transaction(async (tx) => {
    const task = await repo.tasks.getOrNotFound(tx, taskId)
    await authz.requireProject(tx, user, task.projectId, 'edit')          // 404 if invisible, 403 if archived
    const batch = await services.tasks.softDeleteTree(tx, user, taskId)   // BR-32
    await audit.log(tx, user, { entity: 'task', entityId: taskId, action: 'delete',
      projectId: task.projectId, summary: th.audit.taskDeleted(task.name) })
    return { batch, projectId: task.projectId }
  })
  // TanStack views are invalidated by the caller. Call refresh() (next/cache) here ONLY when
  // the mutation changes RSC-rendered UI (sidebar project names, settings tables, headers).
})
```

Rules: authz runs before touching any data, except the lookup that finds the owning resource. Audit
happens inside the transaction. Return only what the client needs, never whole rows with hidden
fields. Keep actions fast, because the client dispatches them one at a time.

#### 3.4.3 Route handlers (`src/server/route.ts`)

```ts
export function route<P extends Record<string, string>>(
  handler: (req: Request, ctx: { user: SessionUser; params: P; url: URL }) => Promise<Response | object>,
  opts?: { query?: z.ZodType; public?: boolean; allowWhenMustChangePassword?: boolean },
): (req: Request, ctx: { params: Promise<P> }) => Promise<Response>
// Same session and must-change checks. Parses opts.query from the search params (400 on failure).
// Objects are returned as JSON with `Cache-Control: private, no-store`. AppError → { code, message } + status.
```

Only GET route handlers read data. Writes go through server actions, except for the routes SPEC or §1.4
mandate: `POST /api/files` (multipart), `POST|DELETE /api/pages/[id]/lock` (lease),
`PUT /api/pages/[id]/content` (keepalive save on leave, X63) and Better Auth's `/api/auth/*`.
`GET /api/health` is public (a DB ping for healthchecks).

#### 3.4.4 Authorization API (`src/server/authz.ts`)

```ts
type Need = 'view' | 'edit' | 'manage' | 'owner'
// view:   M, L, Me   open project, read tasks/plan/pages/milestones             (archived: allowed)
// edit:   M, L, Me   tasks, allocations, project pages, assign EXISTING members   (archived: FORBIDDEN)
// manage: M, L       project info, members, archive/unarchive, milestones, assign NON-members (auto-invite)
// owner:  M          permanent delete
narrowRole(role: string | null | undefined): 'manager' | 'worker'
requireUser(user: SessionUser | null): asserts user is SessionUser
isManager(user): boolean
requireManager(user): void                                               // ForbiddenError
projectAccess(tx, user, projectId): Promise<{ role: 'MANAGER' | 'LEAD' | 'MEMBER'; archived: boolean } | null>
requireProject(tx, user, projectId, need: Need): Promise<{ role; archived }>   // null → 404; insufficient → 403
requireTask(tx, user, taskId, need): Promise<{ task; role }>             // via its project
requirePage(tx, user, pageId, need: 'view' | 'edit' | 'protect'): Promise<{ page; role? }>   // wiki protection inherits
requireFile(tx, user, fileId): Promise<{ file }>                         // by files.project_id; 404 otherwise
requireTimeOffEdit(tx, user, timeOffIdOrTargetUserId): Promise<void>     // self or manager; target not visible → 404, visible → 403 (M5-D3)
visibleProjectIds(tx, user): Promise<'ALL' | Set<string>>                // details (§3.3, X43)
visibleUserIds(tx, user): Promise<'ALL' | Set<string>>                   // totals (§3.3, X43)
canSeeUserDetails(tx, viewer, userId): Promise<boolean>                  // /people/[id] (M9)
isLeadAnywhere(tx, user): Promise<boolean>                               // non-archived projects only
```

Each function is introduced by the milestone that first needs it: S0 adds the signature and the backend
stream writes the body. Masking lives only in `src/server/services/masking.ts`: M2 creates the skeleton,
M5 adds leave labels, M9 completes it. It is the only place that turns hidden projects into masked
aggregates (no ids, no counts, label from `th.masking.otherProjects`) and leave entries into
`th.masking.leave` for viewers who are neither the manager nor the owner.

#### 3.4.5 Data access and transactions

- `src/server/db/client.ts`: a lazy `db` (Drizzle over postgres.js, `max: 10`, created on first use),
  `export type Tx`, and `export type DbOrTx = Db | Tx`.
- `repo/<entity>.ts`: small typed queries `(tx: DbOrTx, …)`. They convert `numeric` ↔ cd and return
  ISODate strings. `getOrNotFound` variants throw `NotFoundError`.
- `services/<area>.ts`: business operations `(tx, user, input)`. They call `src/domain/*` and never open
  their own transaction; the action or route does, so services compose inside one transaction.
- Multi-table writes run in exactly one `db.transaction`. Consistent multi-query reads (grid, workload)
  may use a `REPEATABLE READ` read-only transaction.
- **Every query on `allocations` has a `week_start` range.** Even "all-time" figures use the timeline
  bound (today ± 3 years, X65/X66).
- Every allocation writer first bumps or locks the `task_assignments` row (§1.3 BR-20b race).
- Positions use `orderKey` and `ORDER BY position, id`. Keys are generated under an advisory lock (X48).

#### 3.4.6 Audit (`src/server/audit.ts`)

`audit.log(tx, actor | null, { entity, entityId, action: 'create'|'update'|'delete'|'restore', projectId?, summary, before?, after? })`.
Write one row per user operation; a grid batch writes one row per assignment. Page saves are logged
without content. Summaries come from `th.audit.*` builders. There is no audit UI in the MVP (SPEC §13).
Scripts pass `actor = null`.

#### 3.4.7 Clock (`src/server/clock.ts`)

`serverNow(): Date` and `serverToday(): ISODate` (= `todayBangkok(serverNow())`). They honour **`APP_NOW`**
only when **`ALLOW_TEST_HOOKS=1`** (X45). Business logic only (completion dates, milestone status,
default windows, greetings); never used for sessions or auth. Domain functions receive `today` as a
parameter.

### 3.5 Data flow on the client

- **Server Components** render page shells and simple data (settings tables, project header, overview
  info) by calling services directly, with authz at the top of the page before any Suspense boundary.
- **Route handlers + TanStack Query** serve interactive or live data: sidebar, task lists, grids,
  workload, badge, calendar, lease state, search, people options, mention titles and home cards.
  `getQueryClient()` (`snippets/r4/client/lib/query-client.ts`): `staleTime: 60_000`,
  `refetchOnWindowFocus: true`, retry 1. Logout calls `queryClient.clear()`.
- **Writes** are server actions called from client components, usually via `useMutation` with optimistic
  updates, rollback and a Thai toast. `unwrap()` in `src/lib/action-result.ts` turns `{ ok: false }` into a
  thrown `ActionError` so that `onError` fires.
- Query keys live only in `src/lib/query-keys.ts`:

```ts
export type GridCtx = { kind: 'project'; id: string } | { kind: 'person'; id: string }
export type GridChunk = { from: ISODate; expand: ISODate[]; zoom: 'WEEK' | 'DAY'; includeOthers: boolean }
export const qk = {
  sidebar: () => ['sidebar'] as const,
  peopleOptions: () => ['people', 'options'] as const,
  pagesTree: (space: 'WORKSPACE' | 'PROJECT', projectId: string | null, parentId: string | null) =>
    ['pages', 'tree', space, projectId, parentId] as const,
  page: (pageId: string) => ['pages', 'one', pageId] as const,
  pageLease: (pageId: string) => ['pages', 'lease', pageId] as const,
  pageTitles: (ids: readonly string[]) => ['pages', 'titles', [...ids].sort()] as const,
  projectTasks: (projectId: string) => ['tasks', 'project', projectId] as const,
  myTasks: () => ['tasks', 'my'] as const,
  projectStatuses: (projectId: string) => ['projects', projectId, 'statuses'] as const, // M3 (v3.1)
  teamTasksAll: () => ['tasks', 'team'] as const,                                  // M3 (v3.1) prefix
  teamTasks: (filters: z.output<typeof teamTasksQuerySchema>) => ['tasks', 'team', filters] as const, // M3 (v3.1)
  gridAll: (ctx: GridCtx) => ['grid', ctx.kind, ctx.id] as const,          // prefix for setQueriesData
  gridChunk: (ctx: GridCtx, c: GridChunk) => ['grid', ctx.kind, ctx.id, c] as const,
  workload: (p: WorkloadParams) => ['workload', 'table', p] as const,
  workloadCell: (userId: string, week: ISODate) => ['workload', 'cell', userId, week] as const,
  workloadBadge: () => ['workload', 'badge'] as const,
  calendar: (from: ISODate, to: ISODate) => ['calendar', from, to] as const,
  search: (q: string, scope: 'all' | 'title' = 'all') => ['search', q, scope] as const, // X82, M4-D36
  home: () => ['home'] as const,
}
```

- `src/lib/invalidate.ts` groups invalidations so features don't forget views: `invalidateLoad(qc)` →
  `grid`, `workload`, `home`, `tasks.my`; `invalidateTasks(qc, projectId)`; `invalidatePages(qc, …)`;
  `invalidateCalendar(qc)`. Each milestone that adds a query registers it here.

### 3.6 Units, dates and "today"

- `src/domain/types.ts`: `ISODate` (`'YYYY-MM-DD'`), `Cd` (integer), `Weekday` (1–7, 1 = Monday),
  `Schedule = Partial<Record<Weekday, Cd>>` (missing = not working), `Certainty`, `Granularity`,
  `TimeOffSpan { startDate; endDate; fractionCd }` (100 full day, 50 half), `PeriodKey` (`W:${ISODate}` | `D:${ISODate}`).
- `dates.ts` (M1, X01): SPEC §5.1 API plus `isISODate`, `compareISO`, `diffDays`, `addWeeks`, `eachDay(from, toInclusive)`,
  `minISO`/`maxISO`. It uses **integer epoch-day arithmetic** (days-from-civil). Only
  `todayBangkok(now = new Date())` touches `Date` (`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })`).
  Verified sample: `plan/research/snippets/r4/vitest/src/domain/dates.ts`.
- `units.ts` (X02: M1 part + M6 part):
  - `numericToCd('1.25') → 125` and `cdToNumeric(125) → '1.25'` by string parsing, with no float.
  - `formatCd(cd, { unit, baseCd?, decimals })` rounds half-up in integer math (never `toFixed`): 0 → `''`,
    125 → `'1.3'` (1 decimal), 2 decimals in tooltips and in FRACTION mode.
  - `parseCellInput(raw, { unit, capCd, max })` parses an exact decimal `n/10^k`, accepting `,5`, `1,5`, Thai digits,
    and a trailing `%` in fraction mode. It rounds **once** to 25 cd, half-up, in integers:
    DAYS `k = floor((200n + 25·10^k) / (50·10^k))`, FRACTION `k = floor((2·n·cap + 25·10^k) / (50·10^k))`, `cd = 25k`.
    A result of 0 → `{ kind: 'clear' }`; above `max` or negative → `{ kind: 'invalid' }`; `f`/`h` → capacity helpers (X65).
- SQL aggregates return integer cd: `(coalesce(sum(person_days), 0) * 100)::int`.
- `distribute(total, weights)` uses exact integer quotient and remainder (`q = (n - n % d) / d`) and orders by
  remainder descending, then index ascending. The SPEC sample's float tie-break is wrong in about 0.2 % of cases
  (counterexample: `distribute(50, [10, 40, 100])` must give `[4, 13, 33]`).
- Display formatting lives only in `src/lib/format.ts`:
  - `formatThaiDate(d, 'medium')` → "30 ก.ย. 2569". It builds a UTC Date from the ISO parts and formats with
    `timeZone: 'UTC'`; this is the only other place a `Date` may be built from an ISODate.
  - `formatWeekday(d)`, `formatWeekHeader(ws)` → "30/9", `formatRelative(ts)` ("2 ชม.ที่แล้ว").
- Client "today": `useToday()`. `(app)/layout` passes `serverToday()` down through a `TodayProvider`, so SSR and
  the client agree. Playwright pins the browser clock.

### 3.7 i18n

- `src/i18n/th.ts` exports `th`, a nested `as const` object, and `type Th`. Namespaces are created by the milestone that
  needs them: `common`, `nav`, `errors`, `audit`, `auth`, `account`, `employees`, `positions`, `users`, `prefs`,
  `undo`, `shortcuts`, `clients`, `projects`, `members`, `sidebar`, `masking`, `tasks`, `my`, `pages`, `editor`
  (incl. `editor.blocknote` = the BlockNote `Dictionary`), `files`, `palette`, `calendar`, `timeOff`, `holidays`,
  `leaveTypes`, `capacity`, `grid`, `plan`, `units`, `milestones`, `workload`, `people`, `overload`, `home`, `search`.
- Parameterised strings are functions, e.g. `deletedWithChildren: (name: string, n: number) => ...`.
- Zod: `src/lib/z.ts` calls `z.config(z.locales.th())` as a fallback. User-facing forms pass explicit messages from `th`.
- Page templates (Appendix B) live in `src/i18n/templates.th.ts` as BlockNote `PartialBlock[]` builders. A
  jsdom test loads each one in a headless editor.
- Tests (unit, integration and e2e) import `th` rather than copying Thai literals.
- Display name (FR-210): `displayName(u) = u.nickname || u.name`. `<UserName>` shows the full name and position on hover
  and "(ปิดใช้งาน)" for deactivated users. Initials come from the first grapheme via `Intl.Segmenter('th')`.

### 3.8 Undo, toasts, keyboard

- `src/components/undo/` (M1, X04): `UndoProvider` keeps a per-tab stack of at most 50
  `{ label: string; undo(): Promise<void>; redo(): Promise<void> }` entries. `useUndo()` exposes
  `push(entry, { toast?: string })`, `undo()`, `redo()`, `canUndo` and `canRedo`. A toast shows sonner
  `toast(message, { action: { label: th.undo.undo, onClick: undo }, duration: 8000 })`.
- Global `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` run through `useHotkeys` only when focus is not in an editable element
  (inputs, textareas, `[contenteditable]`, `.bn-editor`) and `!e.defaultPrevented`. The grid, when not editing, uses the same stack.
- Deletions return `deleted_batch`. The undo entry calls `restore*({ batch })`, which re-checks authz, the
  30-day window, a live parent and conflicts (23505 or 23P01 → a Thai toast).
- `useHotkeys(map)` matches **`e.code`** first (`src/lib/keys.ts`; Thai keyboard layout, X49) and implements
  SPEC §8.6 (`Cmd+K`, `Cmd+\`, `Esc`, `N`, `?`). Shortcuts register in the `?` help registry (X07).
- `ToasterHost` (`snippets/r4/client/components/ToasterHost.tsx`): one sonner `Toaster`, bottom-center,
  themed from the MUI palette and typography, `closeButton`.

### 3.9 UI system (MUI)

- Owner decision OWN-2. `src/lib/theme/theme.ts` (`'use client'`) builds the theme with
  `cssVariables: { colorSchemeSelector: 'class' }`, `colorSchemes: { light, dark }`, the MUI and pickers `thTH`
  locales, `primary` = `#2F5597`, navy `#1F3864` for accents, typography `fontFamily: 'var(--font-plex-latin), var(--font-plex-thai), system-ui, sans-serif'`,
  and `size="small"` defaults for dense UI. `AppProviders` wraps
  `AppRouterCacheProvider options={{ nonce, enableCssLayer: true }}` → `ThemeProvider theme storageManager={null}` →
  `CssBaseline` → `QueryClientProvider` → `LocalizationProvider (AdapterDayjsBuddhist, 'th')` → `UndoProvider` → `ToasterHost`.
  Verified pieces: `plan/research/snippets/r1/src/{theme.ts,app/providers.tsx,app/layout.tsx}`.
- `src/app/tokens.css` defines SPEC §8.7 tokens under `:root` and `.dark`, with the contrast fixes from X51. The
  `user_preferences.data.theme` value (`light | dark | system`) becomes the `<html>` class on the server. `system`
  resolves on the client once, with no localStorage.
- Dense surfaces (grid, workload and calendar cells, sidebar rows) are plain elements with **CSS Modules** reading
  token and MUI CSS variables, and `data-*` attributes for state. Never use one MUI component, `sx` or `styled` per cell.
- MUI 9 API only: `slots`/`slotProps`, `sx` instead of system props, Grid `size`. `next/link` goes through `@/components/Link`.
- Shared components are built by the milestone that first needs them, then reused: `UserName`, `UserAvatar` (M1);
  `PersonPicker` (M2 members, M3 assignees with the "จะถูกเพิ่มเป็นสมาชิก" hint); `ProjectChip`, `CertaintyBadge` ◐
  (M2); `InlineEditText` (M2); `DateField` (M3; ISO in/out, Buddhist-era display); `EmptyState` (M0);
  `DeleteProjectDialog` (M2, the only confirm dialog); `StatusGlyph` (OVER 🔴 / RISK ⚠ / leave / holiday / ◐; M6+);
  `SortableTree` (M3, reused in M4); `CommandPalette` (M4).
- Layout: a persistent left sidebar (SPEC §8.1, collapsible with `Cmd+\`, temporary Drawer under 900 px), a top bar
  per page, a max content width on non-grid pages. Full UI at ≥ 1280 px; tablet usable; on mobile only home,
  my tasks, leave and reading pages (SPEC §9).
- Accessibility (§8.9): never colour alone; visible focus; dialogs trap focus; `Esc` closes; contrast ≥ 4.5:1 in
  both schemes (unit-tested token pairs).
- `usePreferences()` (M1, X05) keys: `theme`, `sidebar.collapsed`, `sidebar.expanded[]`, `tasks.groupBy`,
  `tasks.sort`, `tasks.showCompleted`, `grid.unit ('DAYS'|'FRACTION')`, `grid.zoom ('WEEK'|'DAY')`,
  `load.view ('ALL'|'COMMITTED'|'AT_RISK')`. Saved through a debounced server action; never `localStorage`.

### 3.10 Planning grid architecture (M6–M9)

- **Contracts** (`src/lib/contracts/grid.ts`) follow SPEC §7.4 with the X65 adjustments:
  - `periods[]` are keyed `W:`/`D:`.
  - Task rows, masked rows and the footer carry `Record<PeriodKey, { total, committed }>`.
  - Assignee rows carry `cells: Record<PeriodKey, { cd; resolution; derived }>`, plus `rowTotal { total, committed }` over the timeline bound.
  - `people[u]` has `capacity`, `standard`, `timeOff` (masked label), `deactivatedOn` and, when `includeOthers`, `otherProjects`.
  - `milestones` is `[]` until M8; `lateForMilestone` is `false` until M8; masked and project row kinds arrive in M9.
- **Server**: `services/grid.ts` builds one chunk `[from, to)` (+ `expand`, `zoom`) in a read-only transaction.
  It loads the task tree, assignments, allocations in range, capacity and standard via `services/capacity.ts` (M5),
  masked time off, holidays and (from M8) milestones.
- **Save**: `services/allocations.ts#save({ items[], onDayWeekConflict?, clientOpId })`:
  1. `SELECT … FOR UPDATE OF ta` ordered by id.
  2. Authz per item; any hidden item → 404 for the whole batch.
  3. Version check; any mismatch → `VERSION_CONFLICT` with the current states.
  4. Per-week application via `src/domain/allocation.ts`, DELETE before INSERT, with clamp-and-spill for DAY rows.
  5. Bump versions and write one audit row per assignment.
  6. Return authoritative `weeks` per item.
  It never calls `refresh()`.
- **Client model** (`src/lib/grid/`, pure and unit-tested):
  - row model: tree flattening, single-assignee merge per §8.3, certainty view
  - column model: a fixed timeline of today ± 156 weeks, extendable; week 64 px, day 44 px, offsets
  - selection math, TSV parse/serialize, paste tiling, fill-handle tiling, shift ±1 column
  - change-set building, week snapshots for undo, footer aggregation
- **Client state**:
  - Chunk queries via `useQueries`, 8 weeks each, for the visible range plus one chunk of overscan, with `keepPreviousData`.
  - An optimistic overlay patches every chunk through `setQueriesData(qk.gridAll(ctx))`.
  - Saves go through `useMutation` with `scope: { id: 'grid-save:' + ctx.id }`: debounced 400 ms, flushed on grid blur, `pagehide` and route change.
  - `baseVersion` is read at send time.
  - Rollback only when this is the only pending mutation, otherwise invalidate; `VERSION_CONFLICT` → patch, drop that assignment's queued edits and undo entries, and show a toast.
  - A `data-save-state` attribute is exposed for e2e (`snippets/r4/client/components/grid/useSaveAllocations.ts`).
- **Rendering** (`snippets/r4/client/components/grid/VirtualGrid.tsx`, verified in Chromium):
  - One scroll container with a row virtualizer (32 px) and a column virtualizer (`horizontal`, `useFlushSync: false`, `getItemKey` = period key).
  - Sticky name column, sticky header rows (milestone row from M8, period header) and a sticky footer.
  - Rows are absolutely positioned via `top`. Cells are memoised `div`s with one CSS Module class and `data-*` state.
  - `role="grid"`, `aria-rowindex`/`aria-colindex` and roving focus.
  - "วันนี้" = `scrollToIndex(todayIdx, { align: 'start' })` with `scrollPaddingStart` = name-column width.
- **Interaction layer**: `useGridKeyboard` (e.code aware), `useGridSelection`, `useGridEditing`, `useGridClipboard`
  (DOM copy/paste events, no async clipboard API) and `useFillHandle` implement every row of SPEC §4.8
  "การกรอก" and "การลบ" per X65. Each gesture is one undo entry of week snapshots.
- **Contexts**: `PlanGrid` takes `context: GridCtx`. The person context (M9) groups by project and adds masked read-only rows.

### 3.11 Editor architecture (M4)

- Split: the Server page `/p/[pageId]` (authz + load) renders `EditorClient` (`'use client'`,
  `next/dynamic(() => import('./PageEditor'), { ssr: false })` with an MUI Skeleton), which renders `PageEditor`.
  Verified layout: `snippets/r3/next-app-pnpm/app/p/[id]/`.
- Schema (`snippets/r3/harness/src/schema.ts`):
  - default blocks, with the image spec's accept list limited to png/jpg/gif/webp
  - a custom attachment block with type `file` and props `{ url, name, size }`, showing size (FR-527)
  - `subpage` block (`{ pageId }`, live title/icon via TanStack Query, "หน้านี้ถูกลบแล้ว" / no-access states)
  - `mention` inline content (`{ kind: 'user' | 'page', id }`, live names)
- Slash menu: Thai titles and English aliases from `th.editor.blocknote.slash_menu`, ranked by `rankSuggestionItems`
  (`snippets/r3/harness/src/lib/suggest.ts`). Custom items: `/ตาราง` (3×3), `/หน้า` (create child page, then insert a
  `subpage` block; hidden at depth 9) and `/รูป`. Word-start guards apply to `/`, `:` and `@`.
- Paste (`snippets/r3/harness/src/lib/{paste,tsv}.ts`):
  - HTML `<table>` → table, even when files are present
  - otherwise a multi-line TSV with ≥ 2×2 cells → an HTML table → `pasteHTML`
  - otherwise files → upload
  - otherwise default with `prioritizeMarkdownOverHTML: false`
  - external `<img>` → link
- Uploads: `uploadFile` → `POST /api/files` → `{ type: 'image' | 'file', props }`. It never rejects: on failure it returns `{}`,
  removes the placeholder and shows a Thai toast. An upload store drives the attachment spinner. The file panel is upload-only.
- Autosave: debounced 800 ms. It dirty-checks against a baseline serialized from the editor and flushes on blur,
  `visibilitychange`, route change and unmount. Saves send `version`. `VERSION_CONFLICT` shows the
  "มีการแก้ไขใหม่กว่า" banner with a reload button and never overwrites. On `pagehide`, a save of ≤ 60 KB goes via keepalive `PUT`;
  larger unsaved pages trigger a `beforeunload` prompt.
- Edit lease (FR-540–542; X63): `useEditLease(pageId)` runs `POST /api/pages/:id/lock` on open, every 30 s and when the tab
  becomes visible again; `DELETE` with keepalive on leave; `?takeover=1` to take over. The page is read-only while
  someone else holds the lease. A displaced editor flushes, then turns read-only.
- Server: `services/pages.ts#save` validates the JSON with zod: known block types, props, url and href rules, a 2 MB cap
  and a depth cap. It sanitises file and image urls (`^/api/files/<uuid>$`, else a link), bumps `version`, recomputes
  `content_text` with `src/lib/editor/content-text.ts` (a pure walker, NFC, capped at 200 k characters) and writes an audit row
  without content.
- Theme: `editor-theme.css` bridges `--bn-colors-*` to `--mui-palette-*`, overrides the content font with the
  Thai stack and sets `--bn-ui-base-z-index: 1150`. `theme` is passed as a string from the resolved preference.
  An error boundary wraps the editor.

### 3.12 Security, env and files

- `src/proxy.ts` (verified base: `snippets/r1/src/proxy.ts`) handles every page request:
  - session validation and cookie renewal (§1.3)
  - a per-request nonce and the CSP from §1.3
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
    `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and HSTS only when `SECURE_COOKIES=true`
  The matcher excludes `/api`, `/_next/static`, `/_next/image`, fonts and favicon. API responses get
  `nosniff` + `Cache-Control: private, no-store` from `route()`.
- `src/server/env.ts` validates SPEC §10.3 plus `TRUSTED_ORIGINS`, `TRUSTED_PROXIES`, `ALLOW_TEST_HOOKS` and `APP_NOW`.
  Validation is lazy (on first use), so `next build` works without secrets.
- Files (SPEC §7.6, X63): `storage.ts` exposes `put(key, bytes)` (write to temp, then rename), `stream(key)` and
  `remove(key)`, with keys `yyyy/mm/<uuid>.<ext>` under `UPLOAD_DIR`. Upload:
  1. check page edit permission, including wiki protection
  2. check size by kind (≤ 10 MB images, ≤ 25 MB attachments; reject if received bytes ≠ Content-Length)
  3. classify with `snippets/r4/server/classify-upload.ts` (magic bytes + narrow extension fallbacks; SVG is only ever an attachment)
  4. insert the `files` row with the page's `project_id`
  Download: re-check access by `files.project_id` (404 otherwise), then set `nosniff`, RFC 5987 `filename*`,
  `Content-Disposition: attachment` for attachments (+ `Content-Security-Policy: default-src 'none'; sandbox`) or
  `inline` for images, and `Cache-Control: private, max-age=3600`.
- Cookies: Better Auth `httpOnly` + `sameSite=lax`, `secure` = `SECURE_COOKIES`. Switching `SECURE_COOKIES` logs everyone out.

### 3.13 Seeds and scripts

- `scripts/lib/fixtures.ts` holds composable builders that work through the real services where it matters
  (charters, BR-60 membership, audit with a `null` actor): `seedGolden(db, { upTo? })`, `applyFixture(db, 'F2'|'F3'|'F4')`,
  `addDayExample(db)` (M7: Kickoff workshop DAY rows), `addMilestones(db)` (M8), `addDemoTasks`, `addDemoStatuses`,
  `addDemoPages(db)` (fills the existing POS charter in place), `addPerfBulk`, `addBigPage` (M11; `addPerfBulk` runs
  `ensureProjectCharters`, so `seed:perf` gains one actor-null `page` audit row per new project — expected, not a
  breach of X92, which covers only the synthetic builders themselves); demo leave is
  `applyFixture('F3')` (there is no `addLeave`). Builders read `docs/reference/golden-fixtures.json`; the exceptions
  `addDayExample` and `addMilestones` use SPEC Appendix A.2 constants because the JSON has no such data (X92).
- `scripts/seed-golden.ts` runs truncate + `seedGolden` (+ `--fixture`) and refuses to run when `NODE_ENV=production`.
  It grows by milestone (X11). Users share one precomputed `demo1234` hash.
- `scripts/bootstrap.ts` is idempotent: M1 adds the initial manager from `INITIAL_MANAGER_*`, only when there are zero
  users (never touches passwords, never prints them), plus the 6 positions when empty; M4 adds `ensureProjectCharters()`;
  M5 adds the 4 leave types when empty. It warns when `ALLOW_TEST_HOOKS`/`APP_NOW` are set with `NODE_ENV=production`.
- `scripts/db-reset.ts` truncates all app tables (keeping `drizzle.__drizzle_migrations`); e2e and developers use it.
- `scripts/seed-demo.ts` (M11) composes the builders (Appendix A.2 with the nested-task fix, X69). `scripts/seed-perf.ts` (M11)
  generates synthetic data at the §9 scale with `generate_series`/COPY.
- `scripts/import-holidays.ts` and the settings UI share one parser, `src/lib/csv/holidays.ts` (X64).

---

## 4. Testing strategy

### 4.1 Layers and file conventions

| Layer | Tool | Location | Vitest project |
|---|---|---|---|
| Pure unit + property | Vitest + fast-check | `src/domain/<module>.test.ts`, `src/lib/**/<x>.test.ts` | `unit` (node) |
| Component | Vitest + Testing Library + jest-dom | `src/components/**/<X>.test.tsx`, `src/hooks/**/<x>.test.ts(x)` | `ui` (jsdom) |
| DB integration | Vitest + real Postgres | `src/server/**/<name>.int.test.ts`, `scripts/**/<x>.int.test.ts` | `integration` |
| Authorization matrix | Vitest + real Postgres | `tests/authz/matrix.int.test.ts` + `tests/authz/rows/<area>.ts` | `integration` |
| Masking leak tests | Vitest + real Postgres | `tests/authz/masking.int.test.ts` | `integration` |
| Golden fixtures | Vitest + real Postgres | `tests/golden/golden.int.test.ts` | `integration` |
| End-to-end | Playwright (Chromium) | `e2e/m<N>-<slug>.spec.ts` + `e2e/pages/*.ts` | — (`pnpm test:e2e`) |

Test-first always applies to `src/domain/**` (CLAUDE.md), to `src/lib/grid/**`, `src/lib/editor/**` and
`src/lib/tree/**` pure helpers, and to authz rows (written from SPEC §3.2 before the actions exist).

### 4.2 Vitest projects and the database harness

- `vitest.config.ts` (base: `snippets/r4/vitest/vitest.config.ts`):
  - root options: `resolve.tsconfigPaths: true`, `server-only` aliased to `tests/stubs/empty.ts`,
    `test.restoreMocks: true`, `test.unstubEnvs: true`, and coverage `{ provider: 'v8', include: ['src/domain/**/*.ts'],
    exclude: ['**/*.test.ts'], thresholds: { 'src/domain/**': { lines: 95, functions: 95, branches: 95, statements: 95 } } }`
  - projects: `unit` (node), `ui` (jsdom, `setupFiles: tests/setup/ui.ts` with `afterEach(cleanup)` + jest-dom),
    and `integration` (node, `globalSetup: tests/setup/db-global.ts`, `setupFiles: tests/setup/db-worker.ts`,
    `hookTimeout: 60_000`, `maxWorkers: 4`)
- `db-global.ts` connects to the dev Postgres (`pnpm db:up`). It drops and creates `planner_tpl`, runs every migration
  with the same migrator as `pnpm db:migrate`, closes all template connections and provides the admin URL.
- `db-worker.ts` (top-level await, before any app import) runs
  `DROP DATABASE IF EXISTS planner_test_w${VITEST_POOL_ID} WITH (FORCE)`, then `CREATE DATABASE … TEMPLATE planner_tpl`,
  and sets `process.env.DATABASE_URL`. It also mocks:
  - `next/cache` (`refresh`, `updateTag`, `revalidatePath`, `revalidateTag`)
  - `next/headers` (async `cookies()`/`headers()`)
  - `@/server/session` (`getSessionUser`, which returns the user set by `asUser`)
  `beforeEach` truncates all app tables. Integration tests set `ALLOW_TEST_HOOKS=1` + `APP_NOW` when "today" matters.
- Unit tests pin time with `vi.useFakeTimers(); vi.setSystemTime(...)`; debounce tests use
  `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.
- Virtualized components in jsdom need `offsetWidth`/`offsetHeight` getter stubs. Grid interaction tests belong in Playwright.

### 4.3 World fixture, factories and `asUser`

- `tests/helpers/factories.ts`: `makeUser({ role, nickname, positionName?, schedule? })`, `makeProject({ lead, members, client?,
  certainty?, archived? })`, `makeTask`, `makeAssignment`, `makeAllocation`, `makePage`, `makeTimeOff`, `makeMilestone`,
  `makeFile`. Each is added by the milestone that introduces the entity, inserts with plain Drizzle (X59, X91) and returns the row. IDs are
  real v4 UUIDs.
- `tests/helpers/world.ts`: `createWorld({ with?: WorldPart[] })` with `WorldPart = 'tasks'|'pages'|'files'|'timeOff'|'allocations'|'dayAllocations'|'milestones'`
  (`'dayAllocations'` ⇒ `'allocations'`; `'milestones'` ⇒ `'tasks'` + `'allocations'`; X91) builds the
  standard permission world:
  - users `manager` (role manager), `lead` (worker, LEAD of **P**), `member` (worker, MEMBER of **P**), `outsider`
    (worker, MEMBER of **Q** only)
  - projects **P** (client **C1**) and **Q** (client **C2**), plus **A** (archived, P's team)
  - milestone extensions add a task tree, pages (P, wiki, protected wiki), files, time off and so on
- `tests/helpers/as-user.ts`: `asUser(user)` and `asNobody()`. `tests/helpers/outcome.ts`: `outcomeOf(result | Response)` →
  `'allow' | '404' | '403' | '400' | '401' | '409' | '413' | '415' | '429'` (X91).

### 4.4 Authorization matrix and masking

```ts
// tests/authz/rows/<area>.ts
export const rows: AuthzRow[] = [
  { id: 'PERM-11', spec: '§3.2 สร้าง/แก้/ลบ/ติ๊กเสร็จ task', action: 'createTask', mutates: true,
    expect: { M: 'allow', L: 'allow', Me: 'allow', W: '404' },
    run: (w) => createTask({ projectId: w.P.id, name: 'x' }) },
]
```

`matrix.int.test.ts` loops over rows × roles (`M` manager, `L` lead, `Me` member, `W` outsider). For each pair it builds a
fresh world, calls `asUser(role)`, runs the action and compares `outcomeOf(...)` with `expect[role]`. For `mutates` rows
with `allow`, it asserts exactly one new `audit_log` row with the right `entity`/`project_id` (X44).

Choosing expectations (X41):
- not visible → `404`; visible but not permitted → `403`
- manager-only global actions → `403`
- archived-project writes → `403`

Every §3.2 line has at least one row; PERM ids are in `plan/traceability.md` (PERM-23 = status-set management, X79).

`masking.int.test.ts` is created in M2 and grows in M3, M5, M6, M9 and M10. For every read endpoint that can include other people's
data (sidebar, people options, tasks, calendar, grid, person grid, workload, badge, search, home, page embeds), it requests the endpoint as
a worker who must not see project **Q**. It asserts that `JSON.stringify(body)` contains none of Q's name, Q's task
names, Q's project/task/assignment **ids**, leave-type names or leave notes, and that masked totals are still present
where SPEC requires them. Concrete golden examples are in `r8-golden.md`, e.g. Cindy → `/people/Peter` shows only the
masked row.

### 4.5 Playwright end-to-end

- `playwright.config.ts` (base: `snippets/r4/playwright/playwright.config.ts`): `testDir: 'e2e'`, `workers: 1`,
  `fullyParallel: false`, Chromium only, `use: { baseURL: 'http://localhost:3100', locale: 'th-TH', timezoneId: 'Asia/Bangkok',
  permissions: ['clipboard-read', 'clipboard-write'], trace: 'retain-on-failure' }`,
  `globalSetup: 'e2e/global-setup.ts'` (creates and migrates `planner_e2e`), and
  `webServer: { command: 'pnpm build && pnpm start -p 3100', url: 'http://localhost:3100/api/health', timeout: 300_000,
  reuseExistingServer: true, env: { DATABASE_URL: <planner_e2e>, ALLOW_TEST_HOOKS: '1', APP_NOW: '2026-09-30T10:00:00+07:00',
  BETTER_AUTH_URL: 'http://localhost:3100', BETTER_AUTH_SECRET: <test secret ≥ 32 chars>, SECURE_COOKIES: 'false',
  UPLOAD_DIR: '.e2e-uploads', NEXT_TELEMETRY_DISABLED: '1' } }`.
- `e2e/fixtures.ts` extends `test` with:
  - `resetDb(fixture?)`: truncate all tables + `seedGolden()` (+ `applyFixture`) + spec extras, in one transaction from the
    Playwright process. Call it in `test.beforeAll` of every spec file.
  - `loginAs(page, 'manager' | 'cindy' | 'ivy' | 'peter' | 'jack' | 'mint')`: POST to Better Auth's email sign-in through
    `page.request`, so the cookies land in the context. It does not trip the lockout, and the rate limit is off under `ALLOW_TEST_HOOKS`.
  - Clock: `await page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`. Use `install()` +
    `runFor()` only when asserting timers (the 8 s toast, debounces).
  - A `securitypolicyviolation` listener that fails the test (CSP guard).
- Page objects live in `e2e/pages/*.ts` (login, sidebar, project tabs, task list, grid, editor, calendar, workload), so
  older specs survive UI changes. Each milestone plan has an "update older specs" step.
- Selectors: `getByRole`, `getByLabel` or `getByText` with strings imported from `src/i18n/th.ts`. Grid cells use
  `data-testid="cell-<rowKey>-<periodKey>"`. There are no fixed sleeps; wait on UI state (e.g. "บันทึกแล้ว", `data-save-state="idle"`).
- Paste tests use real `ClipboardItem` + `ControlOrMeta+V` for images (AC-503) and synthetic `DataTransfer` + `ClipboardEvent`
  for exact Excel HTML/TSV payloads (AC-502, AC-803).
- Every milestone's spec stays in the suite; G2 runs the full suite.

### 4.6 Golden fixtures (SPEC §11.3)

`tests/golden/golden.int.test.ts` seeds the golden data (+ F2, F3 or F4 on its own) and asserts over `[2026-08-31, 2027-01-04)`, an
**exclusive** end that includes the week of 2026-12-28:
- F1 totals: 19 500 / 11 625 cd
- per-project totals
- every `expected.F1.byUserWeek` cell (57; absent = 0/0/500)
- no overloads in F1; the F2–F4 overload lists match `expected`, including `excessCd` (OVER = committed − cap, RISK = total − cap) and causes

M6 asserts F1 through the grid service and API; M9 asserts F1–F4 through the workload service and API and the person
grid. The synthetic edge cases in `r8-golden.md` (WORKLOAD and BOTH causes, load = cap → OK, …) become unit tests.

### 4.7 Coverage and "check"

- `pnpm check` must be green before every commit (G0–G4). It needs the dev DB (`pnpm db:up`), and CLAUDE.md's
  "unit test" requirement is satisfied as a superset (X40).
- The `src/domain/**` coverage threshold is ≥ 95 %; `pnpm test` fails below it. Other code has no numeric target; the `tests`
  review lens checks meaningful coverage of every AC and permission row.
- `pnpm test:e2e` is not part of `pnpm check`, because it builds the app. G2 and G4 run it explicitly (integrator only; only one
  `next build` per checkout).

---

## 5. Milestone index

| M | File | Owner-visible result | SPEC scope (§12) | Streams (agent) | E2E |
|---|---|---|---|---|---|
| M0 | `plan/m00-scaffold.md` | App boots with the Thai shell; toolchain strict and green; CSP on | §7.1–7.2, §8.1 shell, §8.7–8.8, §9 offline/headers, §10.1–10.3 dev DB/env, §11 tooling | S0 toolchain + scaffold + configs (platform) → S1 DB, migrations, Vitest harness, proxy headers (platform) · S2 UI shell: fonts, tokens, MUI theme, providers, sidebar, `/home` placeholder, i18n, format (frontend) · S3 e2e harness + smoke (test) | `m0-smoke` |
| M1 | `plan/m01-auth-employees.md` | Login, forced password change, sliding sessions, employees and positions admin, undo framework | §3.1–3.2 (employee rows), §4.1, §4.2, §5.1 (X01), §10.4 (manager + positions) | S0 contracts (backend) → S1 `dates.ts` + `units.ts` part (domain) · S2 Better Auth, proxy session gate, employee/position/account services (backend) · S3 auth pages, settings, UndoProvider, preferences (frontend) · S4 authz matrix harness + tests + e2e (test) | `m1-auth` |
| M2 | `plan/m02-clients-projects-authz.md` | Clients, projects, members; workers see only their projects (404 otherwise) | §3, §4.3, §4.4 (−FR-402, −FR-409 load, −FR-303 load) | S0 contracts (backend) → S1 authz+services (backend) · S2 sidebar/projects/clients UI (frontend) · S3 authz matrix+e2e (test) | `m2-projects` |
| M3 | `plan/m03-tasks.md` | Outliner task list, detail panel, server-side undo restore, `/my` basic, `?` help; **per-project statuses, blockers, list/board, `/tasks`** (v3.1) | §4.6 incl. §4.6.1–4.6.3 (−FR-612, −FR-667 person tab), §5.4, §5.5 (X03), §5.10, §7.5, §7.8 (tasks/statuses), §8.10 | S0 contracts (backend) → S1 `certainty.ts` + `status.ts` + `blockers.ts` + tree projection helpers (domain) · S2 task/status/blocker services (backend) · S3 task UI, board, `/tasks`, SortableTree, DateField, help dialog (frontend) · S4 tests + e2e (test) | `m3-tasks` |
| M4 | `plan/m04-pages-editor.md` | Notion-like pages: tables, pasted images, sub-pages, mentions, lock | §4.5, FR-402, §6.4 (pages), §7.6, §7.7, App. B | S0 contracts (backend) → S1 pages/files/lock backend (backend) · S2 BlockNote editor (editor) · S3 page shell/sidebar tree/palette (frontend) · S4 tests+e2e (test) | `m4-pages` |
| M5 | `plan/m05-calendar-capacity.md` | Holidays (CSV), leave types, time off with impact, team calendar | §4.9 (FR-906 capacity part), §5.1–5.2, §10.4 leave types | S0 contracts (backend) → S1 dates+capacity TDD (domain) · S2 calendar backend (backend) · S3 calendar/settings UI (frontend) · S4 tests+e2e (test) | `m5-calendar` |
| M6 | `plan/m06-weekly-grid.md` | Excel-like weekly planning grid; FR-612 "วางแผน N วัน"; golden F1 | §4.8 (week level), FR-643 grid badge (X76), §5.1, §5.3 (BR-21, 25–27), §5.5, §5.7, §6.3, §7.4–7.5 | S0 contracts (backend) → S1 units/certainty/allocation/completed (domain) · S2 grid+allocations backend (backend) · S3 PlanGrid (grid) · S4 plan tab + FR-612 UI (frontend) · S5 tests+golden+e2e (test) | `m6-grid` |
| M7 | `plan/m07-daily-resolution.md` | Zoom to days, inline week expansion, BR-24 dialog, day-level overload glyphs | §5.3 BR-20…24, §8.4, BR-40/45 at day level (X06) | S0 contracts (backend) → S1 allocation BR-22–24 + invariants + `overload.ts` levels/tones (domain) · S2 conversion backend (backend) · S3 day zoom/expand (grid) · S4 tests + e2e (test) | `m7-daily` |
| M8 | `plan/m08-milestones.md` | ◆ milestones on grids/calendar/overview, late warnings | §4.7, §5.9 | S0 contracts (backend) → S1 milestone.ts (domain) · S2 milestone backend (backend) · S3 ◆ row in grid (grid) · S4 overview/tasks/calendar UI (frontend) · S5 tests+e2e (test) | `m8-milestones` |
| M9 | `plan/m09-workload-people.md` | Team workload, overload list, person pages with masking; golden F2–F4 | §4.10, §5.6, §3.3 masking, FR-667 person tab (X77), FR-906/409/303 load parts | S0 contracts (backend) → S1 overload.ts (domain) · S2 workload/person backend + masking (backend) · S3 person grid mode (grid) · S4 workload/people UI (frontend) · S5 masking+golden+e2e (test) | `m9-workload` |
| M10 | `plan/m10-home-search.md` | `/home` dashboard; Cmd+K across everything + quick commands; **live task/workload blocks in project pages** (v3.1) | §4.11, §4.13, §7.8 (embeds), App. B.1 (X78) | S0 contracts (backend) → S1 home+search+embed backend (backend) · S2 home/palette UI (frontend) · S3 `taskView`/`projectWorkload` blocks (editor) · S4 tests+masking+e2e (test) | `m10-home-search` |
| M11 | `plan/m11-hardening-deploy.md` | `docker compose up` on a clean machine; backups; demo data; perf verified | §4.12, §9, §10, App. A.2, §11 perf | S0 audit sweep + contracts (backend) → S1 seed-demo/seed-perf (backend) · S2 Docker/compose/backup/Caddy/README (platform) · S3 perf+a11y+security checks (platform) · S4 full regression (test) | `m11-deploy` |

Dependency rule: milestone N may use anything delivered by milestones < N and must not build
anything owned by milestones > N (see each file's "Out of scope"). Where SPEC assigns a requirement
to milestone N but it physically needs data from a later milestone, §1.4 says which part lands where.

---

## 6. Risk register

| # | Risk | Where | Likelihood / impact | Mitigation built into the plan |
|---|---|---|---|---|
| R1 | Parallel agents clobber each other's files | every milestone | M / H | §2.3 ownership + S0 contracts + Edit-only namespaced i18n + requests; integration gate |
| R2 | Timezone/off-by-one bugs in plan dates | M5–M9 | H / H | ISODate strings only; integer epoch-day arithmetic in `dates.ts`; lint bans `new Date(` in `src/domain` (except `todayBangkok`); tests at 23:30 UTC and year boundary; `date({ mode: 'string' })` in Drizzle; e2e pinned to 2026-09-30 |
| R3 | Float drift in loads flips OVER/OK | M6–M9 | M / H | integer cd everywhere; string-based `numericToCd`; SQL sums cast to integer cd; exact integer largest-remainder; property tests |
| R4 | Masking leak (project/task names, leave types) | M2, M5, M9, M10 | M / H | masking only in services; JSON leak tests per endpoint (`JSON.stringify(body).includes(name) === false`); `authz` review lens |
| R5 | Grid too slow or janky (16 w × 200 rows; 50 ms edits) | M6–M9 | M / H | 2-axis virtualization, CSS Modules cells (no MUI per cell), memoized row model, windowed fetch; perf smoke in M6 with synthetic rows, full perf in M11 |
| R6 | WEEK/DAY exclusivity race under concurrency | M6–M7 | L / H | assignment `version` bump (`UPDATE … WHERE version = $base`) serialises writers per assignment before any allocation write; DB trigger as backstop; tests for conflicts |
| R7 | BlockNote gaps (Thai slash aliases, Excel paste, cell colours, file-size card) | M4 | M / M | research notes first; custom paste handler + TSV→table builder; custom attachment block if needed; Deviation path documented |
| R8 | Better Auth customisations (lockout per IP+email, must-change-password, immediate logout on deactivate) | M1 | M / H | dedicated integration tests; session cookie cache disabled or verified; ban revokes sessions |
| R9 | MUI + strict CSP (Emotion/BlockNote inject styles) | M0, M11 | M / M | CSP decided in M0 (`style-src 'self' 'unsafe-inline'`, nonce-based scripts); verified in e2e by checking no CSP violations in console |
| R10 | Local Node 26 vs production Node 22 behaviour | all | L / M | project pins Node 22 for scripts (see §1.5); Docker uses `node:22-alpine`; CI-like check in M11 runs inside the image |
| R11 | E2E flakiness | all | M / M | workers = 1; reseed per spec file; fixed server "today" + Playwright clock; role/label selectors from `th.ts`; no arbitrary sleeps |
| R12 | Scope creep (Phase-2 features "because easy") | all | M / M | per-milestone "Out of scope" lists; `scope` review lens; SPEC §13 is a hard stop |
| R13 | Server offline at runtime (fonts/CDN) | M0, M11 | M / M | `next/font/local`; no external URLs in code (lint/grep check in M11); compose test on an internal-only network |
| R14 | Sidebar/tree payload grows with 5 000 pages | M4, M10 | L / M | lazy-load page children per expanded node; titles-only payloads |
| R15 | Thai substring search misses/slow | M4, M10 | L / M | `pg_trgm` GIN + escaped `ILIKE '%q%'`; `word_similarity` ranking; content search only for ≥ 3 characters with a statement timeout; Debian Postgres image (C-locale DBs produce no Thai trigrams); tests with Thai substrings |
| R16 | Library churn: BlockNote 0.x breaks every few minors; TS 7 and ESLint 10 are "latest" but incompatible; Vitest 5 is new | all | M / M | exact pins (§1.2); upgrades only as their own Decision, with the full e2e suite; forbidden-package list |
| R17 | `next dev` rewrites `CLAUDE.md`; only one `next dev`/`build` per checkout | M0+ | H / M | `agentRules: false` in M0 before the first dev run; streams never run build/dev (§2.3); M0 gate diffs protected docs |
| R18 | FR-103 sliding session silently not renewed (RSC can't set cookies) | M1+ | H / H | DB-validating `proxy.ts` forwards `Set-Cookie` (verified); integration test on a 2-day-old session |
| R19 | SPEC DDL gaps (admin-plugin columns, missing trigram indexes, NULL committed, AM+PM conflict, WEEK/DAY race) | M1–M6 | H / M | corrections listed in §1.3 and applied in the milestone that creates each table |
| R20 | DAY rows > 1.00 produced by WEEK→DAY conversions (golden F2–F4) violate the DB check | M6–M7 | H / H | clamp-and-spill in every DAY writer + property tests (sum preserved, each day ≤ 100) |
| R21 | Thai keyboard layout breaks `e.key`-based shortcuts (`f`, `h`, digits, Cmd+K/Z) | M3, M6, M10 | H / M | `e.code`-first key helper (X49); Thai digits parsed; manual QA with the Kedmanee layout |
| R22 | Dependencies near end of life: Node 22 (EOL 2027-04), ESLint 9 (EOL), dnd-kit classic (unmaintained since 2024) | post-MVP | M / L | recorded Decisions; the projection logic is library-agnostic; upgrade paths noted in Known issues |
| R23 | M3 grows substantially with v3.1 (statuses, blockers, board, `/tasks`) | M3 | H / M | the contracts stream fixes every v3.1 schema/DTO/action up front; board and `/tasks` share one component set (X74); if the gate fails twice, split the board + `/tasks` UI into a follow-up stream inside M3 rather than deferring requirements |
| R24 | Drizzle output for composite FKs, `unique (project_id, id)` and the `lower(name)` partial unique index differs from SPEC DDL | M3 | M / M | inspect the generated SQL in the contracts stream; an integration test inserts a task whose status belongs to another project and expects a FK violation; expression index falls back to a custom migration if generate cannot express it |

---

## 7. Traceability

See `plan/traceability.md`.

---

## 8. Plan-file format (`plan/mNN-<slug>.md`)

Every milestone file uses exactly these sections so humans and the saved workflow can navigate it.

````markdown
# M<N> — <title>

> Depends on: M<N-1> ✅ · SPEC: §… · Owner-visible result: <one sentence>

## 1. Goal and scope
In scope (FR/BR/AC ids) · Out of scope (with the milestone/section where each lands) · Carried-in items

## 2. Read first
SPEC sections · PLAN.md sections · plan/research notes · docs/ references

## 3. Decisions for this milestone
| ID | SPEC ref | Decision | Rationale |        ← copied into PROGRESS.md › Decisions at kickoff

## 4. Streams (machine-readable)
```json
{ "milestone": <N>,
  "streams": [
    { "id": "S0", "title": "…", "agent": "backend-engineer", "owns": ["glob", …], "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "…", "agent": "domain-engineer",  "owns": [...], "dependsOn": ["S0"], "planSection": "5.S1" }
  ],
  "e2e": ["e2e/m<N>-<slug>.spec.ts"] }
```

## 5. Step-by-step
### 5.S0 — <title>  (agent · owns)
S0.1 …  (each step: files, exact signatures/skeletons, tests to write first, done-check)
### 5.S1 — …

## 6. Integration (orchestrator)
Requests expected, wiring order, commands.

## 7. Verification
7.1 AC → test map · 7.2 Authz matrix rows added · 7.3 E2E scenarios · 7.4 Golden/perf/manual checks

## 8. Definition of done
Checklist (SPEC §12 "Done when" + CLAUDE.md DoD + milestone specifics).

## 9. Risks and gotchas

## 10. Close-out
PROGRESS.md updates · commit message · tag
````

The `agent` values must be one of: `domain-engineer`, `backend-engineer`, `frontend-engineer`,
`grid-engineer`, `editor-engineer`, `test-engineer`, `platform-engineer`. `S0` has no dependencies and
runs alone. `owns` globs of streams that can run concurrently must not overlap (except the
namespace-scoped `src/i18n/th.ts` rule in §2.3, which is expressed as the owner of `th.ts` = S0).
