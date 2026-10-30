# plan/research — verified facts gathered on 2026-09-30

Nine research agents checked every library, API and rule the plan depends on, and ran code where it
mattered. They installed packages, read `.d.ts` files, built Next apps, ran Postgres 17 containers
and ran Playwright in Chromium. **Use these notes instead of memory** when you write library code.
If a note conflicts with SPEC.md, SPEC.md wins. If it conflicts with PLAN.md §1, PLAN.md §1 wins,
because it records the final decision.

| File | What it covers | Read when |
|---|---|---|
| `r1-next-mui-tooling.md` | Next 16.3 (proxy.ts, async APIs, `refresh()`/`updateTag`, typegen, standalone/Docker, CSP), MUI 9.4, date pickers (Buddhist era), Thai fonts via `next/font/local`, pnpm 12 + Node 22 pinning, ESLint/TS versions, `agentRules:false` | M0, M1, M11, any UI work |
| `r2-auth-db.md` | Better Auth 1.7 (config, admin plugin, lockout hooks, sessions/cookies, direct-insert users), Drizzle 0.45 (all schema features, custom migrations, migrator semantics), postgres.js type round-trips, the §6.2 DDL validated on PG 17 plus its corrections | M1, M2, every schema change, M5 (exclusion), M6 (trigger/race) |
| `r3-blocknote.md` | BlockNote 0.55 with Mantine inside MUI: options, custom blocks and inline content, Thai slash menu ranking and guards, the Excel/TSV paste handler, uploads, the attachment block, content_text walker, theming, lock and autosave pitfalls | M4 |
| `r4-client-testing.md` | TanStack Query 5.104 and Virtual 3.14 (verified 2D grid and save hook), dnd-kit tree projection, cmdk in an MUI Dialog, sonner, fractional-indexing + `COLLATE "C"`, file-type 22, Zod 4, Vitest 5 (projects, template DB per worker, coverage), Playwright 1.63 (clock, clipboard), the ESLint rules (Thai ban, domain purity) | M0, M3, M4, M6, all testing |
| `r5-v21-mining.md` | Insights from the superseded design-spec v2.1 that still apply, plus 37 explicit "do NOT follow v2.1" conflicts | Before planning or implementing any milestone |
| `r6a-gaps-m0-m5.md` | 121 gap, ambiguity and cross-milestone items for M0–M5, each with a proposed decision | M0–M5 (the decisions are summarised in PLAN.md §1.4) |
| `r6b-gaps-m6-m11.md` | 106 items for M6–M11 (grid, daily, milestones, workload, search, deploy) | M6–M11 |
| `r7-traceability.md` | Draft matrix: every FR/BR/AC/permission/NFR mapped to milestone and test (superseded by `plan/traceability.md` once written) | Planning and review |
| `r8-golden.md` | Independent recomputation of the golden fixtures (all match) with concrete test numbers, e.g. AC-801/802/804 values, badge counts, masking examples, day-level derived values | M1–M3 seeds, M6, M7, M9 tests and e2e |

## Verified code snippets (`snippets/`)

The research agents typechecked or ran these files. Copy and adapt them rather than writing the
same glue from scratch.

| Path | Contents |
|---|---|
| `snippets/r1/` | Next 16.3.7 + MUI 9.4 app pieces: `src/proxy.ts` (CSP nonce), `src/theme.ts`, `src/app/providers.tsx`, `src/app/fonts.ts` (two-family Thai font) + OFL licence, `src/components/Link.tsx`, BlockNote loader, `next.config.ts`, `Dockerfile`, `.dockerignore`, `pnpm-workspace.yaml`, `csp-check.mjs` |
| `snippets/r2/` | `v2/gen/auth.ts` (Better Auth config with admin roles and lockout hooks), `v2/kt2/schema.ts` (Drizzle schema translated from §6.2), `app/drizzle/*.sql` (extensions, init, constraints and triggers), `app/scripts/migrate.ts`, `app/scripts/lockout-api.ts`, validated SQL (`sql/*.sql`, including the fixed trigger and the half-day conflict probe) |
| `snippets/r3/` | BlockNote harness: `harness/src/schema.ts`, `Editor.tsx`, `editor-theme.css`, `slashMenu.tsx`, `blocks/subpage.tsx`, `blocks/attachment.tsx`, `inline/mention.tsx`, `lib/{th-editor,dictionary,paste,tsv,suggest,contentText,upload,stores}.ts`; tests in `nodecheck/`; the Next page/editor split in `next-app-pnpm/`; a real document fixture in `fixtures/complex-doc.json` |
| `snippets/r4/` | `lint/eslint.config.mjs` (validated), `lint/prettier.config.ts`, `vitest/vitest.config.ts` + `tests/setup/{db-global,db-worker,ui}.ts`, `playwright/playwright.config.ts` + e2e samples, `client/components/grid/{VirtualGrid.tsx,useGridWindow.ts,useSaveAllocations.ts,grid-types.ts}`, `client/components/tree/{tree-projection.ts,SortableTree.tsx}`, `client/components/palette/CommandPalette.tsx`, `client/components/ToasterHost.tsx`, `client/lib/{query-client,action-result}.ts`, `server/classify-upload.ts`, `db/order-key.schema.ts` |
| `snippets/r8/` | `verify-golden.mjs` (integer-cd recomputation of F1–F4) and `facts.json` |

Some reports also mention experiment folders that were not kept, such as `pwh/`, `nx/`, `vt/` and
`exp-*`. The table above lists the curated files that were kept.

- `handoff-2026-10-30.md` — archived planning to-do list of 2026-10-30 (T1–T10 all ✅) with the collected cross-milestone gaps G1–G58 / C1–C102 that became PLAN X80–X96.
