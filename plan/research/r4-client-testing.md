# R4 — Client libraries & test toolchain (verified 2026-09-30)

> Generated from the r4 research agent's structured output (the agent could not write its own report file). Verified code lives in `plan/research/snippets/r4/` (typechecked with TS 6.0.3, linted with the final ESLint config, and executed where stated).

## Versions

| Package | Version | Notes |
|---|---|---|
| `typescript` | ~6.0.3 | npm 'latest' is 7.0.2 (Go-native; package root exports only lib/version.cjs plus unstable/*). typescript-eslint 8.71.0 peers typescript >=4.8.4 <6.1.0, so pin 6.0.3, the last 6.x (released 2026-04-16). create-next-app 16.3.7 would install ^5 (5.9.3). next build 16.3.7 type-checks fine with 6.0.3. |
| `next / eslint-config-next / @next/eslint-plugin-next` | 16.3.7 | Keep eslint-config-next equal to next. The canary 16.4.0-canary.53 still bundles eslint-plugin-react ^7.37. |
| `react / react-dom / @types/react / @types/react-dom` | 19.3.0 | react-dom 19.3 still exports unstable_batchedUpdates (used by dnd-kit core). |
| `@types/node` | ^22.20.4 | Matches the node:22 runtime (latest @types/node is 26.6.3). |
| `@tanstack/react-query (+ -devtools)` | 5.104.0 | New mutation callback signatures, scope, queryClient.query()/infiniteQuery(); isServer, fetchQuery and prefetchQuery are deprecated. |
| `@tanstack/react-virtual (virtual-core)` | 3.14.13 (core 3.17.11) | anchorTo, followOnAppend, directDomUpdates, useFlushSync. Peers react ^16.8–^19. |
| `@dnd-kit/core / @dnd-kit/sortable / @dnd-kit/utilities / @dnd-kit/modifiers` | 6.3.1 / 10.0.0 / 3.2.2 / 9.0.0 | Recommended. Last published Dec 2024 (utilities Nov 2023). Peer react >=16.8, works with React 19.3 (verified in Chromium). |
| `@dnd-kit/react (+ dom/helpers/abstract/collision/state)` | 0.5.0 (beta 0.5.1-beta-20260912195958) | Not recommended: still 0.x with a breaking minor roughly every two months (0.2 Dec-2025, 0.3 Feb-2026, 0.4 Apr-2026, 0.5 Jun-2026), and no tree helpers. |
| `cmdk` | 1.1.1 | Released 2025-03-14. Peer react ^18\|\|^19. Depends on @radix-ui/react-dialog/-primitive/-id/-compose-refs. |
| `sonner` | 2.0.8 | Released 2026-08-09. Peer react ^18\|\|^19. Defaults: 4000 ms, bottom-right, Alt+T hotkey. Injects CSS through a style tag without a nonce. |
| `fractional-indexing` | 4.0.0 | Released 2026-06-25, ESM. Never pass the digits argument (it switches to self-headed keys). |
| `file-type` | 22.1.1 | ESM-only, engines node >=22. Legacy .doc/.xls/.ppt all detect as 'cfb'. |
| `zod` | 4.6.5 | Has a Thai locale (z.locales.th). Implements Standard Schema v1. |
| `react-hook-form / @hookform/resolvers` | 7.89.0 / 5.9.1 | Not recommended for this app. Resolvers peer zod ^3.25\|\|^4 with typed Zod 4 overloads, RHF ^7.55. |
| `server-only` | 0.0.1 | Its default export throws outside the react-server condition, so alias it to an empty module in Vitest. |
| `vitest / @vitest/coverage-v8` | ~5.0.2 | 5.0.0 was released 2026-09-03, 5.0.2 on 2026-09-25. Engines node ^22.12\|\|^24\|\|>=26. vite is a REQUIRED peer. Fallback: 4.1.11. |
| `vite` | ^8.3.1 | Built-in resolve.tsconfigPaths, so no vite-tsconfig-paths plugin is needed. |
| `@vitejs/plugin-react` | ^6.1.1 | Peer vite ^8. The babel and React-compiler peers are optional. |
| `jsdom` | ^30.1.1 | Recommended DOM environment. Engines node ^22.22.2 \|\| ^24.15.0 \|\| >=26. |
| `happy-dom` | 20.14.5 | Works for the same tests. Fallback only. |
| `@testing-library/react / dom / user-event / jest-dom` | 16.3.3 / 10.4.2 / 14.6.7 / 7.0.1 | jest-dom 7 requires node >=22 and ships a '@testing-library/jest-dom/vitest' entry. |
| `fast-check / @fast-check/vitest` | 4.10.2 / 0.5.0 | The adapter peers vitest ^4.1\|\|^5. |
| `@playwright/test` | ~1.63.0 | Chromium 153.0.8010.12 (revision 1243). |
| `eslint` | ^10.11.0 | v9 has been EOL since 2026-08-06 (9.39.5 was the last release). Requires settings.react.version to be pinned because of eslint-config-next's bundled eslint-plugin-react 7.37.5. |
| `typescript-eslint` | ^8.71.0 | Peer eslint ^8.57\|\|^9\|\|^10, typescript <6.1.0. |
| `eslint-plugin-react-hooks (transitive via eslint-config-next)` | 7.1.1 | Includes React-Compiler-based rules; set-state-in-effect is an error. |
| `@eslint-community/eslint-plugin-eslint-comments` | ^4.8.1 | Peer eslint up to ^10. Import from '@eslint-community/eslint-plugin-eslint-comments/configs'. |
| `eslint-config-prettier` | ^10.1.8 | Import from 'eslint-config-prettier/flat'. |
| `prettier` | ^3.9.9 | Prefer prettier.config.mjs (a .ts config needs Node type stripping). |
| `@mui/material / @mui/material-nextjs / @emotion/react / @emotion/styled` | 9.4.0 / 9.4.0 / 11.14.0 / 11.14.1 | Context only (MUI is covered by another report). Dialog uses the slots/slotProps API. |
| `drizzle-orm / drizzle-kit / postgres` | 0.45.3 / 0.31.11 / 3.4.9 | Context only. drizzle-orm has no column .collate(); use a customType. |
| `node` | 22.23.3 (LTS 'Jod', 2026-09-23) | The dev machine runs 26.5.0; CI and Docker should use 22.x at >=22.22.2. |
| `pnpm` | 12.8.1 (npm latest) | Corepack is not available on this machine. The M0 plan must pick and install a pnpm version explicitly. |

## Facts

### 1. Artifacts index — _verified_

**Finding.** Clean, verified copies are in plan/research/snippets/r4/. Contents: lint/eslint.config.mjs; lint/prettier.config.ts; vitest/vitest.config.ts; vitest/tests/setup/{db-global.ts, db-worker.ts, ui.ts}; vitest/tests/integration/{rename-task.test.ts, isolation-1.test.ts}; vitest/src/** (dates.ts, dates.test.ts, UndoToastButton(.test).tsx, VirtualList.test.tsx, server/db.ts, server/actions/rename-task.ts); playwright/{playwright.config.ts, e2e/auth.setup.ts, e2e/harness.spec.ts, e2e/controls.spec.ts, e2e/footer.spec.ts}; client/lib/{query-client.ts, action-result.ts}; client/components/providers.tsx; client/app/projects/p/page.tsx (HydrationBoundary); client/components/grid/{VirtualGrid.tsx, useGridWindow.ts, useSaveAllocations.ts, grid-types.ts}; client/components/tree/{SortableTree.tsx, tree-projection.ts, tree-projection.test.ts}; client/components/palette/CommandPalette.tsx; client/components/ToasterHost.tsx; server/classify-upload.ts; db/{order-key.schema.ts, order-key.generated.sql}. The Playwright harness app is at .../r4-client-test/pwh/app/main.tsx.

**Plan implication.** Plan steps should point implementers at these files (copy into plan/research or reference them) instead of having them write library glue from memory.

**Evidence.** tsc -p r4-client-test/tc → exit 0; eslint r4-client-test/tc/src --max-warnings 0 → 0 findings; Vitest run 7 files / 15 tests passed; Playwright 16/16 passed; Next 16.3.7 build + start OK.

### 2. TypeScript version pin — _verified_

**Finding.** typescript 'latest' is 7.0.2 (released 2026-07-08; the Go-native compiler). Its package root exports only './lib/version.cjs' plus './unstable/*', so there is no classic compiler API. typescript-eslint 8.71.0 (released 2026-09-28) peers 'typescript: >=4.8.4 <6.1.0'. 6.0.3 is the last 6.x. create-next-app 16.3.7 writes typescript '^5'. Next 16.3.7 'next build' completed its 'Running TypeScript' step with 6.0.3. Next also has TS7 CLI fallbacks (runTypeScriptCli.js).

**Plan implication.** M0 must install typescript@~6.0.3 explicitly. A bare 'pnpm add -D typescript' would pull 7.x and break typed linting. Record this in PROGRESS Decisions.

**Evidence.** npm view typescript dist-tags → latest 7.0.2; npm view typescript@7.0.2 exports; npm view typescript-eslint@8.71.0 peerDependencies; build log in r4-client-test/nx ('Finished TypeScript').

### 3. TypeScript 6 defaults that affect the scaffold — _verified_

**Finding.** Under TS 6.0.3: (1) 'types' defaults to [], so without "types": ["node"] you get TS2591 'Cannot find name process'. (2) Setting 'baseUrl' is a hard error TS5101 (deprecated) unless ignoreDeprecations '6.0' is set. (3) noUncheckedSideEffectImports defaults to true, so unresolved side-effect imports fail with TS2882. CSS imports still pass because next/types/global.d.ts line 45 declares module '*.css'. (4) noUncheckedIndexedAccess rejects 'const [{ db }] = await sql`...`'. (5) 'next typegen' exists in 16.3.7 and generates .next/types/routes.d.ts (global PageProps/LayoutProps/RouteContext).

**Plan implication.** tsconfig: strict, noUncheckedIndexedAccess, types ['node'], paths '@/*' with no baseUrl, moduleResolution bundler; install server-only. Script: 'typecheck': 'next typegen && tsc --noEmit'. Code pattern: 'const [row] = rows; row?.x'. A working tsconfig is r4-client-test/nx/tsconfig.json.

**Evidence.** r4-client-test/ts6types experiments (tsc outputs quoted); tsc --help --all shows 'noUncheckedSideEffectImports default: true'; r4-client-test/vt tsc caught the destructuring error.

### 4. TanStack Query 5.104: infinite queries — _verified_

**Finding.** Options are initialPageParam (required), getNextPageParam(lastPage, allPages, lastPageParam, allPageParams) (required), getPreviousPageParam(firstPage, allPages, firstPageParam, allPageParams) (optional; drives hasPreviousPage), and maxPages?: number ('Maximum number of pages to store'). The result exposes fetchNextPage, fetchPreviousPage({cancelRefetch}), hasNextPage, hasPreviousPage, isFetchingPreviousPage and isFetchPreviousPageError. data is { pages, pageParams } with index-aligned arrays. queryFn context.direction is @deprecated ('add it to the pageParam').

**Plan implication.** The grid's timeline page param should be the chunk start ISODate (e.g. 8 weeks). If useInfiniteQuery is used, it needs both page-param functions plus maxPages.

**Evidence.** node_modules/@tanstack/query-core/build/modern/hydration-B9t5w6NC.d.ts lines ~1861-2011, 2200-2451; runtime qc.infiniteQuery(...) returned {pages:[...], pageParams:['2026-09-28']}.

### 5. TanStack Query: infinite refetch and maxPages semantics — _verified_

**Finding.** infiniteQueryBehavior.js shows that a refetch or invalidate (no direction) starts at oldPageParams[0] and walks getNextPageParam in a SEQUENTIAL loop for oldPages.length pages: N serial requests. fetchNextPage/fetchPreviousPage add through addToEnd/addToStart(..., maxPages), which trims pages from the opposite end.

**Plan implication.** Do not rely on invalidating a big infinite query after every save. Write the server's authoritative result into the cache with setQueriesData, and refetch only on VERSION_CONFLICT or error.

**Evidence.** node_modules/@tanstack/query-core/build/modern/infiniteQueryBehavior.js (fetchFn do/while loop; addTo(..., maxPages)).

### 6. TanStack Query: mutations, callbacks and scope — _verified_

**Finding.** Signatures: mutationFn(variables, context); onMutate(variables, context); onSuccess(data, variables, onMutateResult, context); onError(error, variables, onMutateResult|undefined, context); onSettled(data|undefined, error|null, variables, onMutateResult|undefined, context), where context = { client: QueryClient, meta, mutationKey }. scope?: { id: string } queues mutations that share an id; unscoped mutations run in parallel. Mutation.execute runs onMutate BEFORE 'await retryer.start()' (the point where a scoped mutation waits), so optimistic updates apply instantly even when queued. onSuccess/onError/onSettled run BEFORE the status leaves 'pending', so inside onError, client.isMutating({mutationKey}) still counts the failing mutation.

**Plan implication.** Grid saves use scope {id: 'grid-save:<projectId>'}. Read baseVersion inside mutationFn from a ref updated by the previous save. On error, restore the snapshot only when isMutating(key) === 1; otherwise invalidate and resync. See plan/research/snippets/r4/client/components/grid/useSaveAllocations.ts.

**Evidence.** hydration-B9t5w6NC.d.ts lines 2550-2650 (MutationScope/MutationOptions); mutation.js execute() lines 130-215; mutationCache.js canRun/runNext.

### 7. TanStack Query: deprecations and new methods — _verified_

**Finding.** Marked @deprecated: isServer ('use environmentManager.isServer() instead'; it is still a boolean at runtime), fetchQuery, prefetchQuery, ensureQueryData, fetchInfiniteQuery and prefetchInfiniteQuery. Use queryClient.query(options) / queryClient.infiniteQuery(options) instead ('swallow errors with .catch(noop)'; ensureQueryData becomes query({...,staleTime:'static'})). @typescript-eslint/no-deprecated flags isServer and prefetchQuery.

**Plan implication.** Use environmentManager.isServer() in getQueryClient() and qc.query(...).catch(noop) for server prefetch. Keep no-deprecated on in ESLint.

**Evidence.** hydration-B9t5w6NC.d.ts lines 936-939, 1337-1549; environmentManager.d.ts; ESLint run output: '`isServer` is deprecated. use `environmentManager.isServer()` instead.'

### 8. TanStack Query: per-request QueryClient + HydrationBoundary in the App Router — _verified_

**Finding.** Pattern: makeQueryClient() sets staleTime 60s and dehydrate.shouldDehydrateQuery = defaultShouldDehydrateQuery(q) || q.state.status==='pending', plus shouldRedactErrors: () => false. getQueryClient() returns a new client on the server and a browser singleton on the client. The Providers client component calls getQueryClient() rather than useState. The server page uses 'const getServerQueryClient = cache(makeQueryClient)', calls qc.query({queryKey, queryFn}).catch(noop), and renders <HydrationBoundary state={dehydrate(qc)}>. This was executed in a Next 16.3.7 production build (Turbopack) and in the standalone server: the client useQuery SSR-rendered 'success:{"weeks":["2026-09-28","2026-10-05"],"id":"p1"}'.

**Plan implication.** Copy plan/research/snippets/r4/client/lib/query-client.ts, components/providers.tsx and app/projects/p/page.tsx. For the grid itself, SSR prefetch is optional; client-only fetching with a skeleton is simpler for M6.

**Evidence.** r4-client-test/nx (app/page.tsx, lib/query-client.ts); curl of standalone server output quoted; HydrationBoundary.d.ts docs.

### 9. Grid timeline data strategy — _likely_

**Finding.** Two shapes typecheck against 5.104 (plan/research/snippets/r4/client/components/grid/useGridWindow.ts). Option A is bidirectional useInfiniteQuery (initialPageParam = today's chunk, getNext/PreviousPageParam = ±8 weeks, maxPages 6). Option B is independent chunk queries via useQueries({queries: chunkStarts.map(...), combine}) keyed ['grid','project',id,{from,expand}]. Option B refetches chunks in parallel, can invalidate only the affected chunk, lets gcTime drop off-screen chunks, and has no maxPages index shifting. setQueriesData({queryKey: ['grid','project',id]}) patches every cached chunk in one call.

**Plan implication.** Recommend Option B, keeping the SPEC's GET /api/grid/project/:id?from&to&expand unchanged: one request per chunk; merge rows client-side by task id / taskAssignmentId and cells by period key. Put the pure cache operations (applyChangesOptimistically, applyServerWeeks, mergeChunks) in unit-tested modules.

**Evidence.** Design reasoning backed by the verified refetch semantics (infiniteQueryBehavior.js) and a typecheck of both options in r4-client-test/tc.

### 10. Next.js serializes Server Actions per client — _verified_

**Finding.** Next 16.3.7's bundled docs say: 'Next.js dispatches Server Actions one at a time per client. If a user triggers three actions in quick succession, the second waits for the first to finish... do not rely on Promise.all to parallelize Server Actions from the client.' Also 07-mutating-data.md: 'The client currently dispatches and awaits them one at a time.'

**Plan implication.** Keep grid/workload reads on route handlers (as the SPEC does) and keep the page-lock heartbeat a route handler. Keep saveAllocations fast and avoid revalidatePath/updateTag in it (it would re-render RSC on every debounced save). The TanStack scope is still needed for version chaining and the rollback-vs-resync decision.

**Evidence.** node_modules/next/dist/docs/01-app/02-guides/server-actions.md line 26-30; 01-getting-started/07-mutating-data.md line 207.

### 11. Optimistic saveAllocations (SPEC 7.4) — _verified_

**Finding.** The verified shape is useMutation<SaveAllocationsOk, Error, Vars, {snapshot}>. mutationKey is ['saveAllocations', projectId] and scope is {id: `grid-save:${projectId}`}. mutationFn calls unwrap(await saveAllocations({...vars, baseVersion})), which turns {ok:false} into a thrown ActionError so onError fires. onMutate does cancelQueries + getQueriesData snapshot + setQueriesData(optimistic). onError restores the snapshot if nothing else is queued, otherwise invalidates; on VERSION_CONFLICT it shows a warning toast and invalidates; otherwise toast.error(th.grid.saveFailed). onSuccess writes the server's 'weeks' into every chunk with no refetch.

**Plan implication.** Use plan/research/snippets/r4/client/components/grid/useSaveAllocations.ts and lib/action-result.ts as the M6 contract. Debounce 400 ms client-side and flush on blur (SPEC).

**Evidence.** Typechecked in r4-client-test/tc with TS 6.0.3; callback ordering verified in mutation.js.

### 12. TanStack Virtual 3.14.13: API and anchorTo — _verified_

**Finding.** VirtualizerOptions include count, getScrollElement, estimateSize, horizontal, paddingStart/End, scrollPaddingStart/End, initialOffset, getItemKey, rangeExtractor, scrollMargin, gap, overscan, lanes, anchorTo 'start'|'end', followOnAppend, scrollEndThreshold, enabled, isRtl, initialRect, measureElement and onChange. Methods: scrollToIndex(i,{align,behavior}), scrollToOffset, scrollBy, scrollToEnd, getVirtualItems, getTotalSize, measure, resizeItem, getVirtualItemForOffset, isAtEnd and takeSnapshot. The official docs say: 'Use end for chat and reverse feeds to maintain visibility when prepending items with a stable getItemKey.' The source records [key of the item at the current offset, offset within it] whenever count or edge keys change, then restores it.

**Plan implication.** Horizontal column virtualizer: horizontal:true, getItemKey = period key (ISODate), anchorTo:'end', paddingStart = scrollPaddingStart = first-column width, and estimateSize by kind (WEEK/DAY).

**Evidence.** node_modules/@tanstack/virtual-core/dist/esm/index.d.ts; src/index.ts setOptions anchor logic; https://tanstack.com/virtual/latest/docs/api/virtualizer.

### 13. TanStack Virtual: 2D grid behaviour in a real browser — _verified_

**Finding.** Checked in Chromium 153 with React 19.3 + MUI 9 (harness r4-client-test/pwh/app/main.tsx; 16/16 Playwright tests pass). (1) The sticky header row, sticky first column and sticky FOOTER row stay put at top-left, middle and max scroll (checked with elementFromPoint). (2) The Today button, scrollToIndex(todayIdx,{align:'start'}) with scrollPaddingStart = sticky width, puts 2026-09-28 right after the sticky column. (3) Prepending 8 weeks keeps the same first visible column and scrollLeft goes 640 → 1280 (8×80 px). (4) Control run with the default anchorTo 'start': scrollLeft stayed 640 and the first visible column jumped to 2026-08-03. (5) Appending doesn't move the viewport. (6) Expanding one week into five 48 px day columns between 80 px week columns lays out correctly. Layout details: one scroll container shared by both virtualizers; rows are absolutely positioned via top (not transform); the header is the first in-flow child of the sized container; the footer is an in-flow sibling after the sized container with position:sticky; bottom:0; sticky cells use left:0.

**Plan implication.** Use plan/research/snippets/r4/client/components/grid/VirtualGrid.tsx as the M6 PlanGrid skeleton (typechecked; same structure as the verified harness). Add aria-rowindex/colindex (SPEC 8.9). Guard onNearStart/onNearEnd so only one prepend/append is pending at a time.

**Evidence.** pwh/e2e/harness.spec.ts, controls.spec.ts, footer.spec.ts output: '[prepend] scrollLeft 640 -> 1280'; '[anchor=start] scrollLeft 640 -> 640 first visible 2026-08-03'.

### 14. TanStack Virtual: re-measure rules — _verified_

**Finding.** The measurement memo deps are [count, paddingStart, scrollMargin, getItemKey, enabled, lanes, laneAssignmentMode, gap]. estimateSize is NOT a dependency. measure() clears the size cache and bumps itemSizeCacheVersion, forcing a rebuild.

**Plan implication.** Memoize getItemKey on the columns array (new identity when columns change), or call colVirtualizer.measure() when widths change without a count or key change (e.g. a unit toggle).

**Evidence.** node_modules/@tanstack/virtual-core/src/index.ts lines 1264-1320 and 2111-2119.

### 15. TanStack Virtual: React 19 flushSync and lint — _verified_

**Finding.** useFlushSync defaults to true (react adapter calls flushSync(rerender) on sync scroll updates). The official docs note the React 19 warning 'flushSync was called from inside a lifecycle method' and that 'Setting useFlushSync: false will eliminate this warning'. directDomUpdates (skip re-renders for scroll-only updates, needs containerRef) is optional and was not verified for 2D. eslint-plugin-react-hooks 7 reports react-hooks/incompatible-library (warning) on every useVirtualizer().

**Plan implication.** Pass useFlushSync:false on both virtualizers. Turn react-hooks/incompatible-library off (the React Compiler is not enabled). Only consider directDomUpdates after profiling.

**Evidence.** node_modules/@tanstack/react-virtual/dist/esm/index.js lines 7, 79-80; https://tanstack.com/virtual/latest/docs/framework/react/react-virtual; ESLint output on the Complex.tsx sample.

### 16. Testing virtualized components in jsdom/happy-dom — _verified_

**Finding.** Both environments render 0 virtual rows by default. Passing initialRect alone does not help, because the first measurement overwrites it: virtual-core getRect reads element.offsetWidth/offsetHeight, not getBoundingClientRect. Stubbing the getters works in both: vi.spyOn(HTMLElement.prototype,'offsetHeight','get').mockReturnValue(200) plus offsetWidth → exactly 10 rows for 20 px rows.

**Plan implication.** Component tests of virtualized lists must stub offsetWidth/offsetHeight (restoreMocks:true cleans up). Keep grid interaction tests (keyboard, fill handle, paste, undo) in Playwright.

**Evidence.** plan/research/snippets/r4/vitest/src/components/VirtualList.test.tsx; vitest --project ui passes under jsdom and --environment happy-dom.

### 17. dnd-kit package choice — _verified_

**Finding.** Classic @dnd-kit/core 6.3.1 + sortable 10.0.0 + utilities 3.2.2 (+ modifiers 9.0.0) peer react >=16.8. They use unstable_batchedUpdates, which react-dom 19.3 still exports, and no findDOMNode. A drag with PointerSensor + SortableContext + DragOverlay works in Chromium with React 19.3. @dnd-kit/react 0.5.0 is still pre-1.0 with breaking minors, and @dnd-kit/helpers only has arrayMove/arraySwap/move/swap (no tree support). The official Sortable Tree example exists only for the classic API (stories/3 - Examples/Tree).

**Plan implication.** Use the classic packages for the task outliner (3 levels) and the page tree (10 levels, FR-502/503). Record this in Decisions. The projection helpers are pure and library-agnostic, so a later migration is cheap.

**Evidence.** npm view time/peerDependencies; node -e typeof require('react-dom').unstable_batchedUpdates → function; pwh tree drag test passed.

### 18. dnd-kit tree projection (corrected) — _verified_

**Finding.** The official getProjection clamps depth to [next.depth, prev.depth+1] and derives the parent from neighbours. For this app it needs three fixes: (1) a depth cap that includes the dragged subtree: maxDepth = min(prev.depth+1, MAX_DEPTH_INDEX - subtreeHeight(active)), where tasks MAX_DEPTH_INDEX = 2 and pages = 9; (2) if maxDepth < minDepth, return {valid:false} (reject the drop with a non-colour-only indicator); (3) fractional-index neighbours are the nearest rows above and below at the target depth, stopping at shallower rows (the naive adjacent row can collide with or overtake the real next sibling). The result is {valid, depth, parentId, prevSiblingId, nextSiblingId}, then position = generateKeyBetween(prev?.position ?? null, next?.position ?? null).

**Plan implication.** Copy plan/research/snippets/r4/client/components/tree/tree-projection.ts (7 node:test cases pass, including a subtree cap that makes a drop invalid and a sibling lookup that skips deeper rows) and SortableTree.tsx. Unit-test it in src/components/tree with Vitest.

**Evidence.** https://raw.githubusercontent.com/clauderic/dnd-kit/master/stories/3%20-%20Examples/Tree/utilities.ts; node --test pwh/app/tree-projection.test.ts → 7 pass; Chromium drag log {id:'C', parentId:'B', depth:1, position:'a0'}.

### 19. dnd-kit modifiers pitfall — _verified_

**Finding.** event.delta in onDragMove is computed from add(modifiedTranslate, scrollAdjustment), i.e. AFTER modifiers are applied. restrictToVerticalAxis on DndContext therefore makes delta.x always 0, and the tree depth never changes. Control test with restrictToVerticalAxis: dragging C right logged parentId null, depth 0.

**Plan implication.** Never put restrictToVerticalAxis (or any x-zeroing modifier) on DndContext for trees. If a vertical-only visual is wanted, apply modifiers only on <DragOverlay modifiers>.

**Evidence.** node_modules/@dnd-kit/core/dist/core.esm.js lines ~2959-3230; pwh/e2e/controls.spec.ts output.

### 20. Tree moves and outliner keys (server) — _likely_

**Finding.** Client projections are only hints. The moveTask/movePage services must re-check the depth caps (tasks 3 levels AC-602, pages 10 levels FR-502), the same space/project constraint, cycles and permissions, and regenerate the key between the real neighbours inside the transaction. Tab/Shift+Tab (FR-603) needs no dnd-kit: Tab makes the previous sibling the parent and appends as its last child if depth ≤ cap; Shift+Tab re-parents to the grandparent right after the old parent.

**Plan implication.** Spec these as service-level functions with unit and authz tests. The client sends intent (parentId, afterId/beforeId), not raw keys.

**Evidence.** Design derived from SPEC FR-502/503/603/604 and the verified projection code.

### 21. cmdk 1.1.1 inside MUI Dialog — _verified_

**Finding.** Props (dist/index.d.ts): Command label, shouldFilter (false = 'you must conditionally render valid items based on the search query yourself'), filter, value/onValueChange (selected item), loop, disablePointerSelection, and vimBindings ('Set to false to disable ctrl+n/j/p/k shortcuts. Defaults to true'). Command.Input takes value/onValueChange (search text). Command.Item takes a unique stable value, keywords and onSelect. Command.Dialog is a Radix dialog and should not be mixed with MUI. In Chromium: Ctrl/Cmd+K opens the MUI Dialog, the input is focused (autoFocus; at slotProps.transition.onEntered the active element is already the INPUT), typing 'ลูกค้า' shows 2 server-ordered results, ArrowDown+Enter selects the 2nd and closes, and Esc closes.

**Plan implication.** Use plan/research/snippets/r4/client/components/palette/CommandPalette.tsx: <Command shouldFilter={false} loop vimBindings={false}> inside <Dialog slotProps={{paper, transition:{onEntered}}}>; item value = `${kind}:${id}`; TanStack useQuery with abort signal plus useDeferredValue. vimBindings must be false because the default binds Ctrl+K, which conflicts with the global toggle on Windows/Linux. Show the quick commands (FR-1103) when the query is empty.

**Evidence.** node_modules/cmdk/dist/index.d.ts lines 19-150; pwh harness test 'cmdk inside MUI Dialog' passed; focus log {evt:'entered', active:'INPUT'}.

### 22. MUI 9 Dialog slot API (for the palette and dialogs) — _verified_

**Finding.** The MUI 9.4 DialogProps use slots/slotProps with keys transition, paper, container, backdrop and root. The PaperProps and TransitionProps props are gone (only PaperComponent and transitionDuration remain). slotProps.transition.onEntered fires. Modal still has disableAutoFocus, disableEnforceFocus and disableRestoreFocus.

**Plan implication.** All dialogs, including the single confirm dialog for permanent project deletion, should use slotProps. Legacy prop names from older docs won't typecheck.

**Evidence.** node_modules/@mui/material/Dialog/Dialog.d.ts lines 11-66; typecheck of CommandPalette.tsx; Playwright focus log.

### 23. sonner 2.0.8 — _verified_

**Finding.** API: toast(message, {duration, action:{label,onClick,actionButtonStyle}, cancel, onDismiss, onAutoClose, id, ...}); toast.success/info/warning/error/loading/custom/dismiss; toast.promise(promise, {loading, success, error, description, finally}) returns an id with .unwrap(). Toaster props include position (default 'bottom-right'), theme light/dark/system, richColors, expand, duration (default TOAST_LIFETIME 4000), visibleToasts, closeButton, toastOptions{style, className, classNames, actionButtonStyle, cancelButtonStyle, unstyled, duration}, offset, mobileOffset, hotkey (default Alt+T), icons, containerAriaLabel and dir. Timers pause while the document is hidden and on hover. The CSS is injected through document.createElement('style') with no nonce. Playwright check: with duration 8000 the toast is still visible after clock.runFor(7000) and hidden after another 1500 ms.

**Plan implication.** Mount one ToasterHost (plan/research/snippets/r4/client/components/ToasterHost.tsx) inside the MUI theme provider in app/(app)/layout.tsx, themed from MUI palette and typography with bottom-center placement. toastUndo(message, undo) uses duration 8000 and the same undo() the Cmd+Z stack calls. The CSP must allow inline styles (sonner, and Emotion unless it is given a nonce).

**Evidence.** node_modules/sonner/dist/index.d.ts; index.mjs lines 2-9 (__insertCSS), 470 (TOAST_LIFETIME), 980 (hotkey); pwh clock test.

### 24. fractional-indexing 4.0.0 API and edge cases — _verified_

**Finding.** API: generateKeyBetween(a, b, digits?, intDigits?), generateNKeysBetween(a, b, n, digits?, intDigits?), BASE_62_DIGITS '0-9A-Za-z', BASE_52_DIGITS. v4 accepts both bounds in either order. Passing digits explicitly (even BASE_62) produces self-headed keys ('V0' instead of 'a0'). Executed results: (null,null)→'a0'; (a0,null)→'a1'; (null,a0)→'Zz'; (a0,a1)→'a0V'; (a1,a0)→'a0V'; (a0,a0) throws; 'a00' throws 'invalid order key'; 'abc!' is NOT rejected (returns 'ac'); '' throws a TypeError. 1000 inserts into the same gap → a 169-character key; 100k appends → 'cOzu'. The README warns that localeCompare gives an incorrect ordering.

**Plan implication.** Never pass digits. Generate keys only on the server from the real neighbours inside the transaction. Validate any client-supplied key with /^[A-Za-z][0-9A-Za-z]{1,200}$/ plus a generateKeyBetween(key, null) sanity call. Sort on the client with a<b?-1:a>b?1:0, never localeCompare or Intl.Collator.

**Evidence.** node_modules/fractional-indexing/src/index.d.ts and README.md; r4-client-test/fi-edge.mjs output.

### 25. Fractional keys vs PostgreSQL 17 collation — _verified_

**Finding.** The postgres:17 image uses datcollate en_US.utf8 (libc). Loading 146 generated keys: ORDER BY k with the default collation DIFFERS from JavaScript order (pg starts 'a0 a000001...' while js starts 'ZM ZN...'). ORDER BY k COLLATE "C" and a column declared COLLATE "C" both MATCH. Under en_US 'a' < 'B' is true; under C it is false. The keys use the charset 0-9A-Za-z.

**Plan implication.** Declare every fractional-index column (positions.position, pages.position, tasks.position, ...) as 'text COLLATE "C" NOT NULL' so plain ORDER BY and the btree indexes use byte order. Add ORDER BY position, id as a tie-break. Add a migration test that asserts attcollation is C on all position columns.

**Evidence.** docker postgres:17.11: pg-default.txt 'DIFFERS', pg-c.txt/pg-col-c.txt 'MATCHES'; select 'a' < 'B' → t (en_US) / f (C).

### 26. Drizzle: COLLATE "C" column — _verified_

**Finding.** drizzle-orm 0.45.3 pg-core has no column .collate() (grep of the d.ts found nothing). A customType works: export const orderKey = customType<{ data: string }>({ dataType() { return 'text COLLATE "C"' } }), used as position: orderKey('position').notNull(). drizzle-kit 0.31.11 generates '"position" text COLLATE "C" NOT NULL', and a second generate reports 'No schema changes, nothing to migrate'.

**Plan implication.** Put orderKey in src/server/db/schema.ts (plan/research/snippets/r4/db/order-key.schema.ts). Do not hand-edit generated migrations (CLAUDE.md).

**Evidence.** r4-client-test/drz/schema.ts, drz/out/0000_lush_gravity.sql, meta snapshot type 'text COLLATE "C"'.

### 27. file-type 22.1.1 detection — _verified_

**Finding.** The package is ESM-only ('type':'module', exports {types, default}), engines node >=22. API: fileTypeFromBuffer(Uint8Array|ArrayBuffer), fileTypeFromBlob(Blob), fileTypeFromFile, fileTypeFromStream, fileTypeStream, FileTypeParser, supportedExtensions/MimeTypes; reasonableDetectionSizeInBytes = 4100. Detection results: png/jpg/gif/webp → image types; pdf; zip; docx/xlsx/pptx correct (including a real 106 KB workbook, even from the first 4100 bytes); doc/xls/ppt ALL → {ext:'cfb', mime:'application/x-cfb'}; csv/txt/html → undefined; svg starting '<svg' → undefined; svg starting '<?xml' → {ext:'xml'}. It works in a Next 16.3.7 route handler (Turbopack build, next start and standalone) with no serverExternalPackages. The README says it is not for text formats and advises enforcing a size limit for untrusted files.

**Plan implication.** POST /api/files: read request.formData(), take the File, call fileTypeFromBuffer on the FULL buffer (≤ 25 MB), then run the classifier. Never trust the client Content-Type (verified: the client sent application/octet-stream and detection still worked).

**Evidence.** r4-client-test/ft-test.mjs output; nx/app/api/files/route.ts curl results; node_modules/file-type/source/index.js lines 1466-1471 (cfb) and readme.

### 28. Upload classifier for SPEC 7.6 — _verified_

**Finding.** plan/research/snippets/r4/server/classify-upload.ts, tested on all fixtures: images go to kind 'image' (≤ 10 MB); pdf/zip/docx/xlsx/pptx to 'attachment' (≤ 25 MB); a zip claimed as docx/xlsx/pptx is accepted as the claimed OOXML type; cfb is accepted only if the claimed extension is doc/xls/ppt (an msi is rejected); xml or undetected content with a .svg extension becomes an svg attachment (UTF-8 containing '<svg'), NEVER an image; csv/txt are accepted if the first 64 KB contain no NUL byte (any encoding, because Thai Excel CSV is Windows-874). Attack cases: png renamed .csv/.svg → treated as image png; an 11 MB png → TOO_LARGE; html renamed .txt → text/plain attachment. Node full-ICU decodes 'windows-874' (the 'tis-620' label resolves to it).

**Plan implication.** Serve every file with X-Content-Type-Options: nosniff. Attachments (including svg/csv/txt) get Content-Disposition: attachment; filename*=UTF-8''... and CSP default-src 'none'; sandbox. Images get inline and Cache-Control: private, max-age=3600. The M5 holiday CSV import decodes UTF-8 (strip BOM) and falls back to TextDecoder('windows-874').

**Evidence.** node classify-upload.test.ts output (all cases quoted); node -e TextDecoder('windows-874') decoded 'วันหยุด'; process.versions.icu 78.3 full-icu.

### 29. Zod 4.6.5 API — _verified_

**Finding.** Executed: z.config(z.locales.th()) gives Thai default messages. Custom messages use {error:'...'} in place of message. z.uuid() is RFC-strict (the nil UUID passes; '11111111-1111-1111-1111-111111111111' is rejected; z.guid() is lenient). z.iso.date() rejects '2026-02-30' and '2026-9-30'. z.int(), z.email(), z.stringbool() and z.coerce.number().int() exist. .refine(fn, {error, path}) works. z.flattenError(err) returns {formErrors, fieldErrors}; z.treeifyError returns {errors, properties}; z.prettifyError exists. Standard Schema is exposed as ~standard (vendor 'zod', version 1). z.discriminatedUnion and z.toJSONSchema exist. z.string().uuid() and .email() still exist but are @deprecated (flagged by no-deprecated). No golden fixture contains UUIDs, so seeds generate v4 UUIDs.

**Plan implication.** Use z.uuid() for ids and z.iso.date() for ISODate inputs. Test fixtures must use real v4 UUIDs (crypto.randomUUID). The SPEC 7.3 sample 'z.string().uuid()' must become z.uuid(). Validation messages come from th.ts (lint).

**Evidence.** r4-client-test/zod-test.mjs output; ESLint no-deprecated message '`uuid` is deprecated. Use `z.uuid()` instead.'; python scan of golden-fixtures.json → 0 uuid-like strings.

### 30. Forms: shared schemas without react-hook-form — _likely_

**Finding.** @hookform/resolvers 5.9.1 does support Zod 4: zod.d.ts has Zod4Type overloads, and its peers are zod ^3.25||^4 and react-hook-form ^7.55. But the app's forms are simple (login, password, employee, position, client, project, members, leave, holiday import, milestone).

**Plan implication.** Recommend: src/lib/z.ts runs z.config(z.locales.th()) and re-exports z; schemas live in src/lib/schemas/* (no server imports). The client uses controlled MUI inputs and on submit calls schema.safeParse(values), mapping z.flattenError(e).fieldErrors to helperText, then calls the server action with the plain object. The server action() wrapper re-parses the same schema and returns {ok:false, code:'VALIDATION', fieldErrors}. Add RHF + zodResolver only when a complex form justifies it (record in Decisions first).

**Evidence.** node_modules/@hookform/resolvers/zod/dist/zod.d.ts; npm view @hookform/resolvers@5.9.1 peerDependencies.

### 31. Vitest 5.0.2 config model — _verified_

**Finding.** pool defaults to 'forks'; maxWorkers, isolate (default true), fileParallelism, execArgv and vmMemoryLimit are top-level, and poolOptions no longer exists. projects: TestProjectConfiguration[]. Inline project 'extends' is documented '@default true', and a run without it still inherited the root plugins and aliases. sharedViteServer defaults to true. globalSetup's default export receives a TestProject with project.provide(key, value); tests read values with inject(key) and type them via declare module 'vitest' { interface ProvidedContext {...} }. Engines node ^22.12||^24||>=26. vite is a required peer (^6.4||^7||^8). @vitejs/plugin-react 6.1.1 needs vite ^8. Vite 8.3 has resolve.tsconfigPaths: true built in.

**Plan implication.** Use plan/research/snippets/r4/vitest/vitest.config.ts: root resolve {tsconfigPaths:true, alias:{'server-only': './tests/stubs/empty.ts'}}; test {restoreMocks, unstubEnvs, coverage:{provider:'v8', include:['src/domain/**/*.ts'], exclude tests, thresholds:{'src/domain/**':{lines:95, functions:95, branches:95, statements:95}}}}; projects domain (node), ui (jsdom + setup ui.ts), integration (node + globalSetup db-global.ts + setupFiles db-worker.ts, hookTimeout 60s). Add vite ^8.3.1 as an explicit devDependency.

**Evidence.** node_modules/vitest/dist/chunks/plugin.d.My_z-jmU.d.ts lines 3580-3660, 4486-4503; npm view vitest@5.0.2 peerDependenciesMeta; test runs in r4-client-test/vt.

### 32. Vitest: per-worker Postgres database from a TEMPLATE — _verified_

**Finding.** Workers get process.env.VITEST_POOL_ID (source: 'Value is between 1-maxWorkers', allocated and freed per runner, so it is unique among concurrent runners) plus VITEST_WORKER_ID. Executed with --maxWorkers=4 against postgres:17. globalSetup drops/creates app_template, runs the migration, closes every template connection, and provides adminUrl/templateDb. setupFiles (top-level await, runs before each test file) does DROP DATABASE IF EXISTS app_test_w${VITEST_POOL_ID} WITH (FORCE) and then CREATE DATABASE ... TEMPLATE app_template, and sets process.env.DATABASE_URL before the test imports server code. Three files ran concurrently, each saw exactly one seed row and wrote its own. current_database() = app_test_w<POOL_ID>. Teardown dropped every test DB. All 15 tests across the 3 projects passed in 1.2 s.

**Plan implication.** The authz table-driven suite and golden tests run in the integration project. In the real app, globalSetup uses drizzle migrate(drizzle(client), {migrationsFolder:'drizzle'}) plus the trigger SQL and seedGolden into the template. Consider STRATEGY FILE_COPY for large templates. 'pnpm check' should include integration with the DB up, because authz tests are part of the DoD.

**Evidence.** vitest/dist/chunks/init.*.js lines 266-267 and index.*.js line 10695; plan/research/snippets/r4/vitest/tests/setup/db-global.ts and db-worker.ts; verbose run output; post-run pg_database query empty.

### 33. Vitest coverage thresholds scoped to src/domain — _verified_

**Finding.** coverage.include globs also count files NOT imported by any test (there is no coverage.all option anymore). thresholds accepts glob keys: {'src/domain/**': {lines, functions, branches, statements}} (perFile can be set per glob). The domain project gave 100% coverage. After adding an un-imported src/domain/uncovered.ts the run printed 'ERROR: Coverage for lines (83.33%) does not meet "src/domain/**" threshold (95%)' and exited 1, and exited 0 once the file was removed.

**Plan implication.** 'pnpm check' runs vitest with --coverage (domain threshold ≥ 95% per SPEC 11.1). New domain modules without tests will fail CI immediately.

**Evidence.** plugin.d.My_z-jmU.d.ts lines 1794-1873, 1971-1996; vt coverage runs with exit codes 1 and 0.

### 34. Testing server actions: mocking Next APIs — _verified_

**Finding.** The pattern that ran: const cache = vi.hoisted(() => ({ updateTag: vi.fn(), revalidateTag: vi.fn(), revalidatePath: vi.fn(), refresh: vi.fn() })); vi.mock('next/cache', () => cache); vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: name => ... })), headers: vi.fn(async () => new Headers()) })). Then import the action and assert cache.updateTag was called with 'project:<id>'. The REAL next/cache throws outside Next: 'updateTag can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead.' server-only's exports map react-server to empty.js and default to a module that throws, so tests need the alias.

**Plan implication.** Server-action and route-handler tests always mock next/cache and next/headers (cookies() and headers() are async). The authz suite should mock the app's session helper module rather than Better Auth internals. Keep the 'server-only' alias in vitest.config.

**Evidence.** plan/research/snippets/r4/vitest/tests/integration/rename-task.test.ts and src/server/actions/rename-task.ts; next-cache-unmocked test output; npm view server-only exports.

### 35. Next 16.3.7 cache API changes relevant to SPEC 7.3 — _verified_

**Finding.** next/cache exports revalidatePath(path, type?), revalidateTag(tag: string, profile: string | CacheLifeConfig) where the profile is now REQUIRED, updateTag(tag) (server actions only, read-your-own-writes), refresh(), unstable_cache, unstable_noStore, cacheTag, cacheLife and io. next/headers exports cookies, headers and draftMode.

**Plan implication.** The SPEC 7.3 sample 'revalidateTag(`project:${id}`)' will not typecheck. Use updateTag(`project:${id}`) inside server actions (or revalidateTag(tag, 'max') elsewhere), or revalidatePath. Record this as a Deviation note for the SPEC sample.

**Evidence.** node_modules/next/cache.d.ts; node_modules/next/dist/server/web/spec-extension/revalidate.d.ts lines 13-32.

### 36. Vitest time control — _verified_

**Finding.** vi.setSystemTime(time): with fake timers it moves the clock without firing timers; without fake timers it mocks only Date / new Date(). vi.getMockedSystemTime() and vi.useRealTimers() exist. Executed: vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-29T23:30:00Z')) → todayBangkok() === '2026-09-30'. user-event provides userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) for debounce tests.

**Plan implication.** The dates.ts unit tests from SPEC 11.1 ('todayBangkok at 23:30 UTC') use this pattern (plan/research/snippets/r4/vitest/src/domain/dates.test.ts). Test the 400 ms grid debounce and 800 ms autosave with fake timers plus advanceTimers.

**Evidence.** node_modules/vitest/dist/index.d.ts lines 480-498; vt domain test output; @testing-library/user-event/dist/types/options.d.ts line 114.

### 37. fast-check 4.10.2 and the Vitest adapter — _verified_

**Finding.** fc.assert, property, asyncProperty, integer, nat, array, uniqueArray, tuple, record, constantFrom, oneof, boolean, string, stringMatching, date, float, double, pre, sample, statistics, check, commands, scheduler, gen and letrec are all present. A 200-sample fc.date() had no Invalid Date. @fast-check/vitest 0.5.0: import { test, fc } from '@fast-check/vitest'; test.prop([arbs] | {name: arb}, params?)(name, prop). The seed is printed on each run (e.g. seed=-1508956708).

**Plan implication.** Allocation invariants (BR-20..25, distribute) are property-tested with integer centi-days (fc.integer({min:0, max:700})) and ISO dates built via addDays(base, fc.integer(...)), never floats or JS Dates. Reproduce failures with {seed, numRuns}.

**Evidence.** node API probe output; vt run 'is a Monday within the previous 6 days (with seed=...)'; @fast-check/vitest lib/vitest-fast-check.d.ts line 19.

### 38. Playwright 1.63 clock — _verified_

**Finding.** page.clock.install({time}) fakes Date, setTimeout/setInterval (and their clear functions), requestAnimationFrame, requestIdleCallback and performance. setFixedTime(t) makes 'Date.now and new Date() return fixed fake time at all times' while keeping timers running. Also available: setSystemTime, fastForward, runFor, pauseAt and resume. Executed: setFixedTime('2026-09-30T10:00:00+07:00') gives #today = 2026-09-30 and Intl th-TH shows '30 ก.ย. 2569' (with locale th-TH and timezoneId Asia/Bangkok); Date stayed fixed while a setInterval kept firing. install({time:'2026-09-29T23:30:00Z'}) gives 2026-09-30 in Bangkok, and runFor drove the sonner 8-second toast.

**Plan implication.** A shared e2e fixture pins the browser to 2026-09-30 with setFixedTime before page.goto. Use install()+runFor() only for timer-driven assertions (toast expiry, debounce).

**Evidence.** node_modules/playwright-core/types/types.d.ts lines 20452-20580; pwh clock tests passed.

### 39. Server-side 'today' for e2e — _likely_

**Finding.** page.clock only affects the browser. The Next server's todayBangkok() (used by BR-70 DUE_SOON, home cards, the current week and so on) still follows the real clock, so e2e expectations tied to 2026-09-30 will drift after today.

**Plan implication.** Add src/server/clock.ts exporting businessNow(): Date = process.env.APP_NOW ? new Date(process.env.APP_NOW) : new Date(). Use it ONLY for business-date logic (never auth/session). The domain stays pure via todayBangkok(now). Set APP_NOW='2026-09-30T10:00:00+07:00' in playwright webServer.env and document that it must never be set in production.

**Evidence.** Playwright docs: clock emulation targets the page; the server process is untouched (design inference).

### 40. Playwright auth via storageState — _verified_

**Finding.** A 'setup' project (testMatch /.*\.setup\.ts/) saved storageState; the 'chromium' project with dependencies:['setup'] and use.storageState 'e2e/.auth/manager.json' got both the cookie and the localStorage values.

**Plan implication.** In the real app, auth.setup.ts logs in once per role (manager, lead, worker) through the login form or Better Auth's sign-in endpoint and saves e2e/.auth/<role>.json. Specs pick a role with test.use({storageState}). Add e2e/.auth to .gitignore and the ESLint ignores.

**Evidence.** plan/research/snippets/r4/playwright/playwright.config.ts and e2e/auth.setup.ts; test 'storageState from setup project is applied' passed.

### 41. Playwright clipboard and paste — _verified_

**Finding.** Chromium with permissions ['clipboard-read','clipboard-write'] in the project config: navigator.clipboard.writeText of tab-separated values followed by page.keyboard.press('ControlOrMeta+V') pastes into a textarea. navigator.clipboard.write([new ClipboardItem({'image/png': canvasBlob})]) followed by ControlOrMeta+V on a contenteditable produced a TRUSTED paste event with files [{name:'image.png', type:'image/png', size:100}]. A synthetic paste also works: new DataTransfer(), items.add(new File([blob], 'screenshot.png', {type:'image/png'})), setData('text/html', '<table>...'), then element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})). This event is untrusted, and React's onPaste received the files, HTML and text.

**Plan implication.** AC-503 (screenshot paste) should use the real ClipboardItem + keyboard route. AC-502/AC-803 (Excel HTML/TSV) can use the synthetic DataTransfer route for exact payloads, and ProseMirror/BlockNote paste handlers receive it. Keep e2e to Chromium only.

**Evidence.** pwh/e2e/harness.spec.ts clipboard tests; logs '[real paste] {trusted:true, files:[image/png]}' and '[synthetic paste] {trusted:false, ...}'.

### 42. Playwright webServer — _verified_

**Finding.** webServer fields in 1.63: command, cwd, env, gracefulShutdown, ignoreHTTPSErrors, name, port, reuseExistingServer, stderr, stdout, timeout (default 60000), url and wait. The health-check URL must match the bind address: 'vite preview' bound only localhost→::1, so http://127.0.0.1:4179 timed out after 120 s until '--host 127.0.0.1' was added. next start listens on all interfaces.

**Plan implication.** Real app: webServer {command:'pnpm build && pnpm start -p 3100' (or the standalone script), url:'http://127.0.0.1:3100/login', timeout 300_000, reuseExistingServer: !process.env.CI, env:{DATABASE_URL: e2e DB, APP_NOW, BETTER_AUTH_URL, BETTER_AUTH_SECRET, UPLOAD_DIR: './.e2e-uploads', NEXT_TELEMETRY_DISABLED: '1'}}. Also set workers:1, fullyParallel:false, locale th-TH and timezoneId Asia/Bangkok. Use a production build for e2e and let developers reuse 'pnpm dev' locally.

**Evidence.** node_modules/playwright/types/test.d.ts lines 10979-11120; the first harness run failed with 'Timed out waiting 120000ms from config.webServer'; curl 127.0.0.1 → 000, localhost → 200.

### 43. Next output:'standalone' and serving static assets — _verified_

**Finding.** With output:'standalone', 'next start' prints '⚠ "next start" does not work with "output: standalone" configuration. Use "node .next/standalone/server.js" instead.' but it still serves pages and /_next/static (200). The standalone server.js returns 404 for /_next/static until .next/static (and public/) is copied next to server.js BEFORE start: copying while it ran stayed 404, and a restart gave 200. HOSTNAME and PORT env vars work. Because the scratch app was nested under a folder with a lockfile, server.js ended up at .next/standalone/nx/server.js (tracing root inference).

**Plan implication.** The Dockerfile (M11) and any e2e standalone script must copy .next/static and public into the standalone directory. Set outputFileTracingRoot (or turbopack.root) explicitly if a parent directory contains a lockfile.

**Evidence.** r4-client-test/nx start logs and curl status codes (200 / 404 / 404 / 200).

### 44. Playwright: reseeding the DB per spec with workers:1 — _likely_

**Finding.** Not executed against the real app (no app exists yet). Reseeding must not invalidate the saved storageState sessions.

**Plan implication.** Add a 'db' setup project (migrate + seed:golden into the e2e DB) that the 'setup' (login) project depends on. Each spec runs test.beforeAll(() => resetDomainData(fixture?)): truncate only domain tables (projects, members, tasks, assignments, allocations, milestones, pages, files, leave, holidays, audit), re-run the domain part of the golden seed imported directly from scripts/, and KEEP the Better Auth tables (user, session, account, verification). M1 specs that mutate users create and clean up their own users.

**Evidence.** Design derived from SPEC 11.4 and the verified storageState behaviour.

### 45. Testing Library + React 19 — _verified_

**Finding.** RTL 16.3.3 (peer react ^18||^19, @testing-library/dom ^10), dom 10.4.2, user-event 14.6.7 and jest-dom 7.0.1 ('import "@testing-library/jest-dom/vitest"', node >=22) pass with React 19.3 + MUI 9.4 Button + user-event click + toBeDisabled/toBeEnabled, with no act() warnings. With test.globals false, RTL's auto-cleanup is not registered, so the setup file must call afterEach(cleanup); a second test asserted only one button was mounted.

**Plan implication.** Use plan/research/snippets/r4/vitest/tests/setup/ui.ts. Wrap components that use TanStack Query in a per-test QueryClient with queries.retry false.

**Evidence.** vt ui project: 'UndoToastButton (React 19 + MUI 9 + jsdom)' 2 tests passed; npm view peer data.

### 46. jsdom vs happy-dom — _verified_

**Finding.** The same UI tests (MUI, user-event and the virtualized list with offset stubs) pass in jsdom 30.1.1 and happy-dom 20.14.5. jsdom 30 requires node ^22.22.2 || ^24.15.0 || >=26.0.0; Node 22 LTS is currently 22.23.3.

**Plan implication.** Use jsdom (closer browser semantics for focus, DataTransfer and MUI). Keep happy-dom as a speed fallback. CI and dev must run Node ≥ 22.22.2; add engines.

**Evidence.** vitest --project ui and --environment happy-dom runs; npm view jsdom@30.1.1 engines; nodejs.org/dist/index.json.

### 47. ESLint version decision — _verified_

**Finding.** ESLint 10.0.0 was released 2026-02-06, and v9 reached EOL on 2026-08-06 per eslint.org/version-support. create-next-app 16.3.7 still writes eslint '^9'. eslint-config-next 16.3.7 bundles eslint-plugin-react 7.37.5 (peer eslint up to ^9.7), eslint-plugin-import 2.32.0 (up to ^9) and jsx-a11y 6.10.2 (up to ^9). On ESLint 10.11.0 without a pin: 'TypeError: Error while loading rule react/display-name: contextOrFilename.getFilename is not a function' (eslint-plugin-react/lib/util/version.js:31, React version detection). With { settings: { react: { version: '19.3' } } } everything works. The Next preset enables 17 react rules (none of the ones that still call removed APIs), 1 import rule, 6 jsx-a11y, 16 react-hooks and 22 @next/next rules. A stress file triggering all of them linted without crashing.

**Plan implication.** Use ESLint ^10.11.0 plus the react version pin, updated whenever React's minor version changes. pnpm will warn about 3 peer ranges (non-fatal; can be silenced with peerDependencyRules.allowedVersions). Fallback: ESLint 9.39.5 runs the same config file with identical results.

**Evidence.** Crash output quoted; https://eslint.org/version-support/; eslint --print-config rule counts; r4-client-test/lint-sample stress run; create-next-app/dist/index.js 'eslint:"^9"'.

### 48. ESLint final config (validated) — _verified_

**Finding.** File: plan/research/snippets/r4/lint/eslint.config.mjs (defineConfig/globalIgnores from 'eslint/config'). It layers: ...nextVitals, ...nextTs; the react version pin; recommendedTypeChecked for **/*.{ts,tsx,mts,cts} with parserOptions {projectService: true, tsconfigRootDir: import.meta.dirname}; no-explicit-any error; ban-ts-comment {'ts-expect-error': 'allow-with-description', 'ts-ignore': true, 'ts-nocheck': true, minimumDescriptionLength: 10}; no-unused-vars with ^_ ignore patterns; no-misused-promises {checksVoidReturn:{attributes:false}}; @typescript-eslint/no-deprecated error; for test files unbound-method, no-non-null-assertion and require-await are off; comments.recommended plus require-description {ignore:['eslint-enable']} and no-unused-disable; linterOptions reportUnusedDisableDirectives and reportUnusedInlineConfigs 'error'; react-hooks/incompatible-library off; the Thai ban; the domain Date ban; domain no-restricted-imports; then eslint-config-prettier/flat last. Global ignores: .next, out, build, next-env.d.ts, drizzle, coverage, playwright-report, test-results, e2e/.auth, uploads, backups. On the validation repo (lint fixtures plus the real Vitest/Playwright/grid samples), ESLint 10.11.0 and 9.39.5 both produced the SAME 32 findings, all intended, with 0 false positives, in about 5.3 s for ~30 files.

**Plan implication.** M0 copies this file verbatim. Scripts: 'lint': 'eslint . --max-warnings 0' (the Next preset emits warnings such as @next/next/no-img-element and jsx-a11y).

**Evidence.** r4-client-test/lint-final eslint JSON summary; r4-client-test/lint9/final identical totals; tc/src 0 findings.

### 49. ESLint: Thai-text rule semantics — _verified_

**Finding.** THAI = '[\\u0E00-\\u0E7F]' (a literal backslash-u in the JS source string). Selectors: Literal[value=/THAI/] catches quoted strings, JSX attribute strings, TS literal types and quoted object keys. TemplateElement[value.raw=/THAI/] catches template text. JSXText[value=/THAI/] catches JSX children. Comments and regex literals such as /[ก-๙]+/u are NOT flagged, because esquery only tests string values. The rule applies to **/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts} with ignores ['src/i18n/**','scripts/**','tests/**','e2e/**','**/*.test.*','**/*.spec.*']. A later config object's no-restricted-syntax REPLACES earlier options for matching files, so the domain block repeats NO_THAI. The config file's own messages must be English; a Thai-message variant flagged itself.

**Plan implication.** Thai UI text lives in src/i18n/** only, including Appendix B templates (e.g. src/i18n/templates.ts), Zod messages, action error messages, audit summaries and toast texts.

**Evidence.** lint-final findings for Edge.tsx and Hello.tsx (listed in the validation fact); the lint9 Thai-message run flagged eslint.config.mjs itself.

### 50. ESLint: domain purity and the Date ban — _verified_

**Finding.** In src/domain/** (except dates.ts, tests and Thai-allowed paths), no-restricted-syntax bans NewExpression[callee.name='Date'], NewExpression[callee.property.name='Date'] (new globalThis.Date), CallExpression[callee.name='Date'] and MemberExpression[object.name='Date'][property.name=/^(now|parse|UTC)$/]. no-restricted-imports bans the paths react, react-dom, next, drizzle-orm and postgres, and patterns (regex) for react/react-dom/next/drizzle subpaths, @/(server|app|components|hooks), relative ../server|app|components|hooks, and node IO modules. Verified detections: all 6 bad imports in capacity.ts, plus new Date(), Date.now(), Date.parse(), Date() and new globalThis.Date(). dates.ts (which uses Date for todayBangkok) and capacity.test.ts are allowed.

**Plan implication.** Only src/domain/dates.ts may touch Date. Server code obtains 'now' from a server clock and passes it into domain functions.

**Evidence.** lint-final findings for src/domain/capacity.ts and more-dates.ts.

### 51. ESLint: hygiene rules verified — _verified_

**Finding.** Findings on src/server/bad.ts: no-explicit-any; ban-ts-comment ('Use "@ts-expect-error" instead of "@ts-ignore"'); no-unsafe-assignment and no-unsafe-member-access; require-description ('Unexpected undescribed directive comment'); 'Unused eslint-disable directive' twice. A described '// @ts-expect-error -- intentional: ...' is accepted. Deprecated APIs flagged: z.string().uuid(), isServer and prefetchQuery. In real code react-hooks/set-state-in-effect (an ERROR in the Next preset) flagged a synchronous setState inside an effect. recommendedTypeChecked includes no-floating-promises, no-misused-promises, unbound-method, no-unsafe-*, require-await, restrict-template-expressions, only-throw-error and await-thenable, but NOT no-deprecated (that rule is only in strictTypeChecked).

**Plan implication.** The DoD item 'no any / @ts-ignore / eslint-disable without reason' is machine-enforced. Grid and editor code should derive state instead of syncing it in effects. Justified exceptions use '// eslint-disable-next-line rule -- reason'.

**Evidence.** lint-final JSON output; typescript-eslint config inspection (recommendedTypeChecked has 43 ts rules, no-deprecated absent).

### 52. ESLint consequences for SPEC code samples — _verified_

**Finding.** SPEC 7.3's server action writes summary: `ลบงาน ${task.name}`, a Thai template literal in src/server that the rule flags. SPEC 7.4's GridRow type has label: 'งานในโปรเจคอื่น', a Thai TS literal type that is also flagged.

**Plan implication.** Implement these as th.audit.taskDeleted(name) (a function in th.ts) and label: string with its value from th.grid.maskedOtherProject. Note this in the plan so implementers don't fight the linter.

**Evidence.** Rule behaviour verified on template literals and TS literal types (Hello.tsx line 4, Edge.tsx line 3).

### 53. ESLint 10 / Next 16 miscellany — _verified_

**Finding.** '-f unix' fails with 'The unix formatter is no longer part of core ESLint' (use stylish or json). 'next --help' in 16.3.7 lists build, dev, start, info, typegen and experimental commands; 'next lint' no longer exists.

**Plan implication.** Scripts call 'eslint .' directly. CI parsers should use '-f json' if needed.

**Evidence.** ESLint 10.11 output; next --help output.

### 54. Prettier 3.9.9 — _verified_

**Finding.** prettier --check/--write work. A prettier.config.ts (import type { Config }) loads under Node 26 through type stripping. Available options include objectWrap 'preserve'|'collapse', experimentalOperatorPosition and experimentalTernaries.

**Plan implication.** Use prettier.config.mjs for Node 22 portability, matching the SPEC's code style: { semi: false, singleQuote: true, trailingComma: 'all', printWidth: 110, objectWrap: 'preserve' }. .prettierignore: node_modules .next coverage playwright-report test-results drizzle pnpm-lock.yaml docs. ESLint uses eslint-config-prettier/flat; don't run Prettier as a lint rule.

**Evidence.** r4-client-test/lint-final prettier runs; node_modules/prettier/index.d.ts lines 348-447.

### 55. Suggested package.json scripts — _likely_

**Finding.** Scripts assembled from the verified pieces: typecheck = 'next typegen && tsc --noEmit'; lint = 'eslint . --max-warnings 0'; test = 'vitest run'; test:unit = 'vitest run --project domain --project ui'; test:int = 'vitest run --project integration'; test:cov = 'vitest run --project domain --coverage'; test:e2e = 'playwright test'; check = 'pnpm typecheck && pnpm lint && vitest run --coverage' (integration needs 'pnpm db:up').

**Plan implication.** M0 defines these. Decide whether 'check' requires the DB (recommended yes, because the authz tests are part of every milestone's DoD).

**Evidence.** Composition of the verified commands (vitest --project, --coverage exit codes, next typegen).

## Risks

- TypeScript 7 drift: npm's 'latest' tag is 7.0.2, which breaks typescript-eslint (peer <6.1.0). Every install must pin typescript ~6.0.3.
- ESLint 10 works with eslint-config-next 16.3.7 only when settings.react.version is pinned. Other code paths in eslint-plugin-react/import/jsx-a11y still reference APIs removed in ESLint 10, and pnpm warns about peers. Fallback: ESLint 9.39.5 (EOL since 2026-08-06) with the identical config.
- Vitest 5 is only 4 weeks old (5.0.0 on 2026-09-03). Everything needed was verified on 5.0.2. Fallback 4.1.11 would need 'extends: true' and a re-check of the pool options.
- Node versions: the dev machine runs 26.5, production uses node:22. jsdom 30 requires Node ≥22.22.2, and file-type 22 / jest-dom 7 require ≥22. CI must run Node 22.22+ (22.23.3 is current), and engines should be set.
- Playwright's page.clock does not change the server's 'today'. Without an APP_NOW-style business clock override, e2e expectations tied to 2026-09-30 (BR-70 DUE_SOON, home cards, current week) will drift.
- Next.js dispatches Server Actions one at a time per client, so a slow grid save or autosave blocks every other action in the tab. Keep reads and heartbeats on route handlers and keep actions fast.
- PostgreSQL's default en_US.utf8 collation mis-orders fractional-index keys. Any position column created without COLLATE "C" silently breaks ordering, so add a schema test.
- fractional-indexing 4.0.0 does not reject some malformed keys ('abc!' → 'ac'), and concurrent inserts can create equal keys. Generate keys on the server and add an id tie-break.
- file-type reports legacy .doc/.xls/.ppt only as 'cfb', and CSV/TXT/SVG have no magic bytes, so acceptance relies on narrow extension-based fallbacks. This is safe only if files are always served with nosniff + attachment + CSP sandbox.
- CSP: sonner (and Emotion by default) inject style tags without a nonce, so a strict style-src breaks toasts and MUI styling unless 'unsafe-inline' or nonce plumbing is added.
- @dnd-kit/core/sortable have been unmaintained since Dec 2024. They work with React 19.3 via unstable_batchedUpdates; if React removes it, a migration to 0.x @dnd-kit/react (a different API) is needed.
- The SPEC's code samples conflict with the verified tooling: revalidateTag() now requires 2 arguments in Next 16, z.string().uuid() is deprecated in Zod 4, and Thai literals in server code or types fail the lint rule. Implementers must adapt the samples (see facts).
- Virtualized grid components cannot be meaningfully tested in jsdom without offset stubs, so grid behaviour coverage depends on Playwright e2e (heavier and slower).
- Standalone output: .next/static and public must be copied before starting server.js (Docker/e2e), otherwise the client JS returns 404 and nothing hydrates.
- The markdown report could not be written because the harness blocks subagent report files. Downstream plan writers must use this structured output plus the files in r4-client-test/final-snippets.
