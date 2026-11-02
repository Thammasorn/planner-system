# R3 — BlockNote deep-dive for M4 (pages / Notion-like editor)

> Research date 2026-09-30 · target: SPEC §4.5 (FR-501..543, AC-501..505), §6.4, §7.6, §7.7, §12 M4
> Stack under test: **BlockNote 0.55.0** (released 2026-09-22) · @mantine/core+hooks **9.6.3** · React **19.3.0** ·
> Next.js **16.3.7** (Turbopack) · MUI **9.4.0** · Playwright **1.63.0** (Chromium 153) · Node 26.5 · npm 11.17 / pnpm 12.8.1
>
> Confidence tags: **[V]** verified (read in installed .d.ts/source, or executed in Chromium / Next build),
> **[L]** likely (strong evidence, not executed end-to-end), **[U]** uncertain.
>
> Everything below was executed in the scratch folder
> `r3-blocknote/`
> (a previous interrupted run of this task had started a harness there; it was re-verified, fixed and extended — every
> claim here was re-checked in this run). Evidence index is in §18.

---

## 0. TL;DR for the M4 plan

1. **Packages**: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` **0.55.0 pinned exactly** (all three the same
   version; 0.x minors ship breaking changes every 2–4 weeks) + peers `@mantine/core` & `@mantine/hooks` **9.6.3**
   (Mantine 9 needs React ≥19.2 — fine with Next 16/React 19.3). All MPL-2.0 / MIT. **Never install any `@blocknote/xl-*`**
   (GPL-3.0 OR commercial; `xl-ai-server` is AGPL-3.0). `@blocknote/server-util` is not needed. [V]
2. **Next.js**: editor module must be `"use client"` **and** loaded with `next/dynamic(..., { ssr: false })` **from a Client
   Component** (Next 16 refuses `ssr:false` in Server Components at build time; without `ssr:false` the prerender crashes
   with `ReferenceError: window is not defined` inside `useCreateBlockNote`). Verified with `next build` + `next start`,
   `next dev` (StrictMode), and **pnpm 12 + standalone server**. CSS: `import "@blocknote/mantine/style.css"` only
   (do **not** import `@blocknote/core/fonts/inter.css`); no remote fonts/CDN requests at runtime (network log empty). [V]
3. **Thai**: no `th` locale ships (23 locales: ar de en es fa fr he hr is it ja ko nl no pl pt ru sk uk uz vi zh zhTW) →
   put a **complete Thai `Dictionary`** in `src/i18n/th.ts` typed with `satisfies Dictionary` (type-only import). Build the
   runtime dictionary so every slash item keeps the **English title + English aliases as search aliases** → `/ตาราง` and
   `/table` both work (FR-520). Thai typing incl. combining vowels/tone marks and IME composition works. [V]
4. **Must-have customisations (each one is a verified bug/gap in stock BlockNote 0.55):**
   - custom **pasteHandler** — stock handler loses Excel tables whenever the TSV `text/plain` *looks like markdown*
     (`task_name_1`, emails with `_`, `1. …`, `- …`, `*…*`) and turns TSV-only pastes into one paragraph; it also
     **hot-links external images** (`<img src="https://…">`) from browser "Copy image". FR-524/§7.6. [V]
   - **ranked slash filter** — stock substring filter puts `ย่อหน้า` (paragraph) before `หน้า` (sub-page), so AC-504
     `/หน้า`+Enter inserts a paragraph. [V]
   - **word-start guards** for `/`, `:` and `@` — stock triggers fire mid-word: typing `ประชุม 10:30`+Enter becomes
     `ประชุม 10🕒 `; `แบ่ง 1/2`+Enter inserts a *Heading 2*. [V]
   - **`/ตาราง` → 3×3** custom item (stock inserts 2 rows × 3 cols; AC-501 wants 3×3). [V]
   - **custom `file` block** (same type name `"file"`) adding a `size` prop — stock file block has no size (FR-527). [V]
   - **upload-only FilePanel** (stock panel has an "Embed URL" tab = external images). [V]
   - **`uploadFile` must never reject** — BlockNote's drop path does `void handleFileInsertion(...)` without catch →
     unhandled promise rejection (Next dev overlay). [V]
   - **editor font override** — `--bn-font-family` only styles menus; content font is hard-coded Inter in
     `.bn-default-styles`. [V]
   - **dirty-check before autosave** — toggling `editable` fires `onChange` with an unchanged document. [V]
   - **error boundary + sanitisation of stored JSON** — one unknown block type in `initialContent` throws
     `Error creating document from blocks passed as initialContent` and unmounts the React tree; `[]` also throws. [V]
5. **Server side**: store `editor.document` JSON as-is (round-trips losslessly incl. ids, `columnWidths` with `null`,
   `headerRows/Cols`, cell colours) [V]; compute `content_text` with a **pure recursive walker** (implementation + 9 passing
   tests in §9) [V]; validate with zod + URL/href sanitisation (BlockNote does not validate props or hrefs of JSON
   `initialContent`: `javascript:` href is neutralised at render but **persisted**; heading level 7 accepted). [V]
6. Bundle: editor lazy chunk ≈ **979 KB raw / 288 KB gzip** + CSS ≈ **238 KB raw / 38 KB gzip** (Next 16 prod build);
   emoji data (≈ 81 KB gz) + emoji-mart (≈ 27 KB gz) load lazily only when the emoji picker opens. 300-block document
   loads+renders in ≈ 29 ms (NFR "300 blocks < 1 s" OK). [V]

---

## 1. Versions, peer deps, licenses

### 1.1 npm registry (queried 2026-09-30) [V]

| package | latest | license | peer deps / notes |
|---|---|---|---|
| `@blocknote/core` | 0.55.0 (2026-09-22) | **MPL-2.0** | optional peers only: `yjs`, `@y/y`, `y-protocols`, `@y/protocols`, `y-prosemirror`, `@y/prosemirror` (collab — not needed). deps: tiptap 3.31, prosemirror-*, emoji-mart 5.6, @emoji-mart/data |
| `@blocknote/react` | 0.55.0 | **MPL-2.0** | `react`/`react-dom` `^18 \|\| ^19 \|\| >=19.0.0-rc` |
| `@blocknote/mantine` | 0.55.0 | **MPL-2.0** | react/react-dom as above + **`@mantine/core` & `@mantine/hooks` `^8.3.11 \|\| ^9.0.2`** |
| `@mantine/core`, `@mantine/hooks` | 9.6.3 | MIT | **react/react-dom `^19.2.0`** |
| `@blocknote/shadcn` | 0.55.0 | MPL-2.0 | exists; peer `tailwindcss ^4.1.12`, uses `@base-ui/react` (0.53 switched radix→base-ui) — not for us (no Tailwind) |
| `@blocknote/ariakit` | 0.55.0 | MPL-2.0 | exists; alternative UI (see §1.3) |
| `@blocknote/server-util` | 0.55.0 | MPL-2.0 | pulls `jsdom ^29` + react-dom; **not needed** (content_text is a pure walker) |
| `@blocknote/code-block` | 0.55.0 | MPL-2.0 | Shiki syntax highlighting (heavy). Not needed for FR-521 |
| `@blocknote/math-block`, `@blocknote/diagram-block` | 0.55.0 | MPL-2.0 | not needed |
| `@blocknote/xl-ai`, `xl-multi-column`, `xl-docx-exporter`, `xl-pdf-exporter`, `xl-odt-exporter`, `xl-email-exporter`, `xl-typst-exporter`, `xl-typst-compiler` | 0.55.0 | **GPL-3.0 OR PROPRIETARY** | **DO NOT USE** |
| `@blocknote/xl-ai-server` | 0.31.0 | **AGPL-3.0 OR PROPRIETARY** | **DO NOT USE** |

LICENSE files checked inside node_modules: core/react/mantine/ariakit = "Mozilla Public License Version 2.0"; @mantine/*,
emoji-mart, @emoji-mart/data, @tiptap/core, prosemirror-tables, @floating-ui/react = MIT. `react-icons` (Remix icons) is
bundled inside `@blocknote/react/dist`. [V]
Official statement (blocknotejs.org/pricing): "The core library is licensed under the MPL 2.0 license … The XL packages
(like AI integration, multi-column layouts, and exporters) are dual-licensed … GPL-3.0, or—for closed-source projects—a
commercial license." [V]
MPL-2.0 is file-level copyleft that triggers on *distribution* of modified MPL files; we use the packages unmodified in a
self-hosted internal app → no obligation. **Rule for the plan: do not patch BlockNote files (no patch-package) and do not
copy BlockNote source files into `src/`.** [L]

Suggested ESLint/CI guard: fail if `package.json` contains `"@blocknote/xl-`. [L]

Release cadence (GitHub releases): 0.52.0 (2026-07-20, *major breaking*: Yjs decoupled into `@blocknote/core/yjs`,
"plain" block content introduced — code block content is now `"plain"`), 0.53.0 (shadcn radix→base-ui, breaking),
0.54.0 (math/diagram blocks), 0.55.0 (mobile formatting toolbar). → **pin exact versions**, upgrade deliberately with the
e2e suite. [V]

### 1.2 Install command (project uses pnpm)

```bash
pnpm add @blocknote/core@0.55.0 @blocknote/react@0.55.0 @blocknote/mantine@0.55.0 @mantine/core@9.6.3 @mantine/hooks@9.6.3
```
Verified with **pnpm 12.8.1** isolated `node_modules` + `next build` (Turbopack) + `node .next/standalone/server.js`:
the bare CSS `@import url("@mantine/core/styles/*.css")` inside `@blocknote/mantine/src/mantineStyles.css` resolves fine
under pnpm (peer is linked next to the package). [V]
pnpm note: app code must not import transitive packages (`prosemirror-state`, `@tiptap/pm`) — take types from BlockNote
instead, e.g. `NonNullable<SuggestionMenuOptions["shouldOpen"]>` from `@blocknote/core/extensions` (see §5). [V]

### 1.3 Mantine vs alternatives (owner chose Mantine — confirmed as the right call)

Minimal editor bundle, esbuild, minified [V]:

| UI package | JS raw | JS gzip | CSS raw | CSS gzip |
|---|---|---|---|---|
| `@blocknote/mantine` | 1,186,346 | 357,020 | 240,941 | 37,431 |
| `@blocknote/ariakit` | 1,158,844 | 354,583 | 54,304 | 9,276 |

JS difference is negligible; Mantine costs ~28 KB gzip more CSS. Mantine is BlockNote's default/most-tested UI (docs and
examples use it). Its CSS is **scoped to `.bn-mantine`** (BlockNote deliberately omits Mantine's global baseline:
"We need all the Mantine styles except the global styles") and `BlockNoteView` creates its own `MantineProvider` with
`withCssVariables={false}` → **no conflicts with MUI's CssBaseline** (verified visually/programmatically in the Next+MUI
probe). No MUI-native BlockNote UI exists. **Keep `@blocknote/mantine`.** [V]

---

## 2. Next.js App Router integration (verified recipe)

### 2.1 What happens without precautions [V]
- `useCreateBlockNote` = `useMemo(() => { const editor = BlockNoteEditor.create(options); if (window) { window.ProseMirror = … } return editor }, deps)`
  (`@blocknote/react/src/hooks/useCreateBlockNote.tsx`) → any server render throws.
- A `"use client"` component calling it, rendered without `ssr:false`: `next build` →
  `Error occurred prerendering page "/direct" … ReferenceError: window is not defined at useCreateBlockNote()`.
- `dynamic(() => import(...), { ssr: false })` inside a **Server Component**: Turbopack build error
  "`ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it into a Client Component."
- Importing the packages in Node (no DOM) is fine (no top-level `window` access) — only *calling* the hook breaks.

### 2.2 Working pattern (built with `next build`, served by `next start`, `next dev` and standalone) [V]

```tsx
// src/app/(app)/p/[pageId]/page.tsx  — Server Component: authz + load row, pass JSON down
export default async function Page({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;            // Next 15+/16: params is a Promise
  const page = await getPageForViewer(pageId); // authz → 404 if not visible
  return <PageView page={page} />;             // header, breadcrumb, lock banner … (SSR)
}

// src/components/editor/EditorClient.tsx
"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@mui/material";
const PageEditor = dynamic(() => import("./PageEditor"), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" height={240} />,
});
export function EditorClient(props: PageEditorProps) { return <PageEditor {...props} />; }

// src/components/editor/PageEditor.tsx
"use client";
import "./editor-theme.css";              // our bridge (specificity-proof, order independent — §10)
import "@blocknote/mantine/style.css";    // pulls @blocknote/react/style.css + scoped Mantine CSS
// DO NOT import "@blocknote/core/fonts/inter.css" (Latin-only Inter; we use the self-hosted Thai font)
```
Probe results (Next 16.3.7 + React 19.3 + MUI 9.4 AppRouterCacheProvider/ThemeProvider + BlockNote): SSR title rendered,
editor mounted ≈ 340 ms (prod) / ≈ 490 ms (dev) after load, **0 console errors/warnings, 0 external requests**, MUI
`useColorScheme().setMode('dark')` → BlockNote `theme` prop → container `data-color-scheme="dark"`, `editable` toggle
works, back/forward navigation remounts cleanly (1 editor). Same result from the **pnpm + `output:'standalone'`** build.

### 2.3 Required config/side notes [V]
- **Viewport**: BlockNote 0.55 logs `console.warn` "[BlockNote] This page's viewport meta tag is missing
  interactive-widget=resizes-content" unless the root layout exports
  `export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" }`
  (verified: warning gone). Put it in `src/app/layout.tsx` in M0/M4.
- **Fonts / offline**: no BlockNote/Mantine CSS contains remote URLs (`grep url(` → only relative `@import`s);
  `@blocknote/core/fonts/inter.css` bundles local woff/woff2 (Latin only) — skip it. Emoji data comes from the bundled
  `@emoji-mart/data` via dynamic import and `emojiMart.init({ data })`; emoji-mart's CDN URLs are only used when data/
  locale/set are not provided — Playwright network log shows **no external requests** even after opening the emoji picker.
- **CSP**: BlockNote injects a `<style>` element for placeholders (supports a nonce only via internal
  `_tiptapOptions.injectNonce`) and Floating-UI/Mantine set inline styles → keep `style-src 'self' 'unsafe-inline'`
  (PLAN §3.12 already does). Images come from `/api/files/*` → `img-src 'self' blob: data:` is enough.
- **Server Actions body limit**: Next 16.3.7 default is **1 MB** (`experimental.serverActions.bodySizeLimit`,
  `dist/server/app-render/action-handler.js`). 300 blocks ≈ 83 KB JSON, so fine for normal pages, but set e.g.
  `experimental: { serverActions: { bodySizeLimit: "2mb" } }` and cap content size in zod with a Thai error.

---

## 3. Editor API reference (0.55.0, from `types/src/editor/BlockNoteEditor.d.ts`) [V]

### 3.1 `useCreateBlockNote(options?, deps?)`
`useCreateBlockNote<Options extends Partial<BlockNoteEditorOptions<any,any,any>>>(options, deps = [])` →
`BlockNoteEditor<BSchema,ISchema,SSchema>` inferred from `options.schema`. **Recreated when `deps` change** (plain
`useMemo`). Options (exact names):

| option | type / default | use in this project |
|---|---|---|
| `schema` | `CustomBlockNoteSchema` (default blocks) | our schema (§4) |
| `initialContent` | `PartialBlock[]`; **throws on `[]`** and on any invalid block | DB `content` (`'[]'` default → pass `undefined`) |
| `dictionary` | `Dictionary & Record<string, any>` (default `en`) | Thai dictionary (§6) |
| `uploadFile` | `(file: File, blockId?: string) => Promise<string \| Record<string, any>>` | §8. **object result is a PartialBlock update** (`editor.updateBlock(id, result)`), e.g. `{ type:"file", props:{ url, name, size } }` — NOT flat props (JSDoc is misleading). string → `{ props: { url } }` (UploadTab also sets `name`) |
| `resolveFileUrl` | `(url) => Promise<string>` | not needed (relative `/api/files/<id>` + cookie) |
| `pasteHandler` | `({ event, editor, defaultPasteHandler }) => boolean \| undefined`; `defaultPasteHandler({ prioritizeMarkdownOverHTML?: boolean = true, plainTextAsMarkdown?: boolean = true })` (JSDoc example `pasteBehavior` is stale) | §7.3 |
| `tables` | `{ splitCells?, cellBackgroundColor?, cellTextColor?, headers? }` all default `false` | `{ headers: true, cellBackgroundColor: true, cellTextColor: false, splitCells: false }` |
| `placeholders` | **deprecated** → use `dictionary.placeholders` | — |
| `trailingBlock` | default `true` | keep |
| `animations` | default `true` | keep |
| `autofocus` | `FocusPosition`, default false | `"end"` for new empty pages (optional) |
| `defaultStyles` | default `true` (Inter font + resets) | keep; override font (§10) |
| `links` | `{ HTMLAttributes?, onClick?(event, editor) => boolean\|void, isValidLink?(href) }` — default click opens a **new window** (verified) | `onClick`: same-origin `/p/...` → `router.push`, else `window.open(href, "_blank", "noopener")` |
| `tabBehavior` | `"prefer-navigate-ui" \| "prefer-indent"` | default |
| `domAttributes`, `dropCursor`, `setIdAttribute`, `disableExtensions`, `extensions` | advanced | not needed |
| `_tiptapOptions` | **@internal** | avoid |

(`isAllowedUri` mentioned in the JSDoc is **not** exported at runtime from `@blocknote/core` 0.55.0.)

### 3.2 `<BlockNoteView>` (from `@blocknote/mantine`)
Props = `BlockNoteViewProps` (react) with `theme` widened:
`editor` · `theme?: "light" | "dark" | Theme | { light: Theme; dark: Theme }` · `editable?: boolean` (default true, **live
toggle works**) · `onChange?(editor, { getChanges })` · `onSelectionChange?()` · `renderEditor?` · `children` ·
default-UI switches `formattingToolbar`, `linkToolbar`, `slashMenu`, `sideMenu`, `filePanel`, `tableHandles`,
`emojiPicker`, `comments`, `attributionTooltip` (all `boolean`) · `portalElements?` · `className` + div HTML attrs.
We set **`slashMenu={false}` `emojiPicker={false}` `filePanel={false}`** and render our own controllers as children.

Theme gotcha [V]: when `theme` is an **object**, the colour scheme (`data-color-scheme`, `data-mantine-color-scheme`)
follows the **OS** preference (`usePrefersColorScheme`), not the app's toggle. → pass the **string** `"light"|"dark"`
resolved from our preference and theme via CSS variables (§10).

### 3.3 Editor methods used by M4
`editor.document` (Block[] snapshot, cached, ~0 ms) · `getBlock(id)` · `insertBlocks(blocks, ref, "before"|"after")`
(**no "nested" placement in 0.55** — nest via `updateBlock(parent, { children })`) · `updateBlock(id, partial)` (can
change `type`) · `removeBlocks(ids)` · `replaceBlocks(remove, insert)` · `insertInlineContent(content)` ·
`getTextCursorPosition()` / `setTextCursorPosition(block, "start"|"end")` · `moveBlocksUp/Down(id?)` ·
`isEditable` (getter/setter) · `undo()/redo()` · `focus()/blur()` · `onChange(cb)` / `onSelectionChange` /
`onFocusChange(cb, { includeEditorUI })` / `onBeforeChange(cb)` · `pasteHTML(html, raw?)` / `pasteText` /
`pasteMarkdown` · `tryParseHTMLToBlocks(html)` (**synchronous** in 0.55 on the client editor) ·
`blocksToMarkdownLossy()` · `onUploadStart/End(cb)` · `getExtension(FilePanelExtension)?.showMenu(blockId)`.

### 3.4 Re-loading server content (FR-543 "โหลดใหม่")
Prefer **re-creating the editor** (bump a `loadVersion` in `useCreateBlockNote` deps or remount with `key`) over
`replaceBlocks`, so the ProseMirror undo history does not let users undo back into the stale version. Verified: deps
bump recreates cleanly, ids preserved. [V]

---

## 4. Schema, custom blocks and inline content (verified skeletons)

API facts [V]:
- `createReactBlockSpec(config, implementation, extensions?)` returns a **factory** `(options?) => BlockSpec` → use
  `subpage: createSubpageBlock()` in the schema.
- `createReactInlineContentSpec(config, implementation)` returns the **spec itself** → `mention: Mention`.
- Block config: `{ type, propSchema, content: "inline" | "none" | "plain" }`; prop spec `{ default, values? , type? }`.
  Implementation: `render: FC<{ block, editor, contentRef? }>`, `toExternalHTML?: FC<…>`, `parse?(el) => props|undefined`,
  `meta?: { fileBlockAccept?: string[], … }`, `runsBefore?`.
- `toExternalHTML` (copy/paste to other apps, HTML export) falls back to `render`; it is rendered through
  `ElementRenderer` = a React **portal inside the editor tree with `flushSync`** → React context (TanStack Query) works,
  but keep it hook-free/suspense-free.
- Default blocks in 0.55: `audio, bulletListItem, checkListItem, codeBlock (content "plain"), divider, file, heading,
  image, numberedListItem, paragraph, quote, table, toggleListItem, video` (+ `pageBreak` spec exists but not default).
- `createHeadingBlockSpec({ levels?: number[], defaultLevel?, allowToggleHeadings? = true })`.
- **No prop validation at load**: `heading level 7`, `subpage pageId: 5`, `mention kind "team"` are all accepted by
  `BlockNoteEditor.create`; only unknown block types throw (headless jsdom check). → server-side zod (§13).
- A **headless editor works in Node + jsdom** (`BlockNoteEditor.create({ schema, initialContent })` in 25 ms, ids
  assigned) → Vitest can validate templates against the real schema.

### 4.1 `schema.ts`
```ts
import { BlockNoteSchema, createHeadingBlockSpec, createImageBlockSpec, defaultBlockSpecs,
  defaultInlineContentSpecs, defaultStyleSpecs } from "@blocknote/core";
import { createAttachmentBlock } from "./blocks/attachment";
import { createSubpageBlock } from "./blocks/subpage";
import { Mention } from "./inline/mention";
import { IMAGE_MIME } from "@/lib/editor/upload-rules";   // ["image/png","image/jpeg","image/gif","image/webp"]

const { paragraph, bulletListItem, numberedListItem, checkListItem, toggleListItem, quote, codeBlock, divider, table } =
  defaultBlockSpecs;   // explicit pick → no audio/video (no upload types for them in §7.6), no unused-var lint

// image: restrict picker + drop/paste routing to the 4 raster types (SVG falls through to "file" = attachment, §7.6)
const baseImage = createImageBlockSpec();
const image = { ...baseImage, implementation: { ...baseImage.implementation,
  meta: { ...baseImage.implementation.meta, fileBlockAccept: [...IMAGE_MIME] } } };

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph, bulletListItem, numberedListItem, checkListItem, toggleListItem, quote, codeBlock, divider, table,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3], allowToggleHeadings: false }),   // FR-521: H1–H3
    image,
    file: createAttachmentBlock(),   // replaces default "file" (adds size) — keep the type name "file"!
    subpage: createSubpageBlock(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
  styleSpecs: defaultStyleSpecs,     // bold italic underline strike code textColor backgroundColor (FR-522)
});
export type AppSchema = typeof schema;
export type AppEditor = typeof schema.BlockNoteEditor;
export type AppBlock = typeof schema.Block;
export type AppPartialBlock = typeof schema.PartialBlock;
```
Verified: picker `accept="image/png,image/jpeg,image/gif,image/webp"`; slash menu then shows only H1–H3, no toggle
headings, no video/audio. Why keep `type: "file"`: BlockNote's paste/drop code falls back to the **hard-coded type
`"file"`** for any non-image file (`handleFileInsertion.ts`); also `"*/*"` never matches in its MIME matcher, so the
fallback is what routes attachments. [V]

### 4.2 Sub-page card block (FR-528, §7.7) — verified: creating → created → live rename → "หน้านี้ถูกลบแล้ว"
```tsx
// blocks/subpage.tsx — props: { pageId }. Title/icon are NOT stored: fetched live (renames propagate; no leak of
// titles in page JSON; deleted/inaccessible → "หน้านี้ถูกลบแล้ว").
import { createReactBlockSpec } from "@blocknote/react";
import { useRouter } from "next/navigation";
import { usePageSummary } from "@/components/pages/usePageSummary"; // TanStack Query: GET /api/pages/:id/summary (404 → deleted)
import { th } from "@/i18n/th";

function SubpageCard({ pageId }: { pageId: string }) {
  const s = usePageSummary(pageId);  // { status: "creating"|"loading"|"ok"|"deleted", title?, icon? }
  const router = useRouter();
  const t = th.editor.subpage;
  const label = s.status === "ok" ? s.title || t.untitled : s.status === "deleted" ? t.deleted
              : s.status === "creating" ? t.creating : t.loading;
  return (
    <a className={`subpage-card subpage-${s.status}`} data-testid="subpage-card"
       href={s.status === "ok" ? `/p/${pageId}` : undefined}
       contentEditable={false} draggable={false} aria-disabled={s.status !== "ok"}
       onClick={(e) => { e.preventDefault(); if (s.status === "ok") router.push(`/p/${pageId}`); }}>
      <span aria-hidden>{s.status === "ok" ? (s.icon ?? "📄") : "📄"}</span> <span className="subpage-title">{label}</span>
    </a>
  );
}

export const createSubpageBlock = createReactBlockSpec(
  { type: "subpage", propSchema: { pageId: { default: "" } }, content: "none" },
  {
    render: ({ block }) => <SubpageCard pageId={block.props.pageId} />,
    toExternalHTML: ({ block }) => <a href={`/p/${block.props.pageId}`}>{`/p/${block.props.pageId}`}</a>,
  },
);
```
Internal copy/paste round-trips via BlockNote's `blocknote/html` (props become `data-page-id` attributes). Clicking the
card in edit mode fires our `onClick` (verified `__lastNav = "/p/p-charter"`) and node-selects the block.

### 4.3 Mention inline content (FR-529) — verified: menu, chip `@Ivy`, live rename to `@ไอวี่`, works in table cells
```tsx
// inline/mention.tsx — props: { kind: "user" | "page", id }. Document stores ids only.
import { createReactInlineContentSpec } from "@blocknote/react";
function UserChip({ id }: { id: string }) {
  const name = useUserName(id);            // TanStack Query (users list is visible to everyone)
  return <span className="mention mention-user" data-testid="mention-user">@{name ?? th.editor.mention.unknownUser}</span>;
}
function PageChip({ id }: { id: string }) {
  const s = usePageSummary(id);            // 404 → "ไม่พบหน้า" (never leak a title the viewer can't see — §3.3)
  const router = useRouter();
  const label = s.status === "ok" ? s.title || th.editor.subpage.untitled : th.editor.mention.unknownPage;
  return <a className="mention mention-page" href={s.status === "ok" ? `/p/${id}` : undefined}
            onClick={(e) => { e.preventDefault(); if (s.status === "ok") router.push(`/p/${id}`); }}>
           {s.status === "ok" ? (s.icon ?? "📄") : "📄"} {label}</a>;
}
export const Mention = createReactInlineContentSpec(
  { type: "mention", propSchema: { kind: { default: "user", values: ["user", "page"] as const }, id: { default: "" } },
    content: "none" },
  {
    render: ({ inlineContent }) => inlineContent.props.kind === "user"
      ? <UserChip id={inlineContent.props.id} /> : <PageChip id={inlineContent.props.id} />,
    toExternalHTML: ({ inlineContent }) =>
      <span data-mention-kind={inlineContent.props.kind} data-mention-id={inlineContent.props.id}>@{inlineContent.props.id}</span>,
  },
);
```
Resulting JSON: `{ "type":"mention", "props":{ "kind":"user", "id":"u-ivy" } }` inside a paragraph's `content`. [V]

### 4.4 Attachment block = custom `file` (FR-527) — verified card `📎 สัญญา.pdf 120.6 KB`
```tsx
import { defaultProps, fileParse } from "@blocknote/core";
import { FilePanelExtension } from "@blocknote/core/extensions";
import { createReactBlockSpec } from "@blocknote/react";
import { useSyncExternalStore } from "react";
import { uploadStore } from "@/lib/editor/upload";

export const createAttachmentBlock = createReactBlockSpec(
  { type: "file",
    propSchema: { backgroundColor: defaultProps.backgroundColor, name: { default: "" }, url: { default: "" },
                  caption: { default: "" }, size: { default: 0 } },   // same props as default + size (bytes)
    content: "none" },
  {
    meta: { fileBlockAccept: ["*/*"] },           // keeps it a "file block" for toolbar buttons + FilePanel
    parse: fileParse(),                            // <embed>/<figure> from pasted HTML
    render: function AttachmentRender({ block, editor }) {
      // NOT useUploadLoading(): it subscribes in useEffect and misses the start event for a block that mounts in the
      // same tick as uploadFile() (verified: loader never shown). Read a store during render instead.
      const uploading = useSyncExternalStore(uploadStore.subscribe, () => uploadStore.has(block.id));
      if (uploading) return <div className="att att-uploading">{th.editor.attachment.uploading}</div>;
      if (block.props.url === "") return (
        <div className="att att-empty" onMouseDown={(e) => e.preventDefault()}
             onClick={() => editor.isEditable && editor.transact(() => editor.getExtension(FilePanelExtension)?.showMenu(block.id))}>
          📎 {editor.dictionary.file_blocks.add_button_text["file"]}
        </div>);
      return (
        <div className="att" contentEditable={false}>
          <span aria-hidden>📎</span>
          <a href={block.props.url} download={block.props.name}>{block.props.name}</a>
          <span className="att-size">{formatBytes(block.props.size)}</span>  {/* "120.6 KB" */}
          {block.props.caption && <div className="att-caption">{block.props.caption}</div>}
        </div>);
    },
    toExternalHTML: ({ block }) => <a href={block.props.url}>{block.props.name || block.props.url}</a>,
  },
);
```
Default formatting-toolbar buttons (caption / replace / rename / delete / download) keep working because the props
match (`blockHasType(..., { url: "string" })`). Download button = `window.open(url)`; server sends
`Content-Disposition: attachment`. [V]

---

## 5. Suggestion menus (slash, mention, emoji)

API [V]: `SuggestionMenuController` props `{ triggerCharacter, getItems?(query) => Promise<Item[]>, shouldOpen?(tr) =>
boolean, minQueryLength?, floatingUIOptions?, portalElement?, suggestionMenuComponent?, onItemClick? }`.
`GridSuggestionMenuController` adds required `columns`; its default `getItems` = emoji picker.
`DefaultReactSuggestionItem = Omit<DefaultSuggestionItem,"key"> & { icon?: JSX.Element; size?: "default"|"small" }`,
`DefaultSuggestionItem = { key, title, onItemClick: () => void, subtext?, badge?, aliases?, group? }` (the React type
omits `key` but the runtime objects from `getDefaultReactSlashMenuItems` still carry it).
`filterSuggestionItems(items, q)` = case-insensitive **substring** on title|aliases (exported from `@blocknote/core` and
`/extensions`). Default slash items read `title/subtext/aliases/group` from `editor.dictionary.slash_menu[key]` → the
dictionary is the renaming mechanism. Menu closes after >3 consecutive chars with no results. Group labels render
whenever `group` changes between consecutive items. `useLoadSuggestionMenuItems` discards stale async results, but its
effect depends on `[query, getItems]` → **pass a stable (`useCallback`) `getItems`** and never let it reject (a rejection
leaves the menu loading + unhandled rejection) — catch → `[]`.
`shouldOpen` is evaluated **before** the trigger char is inserted (in `handleTextInput`), `openSuggestionMenu()` (used by
the side-menu "+" and the emoji slash item) **bypasses** `shouldOpen` (verified: "+" still opens the slash menu).

### 5.1 Verified stock-behaviour bugs → fixes
| typed | stock 0.55 result | fix |
|---|---|---|
| `/หน้า` + Enter | inserts **paragraph** (`ย่อหน้า` listed first) | ranked filter → `["หน้า","ย่อหน้า"]`, sub-page inserted |
| `ประชุม 10:30` + Enter | text becomes `ประชุม 10🕒 ` (emoji grid opened on `:30`) | `:` only at word start |
| `แบ่ง 1/2` + Enter | new **Heading 2** block (`/2` matched `หัวข้อ 2`) | `/` only at word start |
| `cindy@corp.co.th` | (with guard) no menu | `@` only at word start |

```ts
// src/lib/editor/suggest.ts  (pure; unit-tested — 6 node:test cases pass)
import type { SuggestionMenuOptions } from "@blocknote/core/extensions";   // type-only → no prosemirror dep
type ShouldOpen = NonNullable<SuggestionMenuOptions["shouldOpen"]>;
type Item = { title: string; aliases?: readonly string[]; group?: string };

/** ranks: 0 exact title · 1 exact alias · 2 title prefix · 3 alias prefix · 4 title substring · 5 alias substring;
 *  groups kept contiguous (ordered by their best item), stable. */
export function rankSuggestionItems<T extends Item>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...items];
  const scored: { item: T; rank: number; i: number }[] = [];
  items.forEach((item, i) => {
    const title = item.title.toLowerCase();
    const aliases = (item.aliases ?? []).map((a) => a.toLowerCase());
    let rank = -1;
    if (title === q) rank = 0; else if (aliases.includes(q)) rank = 1;
    else if (title.startsWith(q)) rank = 2; else if (aliases.some((a) => a.startsWith(q))) rank = 3;
    else if (title.includes(q)) rank = 4; else if (aliases.some((a) => a.includes(q))) rank = 5;
    if (rank >= 0) scored.push({ item, rank, i });
  });
  const g = (x: { item: T }) => x.item.group ?? "";
  const best = new Map<string, { rank: number; i: number }>();
  for (const x of scored) { const b = best.get(g(x)); if (!b || x.rank < b.rank || (x.rank === b.rank && x.i < b.i)) best.set(g(x), { rank: x.rank, i: x.i }); }
  scored.sort((a, b) => { const ga = best.get(g(a))!, gb = best.get(g(b))!;
    return ga.rank - gb.rank || ga.i - gb.i || a.rank - b.rank || a.i - b.i; });
  return scored.map((x) => x.item);
}

/** open only at block start or after whitespace (or right after an inline atom like a mention chip) */
export const atWordStart: ShouldOpen = (tr) => {
  const before = tr.selection.$from.nodeBefore;
  if (!before) return true;
  if (!before.isText) return true;
  const text = before.text ?? "";
  return text === "" || /\s$/.test(text);
};
/** slash: also never inside table cells (same as BlockNote's default guard) */
export const slashShouldOpen: ShouldOpen = (tr) =>
  !tr.selection.$from.parent.type.isInGroup("tableContent") && atWordStart(tr);
```
(Non-null assertions `best.get(...)!` are safe by construction; if lint forbids `!`, use `?? { rank: 9, i: 0 }`.)

### 5.2 Slash items (Thai titles from the dictionary, custom `/หน้า`, 3×3 table)
```tsx
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems } from "@blocknote/react";

export function getSlashMenuItems(editor: AppEditor, ctx: { createSubpage: () => Promise<string | null>; canCreateSubpage: boolean }) {
  const out: DefaultReactSuggestionItem[] = [];
  for (const item of getDefaultReactSlashMenuItems(editor)) {
    if ("key" in item && item.key === "table") {            // runtime key survives (narrowing compile-checked [V]); harness compared titles
      out.push({ ...item, onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "table",
        content: { type: "tableContent", rows: [{ cells: ["", "", ""] }, { cells: ["", "", ""] }, { cells: ["", "", ""] }] } }) });
      if (ctx.canCreateSubpage) {                            // hide at depth 9 (FR-502 max 10 levels) / no permission
        const s = th.editor.slash.subpage;                   // { title:"หน้า", subtext, aliases:["page","subpage","หน้าย่อย"], group:"ขั้นสูง" }
        out.push({ title: s.title, subtext: s.subtext, aliases: [...s.aliases], group: s.group, icon: <PageIcon />,
          onItemClick: () => {
            // insert placeholder card immediately ("กำลังสร้างหน้า…"), then fill pageId from the server action
            const block = insertOrUpdateBlockForSlashMenu(editor, { type: "subpage", props: { pageId: "" } });
            void ctx.createSubpage().then((id) => {
              if (!editor.getBlock(block.id)) return;
              if (id) editor.updateBlock(block.id, { props: { pageId: id } }); else editor.removeBlocks([block.id]);
            });
          } });
      }
      continue;
    }
    out.push(item);
  }
  return out;
}
// in <BlockNoteView slashMenu={false} emojiPicker={false} filePanel={false}>:
<SuggestionMenuController triggerCharacter="/" shouldOpen={slashShouldOpen}
  getItems={useCallback(async (q) => rankSuggestionItems(getSlashMenuItems(editor, ctx), q), [editor, ctx])} />
<GridSuggestionMenuController triggerCharacter=":" columns={10} minQueryLength={2} shouldOpen={atWordStart} />
```
Verified behaviour: full Thai listing `หัวข้อ 1/2/3, ข้อความอ้างอิง, รายการพับได้, ลำดับเลข, รายการจุด, เช็กลิสต์, ย่อหน้า,
โค้ด, เส้นคั่น, ตาราง, หน้า, รูปภาพ, ไฟล์แนบ, อีโมจิ` in groups `หัวข้อ, บล็อกพื้นฐาน, ขั้นสูง, สื่อ, อื่น ๆ`;
`/ตาราง` and `/table` → `ตาราง` → 3×3; `/รูป` → `รูปภาพ` → empty image block + **upload-only file panel** opens
(tab `อัปโหลด`, accept = 4 image MIME types); `/หน้า` → card created, cursor moves to the next paragraph; side-menu "+"
opens the slash menu. Keyboard badges show `⌘-Alt-1` etc. [V]
`/หน้า` notes: the child page is created by a server action (authz: edit on current page; `parent_id` = current page;
same space/project; depth ≤ 9). Undoing the card insertion (Cmd+Z) leaves the child page in the sidebar (acceptable).

### 5.3 Mention menu
```tsx
<SuggestionMenuController triggerCharacter="@" shouldOpen={atWordStart}
  getItems={useCallback(async (q: string) => {
    try {
      const targets = await queryClient.fetchQuery({ queryKey: ["mention-search", q], staleTime: 30_000,
        queryFn: () => fetchJson<MentionTarget[]>(`/api/search/mentions?q=${encodeURIComponent(q)}`) }); // authz-filtered
      return rankSuggestionItems(targets.map((t) => ({ title: t.label, subtext: t.sub, aliases: [t.id],
        group: t.kind === "user" ? th.editor.mention.groupPeople : th.editor.mention.groupPages,
        onItemClick: () => editor.insertInlineContent([{ type: "mention", props: { kind: t.kind, id: t.id } }, " "]) })), q);
    } catch { return []; }
  }, [editor])} />
```
UX note [L]: on the Thai Kedmanee layout `/` is on the `2` key (reachable) and `-` on `3`, but `@` requires switching to
the English layout (same as typing an email) — acceptable; mention it in the e2e/manual test notes only.

---

## 6. Dictionary / i18n (all Thai text in `src/i18n/th.ts`)

- `Dictionary = typeof en` (`@blocknote/core/src/i18n/dictionary.ts`) — keys: `slash_menu` (24 items incl. heading_4..6,
  toggle_heading*, page_break, video, audio, emoji), `placeholders` (`default`, `heading`, `toggleListItem`,
  `bulletListItem`, `numberedListItem`, `checkListItem`, `emptyDocument`, `new_comment`, `edit_comment`,
  `comment_reply`; implemented as injected CSS `::after { content: "…" }` rules), `file_blocks`, `toggle_blocks`,
  `code_block`, `side_menu`, `drag_handle`, `table_handle`, `suggestion_menu`, `color_picker`, `formatting_toolbar`,
  `file_panel`, `link_toolbar`, `comments` (functions!), `suggestion_changes` (functions), `exporter`, `generic`. [V]
- `BlockTypeSelect` (toolbar block-type dropdown) also uses `slash_menu.*.title` → Thai everywhere. Only the unused
  Versioning components contain hard-coded English. [V]
- Put the full Thai dictionary in `th.ts` as data typed with `satisfies Dictionary` via `import type` (no runtime BlockNote
  import in th.ts; a BlockNote upgrade that adds keys then **fails typecheck** instead of silently showing English). [V]
- Build the runtime dictionary in `src/lib/editor/dictionary.ts` (client module) merging English search aliases (verified
  `/table` works):
```ts
import type { Dictionary } from "@blocknote/core";
import { en } from "@blocknote/core/locales";      // tree-shakeable (sideEffects only for *.css)
import { th } from "@/i18n/th";
type SlashKey = keyof Dictionary["slash_menu"];
const uniq = (xs: readonly string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
export function buildThaiDictionary(): Dictionary {
  const bn = th.editor.blocknote;                  // complete Thai Dictionary
  const slash = {} as Dictionary["slash_menu"];
  for (const key of Object.keys(en.slash_menu) as SlashKey[]) {
    const e = en.slash_menu[key], t = bn.slash_menu[key];
    slash[key] = { title: t.title, subtext: t.subtext, group: t.group,
                   aliases: uniq([e.title.toLowerCase(), ...e.aliases, ...t.aliases]) };   // "table", "h1", "ul", …
  }
  return { ...bn, slash_menu: slash };
}
export const thaiDictionary = buildThaiDictionary();
```
- Complete Thai dictionary used in the verified harness (copy into `th.ts` as `th.editor.blocknote`; wording can be
  polished): see `harness/src/lib/th-editor.ts` (≈ 150 lines). Excerpt of the parts users actually see:
```ts
slash_menu: {
  heading:{title:"หัวข้อ 1",subtext:"หัวข้อระดับบนสุด",aliases:["หัวข้อ"],group:"หัวข้อ"},
  heading_2:{title:"หัวข้อ 2",…}, heading_3:{title:"หัวข้อ 3",…},
  quote:{title:"ข้อความอ้างอิง",aliases:["อ้างอิง","คำพูด"],group:"บล็อกพื้นฐาน",…},
  toggle_list:{title:"รายการพับได้",aliases:["พับ"],…}, numbered_list:{title:"ลำดับเลข",…}, bullet_list:{title:"รายการจุด",…},
  check_list:{title:"เช็กลิสต์",aliases:["เช็ค","ติ๊ก"],…}, paragraph:{title:"ย่อหน้า",aliases:["ข้อความ"],…},
  code_block:{title:"โค้ด",…}, divider:{title:"เส้นคั่น",aliases:["เส้น","คั่น"],…},
  table:{title:"ตาราง",subtext:"ตารางที่แก้ไขในเซลล์ได้",aliases:[],group:"ขั้นสูง"},
  image:{title:"รูปภาพ",subtext:"อัปโหลดรูป ปรับขนาด ใส่คำบรรยาย",aliases:["รูป","ภาพ"],group:"สื่อ"},
  file:{title:"ไฟล์แนบ",subtext:"PDF, Word, Excel, PowerPoint, ZIP",aliases:["ไฟล์","แนบ"],group:"สื่อ"},
  emoji:{title:"อีโมจิ",…,group:"อื่น ๆ"}, /* + heading_4..6, toggle_heading*, page_break, video, audio (unused but required by the type) */ },
placeholders: { default:"พิมพ์ข้อความ หรือพิมพ์ '/' เพื่อเลือกคำสั่ง", heading:"หัวข้อ", bulletListItem:"รายการ", … },
side_menu: { add_block_label:"เพิ่มบล็อก", drag_handle_label:"ลากเพื่อย้าย / คลิกเพื่อเปิดเมนู" },
drag_handle: { delete_menuitem:"ลบ", colors_menuitem:"สี", header_row_menuitem:"แถวหัวตาราง", header_column_menuitem:"คอลัมน์หัวตาราง" },
table_handle: { delete_column_menuitem:"ลบคอลัมน์", delete_row_menuitem:"ลบแถว", add_left_menuitem:"เพิ่มคอลัมน์ทางซ้าย",
  add_right_menuitem:"เพิ่มคอลัมน์ทางขวา", add_above_menuitem:"เพิ่มแถวด้านบน", add_below_menuitem:"เพิ่มแถวด้านล่าง",
  split_cell_menuitem:"แยกเซลล์", merge_cells_menuitem:"รวมเซลล์", background_color_menuitem:"สีพื้น" },
file_panel: { upload:{ title:"อัปโหลด", file_placeholder:{ image:"เลือกรูปภาพ", file:"เลือกไฟล์", … }, upload_error:"อัปโหลดไม่สำเร็จ" }, embed:{…} },
formatting_toolbar: { bold:{tooltip:"ตัวหนา",secondary_tooltip:"Mod+B"}, …, file_caption:{tooltip:"แก้คำบรรยาย",…}, align_left:{tooltip:"ชิดซ้าย"}, … },
color_picker: { text_title:"สีตัวอักษร", background_title:"สีพื้น", colors:{ default:"อัตโนมัติ", gray:"เทา", … } },
suggestion_menu: { no_items_title:"ไม่พบรายการ" },
```
- Custom (non-BlockNote) editor strings also live in th.ts: `th.editor.slash.subpage`, `th.editor.subpage.{untitled,
  deleted,creating,loading}`, `th.editor.mention.{unknownUser,unknownPage,groupPeople,groupPages}`,
  `th.editor.attachment.uploading`, `th.editor.upload.{tooLargeImage,tooLargeFile,typeNotAllowed,failed}`,
  `th.editor.pasteImageLinkFallback`, `th.editor.saveStatus.{saving,saved,error}`, `th.editor.lock.*`.

---

## 7. Tables

### 7.1 Capabilities with `tables: { headers: true, cellBackgroundColor: true }` [V]
- Row handle menu: `ลบแถว, เพิ่มแถวด้านบน, เพิ่มแถวด้านล่าง, แถวหัวตาราง, สี`; column handle menu: `ลบคอลัมน์,
  เพิ่มคอลัมน์ทางซ้าย, เพิ่มคอลัมน์ทางขวา, คอลัมน์หัวตาราง, สี` (Playwright clicked "เพิ่มคอลัมน์ทางขวา": 3×3 → 3×4).
- Extend buttons (+ at the right/bottom edge) add rows/columns; header toggles set `headerRows: 1` / `headerCols: 1`
  (only first row/col; no multi-row headers).
- Column resize by dragging a cell border (prosemirror-tables `columnResizing`, min 35 px, default 120 px) → stored in
  `columnWidths` (verified `[201, null, null, null]`).
- Cell background colours (named palette: gray, brown, red, orange, yellow, green, blue, purple, pink) via the handle/cell
  menu → cell `props.backgroundColor` (verified `"yellow"` renders `rgb(251,243,219)`).
- Cell text colour off (`cellTextColor:false`), merge/split off (`splitCells:false`) — not required, keeps TSV paste
  and `content_text` simple. Slash menu is disabled inside cells; `@` mentions work in cells (verified).
- Enter moves to the cell below, Tab to the next cell, Backspace at cell start does not delete the table.
- Pasting a spreadsheet range while the cursor is **inside an existing table** fills cells like Excel and even adds
  columns when needed (verified 4×3 Excel range at (1,1) of a 4×4 table → 4×5 table filled). [V]

### 7.2 JSON shape (from `editor.document`; round-trips losslessly) [V]
```json
{ "id": "…uuid…", "type": "table", "props": { "textColor": "default" },
  "content": { "type": "tableContent",
    "columnWidths": [201, null, null],          // (number|undefined)[] → JSON null
    "headerRows": 1, "headerCols": 1,           // optional, only 1 is produced by the UI
    "rows": [ { "cells": [
      { "type": "tableCell",
        "props": { "colspan": 1, "rowspan": 1, "backgroundColor": "yellow", "textColor": "default", "textAlignment": "left" },
        "content": [ { "type": "text", "text": "ชื่อ", "styles": { "bold": true } } ] } ] } ] },
  "children": [] }
```
Partial input accepted by `initialContent`/`insertBlocks` (templates, programmatic TSV): cells as strings or inline
arrays: `{ type:"table", content:{ type:"tableContent", headerRows:1, rows:[{ cells:["หัวข้อ","รายละเอียด"] }, { cells:["ลูกค้า",""] }] } }`. [V]

### 7.3 Paste matrix — stock vs our handler (Chromium, synthetic `ClipboardEvent` with `DataTransfer`) [V]

| clipboard content | stock `defaultPasteHandler()` | our handler |
|---|---|---|
| Excel HTML + TSV (4×3, Thai) | table 3 rows × 4 cols ✓ | table ✓ |
| Excel HTML + TSV whose text *looks like markdown* (`task_name_1`) | **one paragraph** `ชื่อ ตำแหน่ง …\ntask_name_1 …` ✗ | table ✓ |
| Google Sheets HTML | table ✓ (bold kept) | table ✓ |
| TSV only (no HTML) | **one paragraph** ✗ | table ✓ |
| screenshot (Files only, image/png) | upload → image block ✓ | upload → image block ✓ |
| browser "Copy image" (`<img src=https://…>` + File) | **image block with external URL** `https://example.com/cat.png` ✗ | uploads the File → `/api/files/f1` ✓ |
| Excel HTML + TSV + PNG rendering in Files | table ✓ | table ✓ |
| text/plain markdown-ish | parsed as markdown | same (default kept) |

Why: stock precedence is `vscode-editor-data > blocknote/html > text/markdown > text/html > text/plain > Files`
(`acceptedMIMETypes.ts`), with `prioritizeMarkdownOverHTML=true` → `isMarkdown(text/plain)` is checked **before** HTML.
Real `isMarkdown` regexes (0.55 `detectMarkdown.ts`) return `true` for TSV such as `task_name_1\tCindy`, `1. วางแผน\t2`,
`- ข้อ 1\tCindy`, `*สำคัญ*\t1`, `a==b==c`, `cindy_x@corp.co.th\tivy_y@corp.co.th`, `file_a.xlsx\tfile_b.xlsx` (and `false`
for plain Thai, money `1,000`, dates `30/9/2569`). `isMarkdown` is not exported. [V]

### 7.4 Paste handler (verified)
```ts
// src/lib/editor/paste.ts  (client; typed without `any`)
type DefaultPasteHandler = (ctx?: { prioritizeMarkdownOverHTML?: boolean; plainTextAsMarkdown?: boolean }) => boolean | undefined;
export type PasteHandler = (ctx: { event: ClipboardEvent; editor: AppEditor; defaultPasteHandler: DefaultPasteHandler }) => boolean | undefined;
const HAS_TABLE = /<table[\s>]/i, HAS_IMG = /<img[\s>]/i;

export function makePasteHandler(notify: (m: string) => void): PasteHandler {
  return ({ event, editor, defaultPasteHandler }) => {
    const dt = event.clipboardData;
    if (!dt) return defaultPasteHandler();
    const types = Array.from(dt.types);
    if (types.includes("blocknote/html")) return defaultPasteHandler();            // 1 internal copy (subpage/mention exact)
    const html = types.includes("text/html") ? dt.getData("text/html") : "";
    const text = types.includes("text/plain") ? dt.getData("text/plain") : "";
    if (HAS_TABLE.test(html)) {                                                     // 2 Excel/Sheets/Word tables: bypass md sniffing
      editor.pasteHTML(HAS_IMG.test(html) ? externalImagesToLinks(html) : html); return true;
    }
    const files = Array.from(dt.files);
    if (files.length > 0 && (!html || !htmlHasText(html))) {                        // 3 screenshots / Copy image / Finder files
      void insertFilesAtCursor(editor, files, notify); return true;
    }
    if (!html) { const grid = parseTsvGrid(text); if (grid) { editor.pasteHTML(gridToHtmlTable(grid)); return true; } } // 4 TSV
    if (HAS_IMG.test(html)) { editor.pasteHTML(externalImagesToLinks(html)); return true; }                            // 5 no hotlinks
    return defaultPasteHandler({ prioritizeMarkdownOverHTML: false, plainTextAsMarkdown: true });                      // 6 rest
  };
}
/** <img src="http(s)://…" | "//…" | "data:…"> → <a>alt|"รูปภาพ (ลิงก์ภายนอก)"</a> (data: → text only) */
export function externalImagesToLinks(html: string, doc: Document = document): string { /* template.innerHTML + replaceWith */ }
/** true if HTML has visible text after removing style/script/meta/link/title (Word/PowerPoint also put a PNG in Files) */
export function htmlHasText(html: string, doc: Document = document): boolean { /* … */ }
```
Full verified source: `harness/src/lib/paste.ts`, `harness/src/lib/tsv.ts`, `harness/src/lib/upload.ts`.
`parseTsvGrid(text)` (pure) handles CRLF, trailing newline, Excel quoting (`"a\nb"`, `""`), requires ≥2 rows × ≥2 cols
and a rectangular grid, returns `string[][] | null`; `gridToHtmlTable(grid)` escapes `& < >` and `\n`→`<br>`; routing
the TSV through `pasteHTML` (instead of `insertBlocks`) lets prosemirror-tables paste *into* an existing table.
Product note (decide in PROGRESS › Decisions): for text/plain-only pastes the stock "markdown" interpretation is kept;
be aware tiptap mark **paste rules** turn `2 * 3 * 4` into `2 <i> 3 </i> 4` even with `pasteText` (verified) — minor.

---

## 8. Images and files

### 8.1 Image block (built-in) [V]
Props: `textAlignment ("left"|"center"|"right"|"justify")`, `backgroundColor`, `name` (used as `alt`), `url`,
`caption`, `showPreview` (default true), `previewWidth?: number`. UI: 2 resize handles (drag → `previewWidth`, verified
203), formatting toolbar on node-selection shows caption / replace / rename / delete / download / preview-toggle /
align left-center-right (screenshot `tests/shot-image-selected.png`) → FR-526 fully built-in.
`src` uses `props.url` directly (relative `/api/files/<id>` works with cookie auth; `resolveFileUrl` unnecessary).

### 8.2 Upload flow & hooks [V]
- Paste of files → our handler `insertFilesAtCursor` (replaces the empty current block or inserts after, then
  `editor.uploadFile(file, blockId)` and `updateBlock`). Drop of files → BlockNote `createDropFileExtension` →
  `handleFileInsertion` (block type chosen by `fileBlockAccept` MIME match, fallback `"file"`; insertion before/after the
  block under the pointer) → `uploadFile` → `updateBlock(id, result)`. FilePanel UploadTab → `uploadFile` → `updateBlock`.
- `uploadFile` result: return a **PartialBlock** so the server decides the final type:
  `r.kind === "IMAGE" ? { type:"image", props:{ url, name } } : { type:"file", props:{ url, name, size } }`
  (SVG or a fake `.png` becomes an attachment — SPEC §7.6).
- **Never reject** (see §0). Verified pattern: on failure toast, return `{}` (BlockNote's `updateBlock(id, {})` is a
  no-op) and remove the empty placeholder on the next tick **only if its `url === ""`** (never remove an existing image
  on a failed "replace"). Result: drop of `evil.exe` → toast `ไม่รองรับไฟล์ชนิดนี้`, no block, **0 unhandled rejections**
  (stock/naive throw → `pageerror`).
- Upload spinner for custom React blocks: use an external store (`useSyncExternalStore`) set inside `uploadFile`
  (verified 0 → 1 indicator).
- Client pre-check (instant feedback only; server re-validates with `file-type` magic bytes): images png/jpeg/gif/webp
  ≤ 10 MB, attachments pdf/doc(x)/xls(x)/ppt(x)/csv/txt/zip/svg ≤ 25 MB.
- Accept lists: FilePanel `<input accept>` = `fileBlockAccept.join(",")` (verified image picker accept string). For the
  attachment picker you may set the custom file block's `fileBlockAccept` to extensions
  (`[".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".csv",".txt",".zip",".svg"]`) — extension patterns are supported
  by BlockNote's matcher and by `accept` [L]; keep `"*/*"`-equivalent routing in mind (fallback type "file").
- **Upload-only FilePanel** (no "Embed URL" tab — external images unsupported in MVP), verified:
```tsx
function UploadOnlyFilePanel(props: FilePanelProps) {
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const [loading, setLoading] = useState(false);
  const name = dict.file_panel.upload.title;               // "อัปโหลด"
  return <Components.FilePanel.Root className="bn-panel" loading={loading}
    tabs={[{ name, tabPanel: <UploadTab blockId={props.blockId} setLoading={setLoading} /> }]}
    openTab={name} defaultOpenTab={name} setOpenTab={() => {}} />;
}
// <BlockNoteView filePanel={false}> … <FilePanelController filePanel={UploadOnlyFilePanel} />
```
  (`<FilePanel tabs={…}>` also accepts custom tabs but its internal `loading` state can't be driven from outside.)

### 8.3 External images via **drag & drop** bypass the paste handler [V]
Dropping HTML (`text/html: <img src="https://example.com/dragged.png">`, e.g. an image dragged from another tab) creates
an **image block with the external URL** (BlockNote's drop plugin returns `false` for non-Files → ProseMirror default drop).
Mitigations (plan both): (a) server-side sanitiser on save: image `url` must match `^/api/files/[0-9a-f-]{36}$` else
convert the block into a paragraph link (or drop it); (b) client post-fix in `onChange`: find image blocks whose url is not
`/api/files/…` and `replaceBlocks` them with a link paragraph (`th.editor.pasteImageLinkFallback`). CSP `img-src 'self'`
already prevents the browser from loading the remote image (no tracking) — this is data hygiene.

### 8.4 FR-527 file size
Stock `file` block props: `backgroundColor, name, url, caption` — **no size** → custom React block (§4.4). Verified card
text `📎สัญญา.pdf120.6 KB` (UTF-8 Thai filename preserved when the server parses multipart as UTF-8 — Next's
`request.formData()` does). [V]

---

## 9. Server-side `content_text` (§6.4) — pure walker, verified by 9 tests

Recommendation: **manual recursive walk of the stored JSON**, not `@blocknote/server-util` (that needs jsdom 29 +
react-dom + the whole editor on the server, and its HTML/markdown output is lossy for our custom blocks). [V]
Rules: styled runs inside one inline container concatenate **without separators** (Thai has no spaces: `ตัว`+`หนา` →
`ตัวหนา`); blocks/cells joined with one space; link text yes, href no; **page mentions and sub-page cards NOT indexed**
(title may be invisible to the searcher + goes stale); user mentions optional via resolver; code block text yes;
image/file `name` + `caption` yes; whitespace collapsed, zero-width chars removed, NFC; depth cap 64; length cap 200 k.

```ts
// src/lib/editor/content-text.ts  — PURE (no BlockNote/DOM import): usable in server actions, scripts, Vitest(node)
export type ContentTextOptions = { userName?: (id: string) => string | undefined; maxLength?: number; maxDepth?: number };
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === "string" ? x : "");

function inlineText(content: unknown, opts: ContentTextOptions): string {
  if (typeof content === "string") return content;                 // PartialBlock shorthand
  if (!Array.isArray(content)) return "";
  let run = "";
  for (const ic of content) {
    if (typeof ic === "string") { run += ic; continue; }
    if (!isObj(ic)) continue;
    switch (ic.type) {
      case "text": run += str(ic.text); break;
      case "link": run += inlineText(ic.content, opts); break;
      case "mention": { const p = isObj(ic.props) ? ic.props : {};
        if (p.kind === "user" && opts.userName) { const n = opts.userName(str(p.id)); if (n) run += `@${n}`; } break; }
      default: run += inlineText(ic.content, opts);
    }
  }
  return run;
}
function tableText(content: Obj, out: string[], opts: ContentTextOptions): void {
  if (!Array.isArray(content.rows)) return;
  for (const row of content.rows) {
    if (!isObj(row) || !Array.isArray(row.cells)) continue;
    for (const cell of row.cells) {
      const t = isObj(cell) && cell.type === "tableCell" ? inlineText(cell.content, opts) : inlineText(cell, opts);
      if (t) out.push(t);
    }
  }
}
function blockText(block: unknown, out: string[], opts: ContentTextOptions & { maxDepth: number }, depth: number): void {
  if (!isObj(block) || depth > opts.maxDepth) return;
  const content = block.content;
  if (isObj(content) && content.type === "tableContent") tableText(content, out, opts);
  else { const t = inlineText(content, opts); if (t) out.push(t); }        // inline | plain(code) | string | none
  const type = str(block.type), props = isObj(block.props) ? block.props : {};
  if (type === "image" || type === "file") { if (str(props.name)) out.push(str(props.name)); if (str(props.caption)) out.push(str(props.caption)); }
  if (Array.isArray(block.children)) for (const c of block.children) blockText(c, out, opts, depth + 1);
}
const ZERO_WIDTH = /[​-‍⁠﻿]/g;
export function extractContentText(doc: unknown, options: ContentTextOptions = {}): string {
  const opts = { maxDepth: 64, ...options };
  const out: string[] = [];
  if (Array.isArray(doc)) for (const b of doc) blockText(b, out, opts, 0);
  const text = out.join(" ").normalize("NFC").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
  const max = opts.maxLength ?? 200_000;
  return text.length > max ? text.slice(0, max) : text;
}
// + collectMentionIds(doc) → { users:Set, pages:Set } (mentions incl. table cells + subpage cards) for one-query name
//   resolution / link integrity / duplicate-remap. Full source: harness/src/lib/contentText.ts
```
Test cases (all pass, `nodecheck/contentText.test.ts`, fixture `fixtures/complex-doc.json` captured from BlockNote in
Chromium):
1. real document → `"ตัวหนาและปกติ ดูที่ สเปก แล้วคุยกับ @Cindy และหน้า ข้อแม่ ข้อลูก หลาน ชื่อ บทบาท @Ivy Dev select * from
   pages; screenshot.png ภาพหน้าจอ สัญญา.pdf พับได้ ซ่อนอยู่ คำพูด"` (heading with bold run, link, user+page mentions,
   nested bullet→bullet→checklist, table with mention + code-styled cell, code block, image name+caption, file name,
   subpage, toggle with children, quote, divider, empty paragraph);
2. `ตัว`+`หนา`(bold) → `ตัวหนา`; 3. page mentions/subpage not indexed, user mention only with resolver;
4. PartialBlock shorthands (string content, string cells, mixed arrays); 5. newlines/tabs collapse, ZWSP removed;
6. hostile inputs never throw (`null, 42, {}, [null, 1, {type:5}], rows:"no", cells:[null,7,{type:"tableCell"}]`);
7. 100,000-deep children → no stack overflow (depth cap); 8. maxLength; 9. `collectMentionIds`.
Search side (M4 palette / M10): `ILIKE '%' || q || '%'` on `title`/`content_text` with `pg_trgm` GIN; normalise the query
the same way (NFC, strip zero-width). Note NFC does **not** fold `ำ` vs `ํา` (would need NFKC, which is lossy) — accept.

---

## 10. Theming the Mantine view to match MUI (verified light/dark, menus, font)

Facts [V]: `--bn-*` variables are defined on `.bn-root` and `.bn-root[data-color-scheme="dark"]`; the editor container
**and every portal root** (menus, toolbars) get `class="bn-root <scheme>"` + `data-color-scheme` via `applyThemedRoot`,
so CSS-variable overrides reach floating UI. `--bn-font-family` styles `.bn-root` (menus) only; **content font is
hard-coded** in core `editor.css`: `.bn-default-styles { font-family: "Inter", "SF Pro Display", … }`.
Floating UI z-indexes are 10–90 on top of `--bn-ui-base-z-index` (default 0) → below a sticky MUI AppBar (1100).

Recommended `src/components/editor/editor-theme.css` (verified with the file imported **before** BlockNote's CSS — the
doubled selectors win by specificity, so bundler CSS ordering does not matter):
```css
/* MUI v9 with cssVariables + colorSchemeSelector:'class' exposes --mui-palette-* that switch with .dark */
.bn-root.bn-root[data-color-scheme] {
  --bn-ui-base-z-index: 1150;                       /* above MUI AppBar 1100, below MUI Modal 1300/Snackbar/Tooltip */
  --bn-font-family: var(--font-thai), system-ui, sans-serif;   /* next/font/local variable (IBM Plex Sans Thai / Noto Sans Thai) */
  --bn-border-radius: 8px;
  --bn-colors-editor-text: var(--mui-palette-text-primary);
  --bn-colors-editor-background: var(--mui-palette-background-paper);
  --bn-colors-menu-text: var(--mui-palette-text-primary);
  --bn-colors-menu-background: var(--mui-palette-background-paper);
  --bn-colors-hovered-background: var(--mui-palette-action-hover);
  --bn-colors-border: var(--mui-palette-divider);
  --bn-colors-selected-background: var(--mui-palette-primary-main);
  --bn-colors-selected-text: var(--mui-palette-primary-contrastText);
}
.bn-root .bn-default-styles.bn-default-styles { font-family: var(--bn-font-family); }   /* content font */
```
Pass `theme={resolvedScheme}` (`"light" | "dark"`, from `user_preferences.theme` / MUI `useColorScheme().mode` resolved
against `prefers-color-scheme` for "system"). Verified: light editor bg `rgb(255,255,255)`, text `rgba(0,0,0,.87)`; dark
bg `rgb(18,18,18)` text white; slash-menu portal `data-color-scheme="dark"` with same bg and Thai font. Highlight colours
(`--bn-colors-highlights-*`) keep BlockNote's light/dark defaults. Status/colour meaning in the editor is not used, so
SPEC §8.9 contrast applies only to our tokens. Do not use the `theme={{light,dark}}` object form (follows OS, §3.2).

---

## 11. Markdown shortcuts (FR-532) and block drag (FR-530) — built-in [V]

Input rules in 0.55 source (`find:` regexes) and Playwright results (typed into an empty paragraph):
`# ` → heading 1, `## ` → heading 2 (`### ` → 3; limited by `levels`), `- `/`+ `/`* ` → bullet, `1. ` → numbered,
`[] ` → check list (`[x] ` checked), `> ` → quote, ```` ``` ```` + space → code block (`language:""`), `---` → divider,
also `" ` (unicode quotation mark + space) → quote (quirk). Inline: `` `code` ``, `**bold**`, `*italic*` via tiptap marks.
Side menu: `+` (aria-label `เพิ่มบล็อก`) and a draggable drag-handle button (aria-label `ลากเพื่อย้าย / คลิกเพื่อเปิดเมนู`,
`draggable="true"`) appear on hover; the drag-handle menu has `ลบ`, `สี` (+ table header items). Side menu and formatting
toolbar are hidden while `editable=false`. Programmatic `moveBlocksUp/Down` verified. Undo/redo (Cmd/Ctrl+Z,
Shift+Cmd+Z) is ProseMirror-native inside the editor (verified) → the app's global UndoProvider must ignore key events
originating inside `.bn-editor` (PLAN §3.8 already says so).

---

## 12. Autosave, lock and read-only integration (FR-531, FR-540..543)

- `onChange` does **not** fire on mount (verified 0 saves after 1.2 s); it fires for every user and **programmatic**
  change (e.g. filling `pageId` after `/หน้า`, upload results) — fine — **and when `editable` toggles** with an
  unchanged document (verified `onChangeFired:1, docChanged:false`). ⇒ Dirty check before saving:
```ts
const baseline = useRef<string>("");                 // set right after editor creation: JSON.stringify(editor.document)
const save = useCallback(async () => {
  const json = JSON.stringify(editor.document);
  if (json === baseline.current) return;             // no-op for editable toggles, selection-only, etc.
  setStatus("saving");
  const res = await savePageContent({ pageId, version, content: JSON.parse(json) });   // server action
  if (res.ok) { baseline.current = json; setVersion(res.version); setStatus("saved"); }
  else if (res.code === "VERSION_CONFLICT") showConflictBanner(); else setStatus("error");
}, [editor, pageId, version]);
```
  Take the baseline from the **editor's own serialisation**, not from the DB: Postgres `jsonb` re-orders object keys, so
  a string compare against the server JSON would always look dirty (verified the editor round-trip preserves data; key
  order of hand-written JSON differs).
- Debounce 800 ms; flush on
  `editor.onFocusChange((_editor, { focused }) => { if (!focused) flush(); }, { includeEditorUI: true })` (signature
  compile-checked against 0.55 types [V]), on `visibilitychange` (hidden), and in the unmount cleanup (App-Router
  navigation keeps the JS context, the server action completes) [L]. On tab close, `fetch(..., { keepalive:true })`/`sendBeacon` bodies are limited to 64 KiB [L] →
  if dirty, use `beforeunload` `preventDefault()` to show the browser's "leave page?" prompt.
- FR-542 takeover: `await flush(); setEditable(false)` — the `editable` prop switch is live (verified
  `contenteditable="false"`, typing ignored, side menu hidden); the dirty check prevents a second, conflicting save.
- FR-510 locked wiki page / worker: `editable={canEdit && holdsLock}`; paste and drop are ignored when not editable
  (both plugins check `editor.isEditable`).
- FR-543 reload: remount/re-create the editor with the fresh content (§3.4).
- Wrap the editor in an **error boundary** and sanitise stored JSON before `initialContent` (drop unknown block types →
  paragraph with their text via `extractContentText`); `[]` → `undefined`.
- React 19 StrictMode (dev, App Router default): `useMemo` double-invocation creates a throw-away editor instance —
  harmless (1 `.bn-editor`, no warnings in harness and Next dev); make lock-heartbeat/autosave effects idempotent. [V]

---

## 13. Server-side validation & sanitisation of `pages.content` (zod outline) [L — schema not executed; rules derive from V facts]

BlockNote does not validate JSON props/hrefs on load (§4), and content can be POSTed directly to the server action, so
validate on every save:
```ts
const Styles = z.record(z.string(), z.union([z.boolean(), z.string().max(40)]));
const Text = z.object({ type: z.literal("text"), text: z.string().max(100_000), styles: Styles });
const Link = z.object({ type: z.literal("link"), href: z.string().max(2048).refine(isSafeHref), content: z.array(Text) });
const Mention = z.object({ type: z.literal("mention"), props: z.object({ kind: z.enum(["user", "page"]), id: z.string().max(64) }) });
const Inline = z.discriminatedUnion("type", [Text, Link, Mention]);
const Cell = z.object({ type: z.literal("tableCell"), props: z.object({ backgroundColor: z.string().max(20), textColor: z.string().max(20),
  textAlignment: z.enum(["left","center","right","justify"]), colspan: z.number().int().min(1).max(50).optional(),
  rowspan: z.number().int().min(1).max(500).optional() }).partial(), content: z.array(Inline) });
const TableContent = z.object({ type: z.literal("tableContent"), columnWidths: z.array(z.number().nullable()).optional(),
  headerRows: z.number().int().min(0).max(1).optional(), headerCols: z.number().int().min(0).max(1).optional(),
  rows: z.array(z.object({ cells: z.array(Cell).max(100) })).max(1000) });
const BLOCK_TYPES = ["paragraph","heading","bulletListItem","numberedListItem","checkListItem","toggleListItem","quote",
  "codeBlock","divider","table","image","file","subpage"] as const;
type BlockIn = { id: string; type: (typeof BLOCK_TYPES)[number]; props: Record<string, unknown>; content?: unknown; children: BlockIn[] };
const Block: z.ZodType<BlockIn> = z.lazy(() => z.object({ id: z.string().max(64), type: z.enum(BLOCK_TYPES),
  props: z.record(z.string(), z.unknown()), content: z.union([z.array(Inline), TableContent]).optional(),
  children: z.array(Block).max(1000) }));
export const PageContent = z.array(Block).max(5000);
```
Plus a pre-check **before** zod (iterative walk, no recursion): JSON byte size ≤ ~1.5 MB (and raise the Server Action
`bodySizeLimit`, §2.3), nesting depth ≤ 20, total blocks ≤ 5,000. Per-type prop rules: `heading.level ∈ {1,2,3}`;
`image.url`/`file.url` ∈ `"" | /^\/api\/files\/[0-9a-f-]{36}$/` (non-matching image → convert to link paragraph);
`subpage.pageId` ∈ `"" | uuid`; `isSafeHref`: `https?:`, `mailto:`, `tel:` or same-origin relative `/…`
(`javascript:` is rendered as `href=""` by BlockNote but would otherwise be **persisted** — verified). Then
`content_text = extractContentText(content)`, `version = version + 1` guarded by `WHERE version = $base`.
Optionally verify file ownership: every `/api/files/<id>` referenced must belong to the same page/project (prevents
embedding a file id from another project; download is re-authorised anyway, §7.6).
Duplicate (FR-508): remap `subpage.pageId` (and page mentions pointing at duplicated pages, if desired) with an
old→new id map (`collectMentionIds` + a pure `remapPageRefs(content, map)`), keep block ids (they're per-document).

Templates (FR-507, FR-402): hand-written **PartialBlock builders** in `src/i18n/templates.th.ts` (Thai text lives in
`src/i18n/`; import types only), e.g. charter table
`{ type:"table", content:{ type:"tableContent", headerRows:1, rows:[{cells:["หัวข้อ","รายละเอียด"]},{cells:["ลูกค้า",""]},…] } }`;
header-only tables from Appendix B get one empty body row. The server stores them as-is (ids get assigned on first
load/save) and computes `content_text` with the pure walker. Unit test: each template loads in a **headless
`BlockNoteEditor.create({ schema, initialContent })` under Vitest jsdom** (verified approach: 25 ms, ids assigned;
unknown types throw) + `content_text` snapshot. `blocksToMarkdownLossy` also works headless (e.g. for a debug dump).

---

## 14. Testing M4

### 14.1 Unit (Vitest)
- `src/lib/editor/content-text.test.ts` (§9 cases), `suggest.test.ts` (ranking + guards via a fake `tr` object),
  `tsv.test.ts` (quoted cells, CRLF, ragged rows → null, 1×n → null), `paste` helpers (`htmlHasText`,
  `externalImagesToLinks` under jsdom), `upload-rules.test.ts` (`classifyFile`), templates-valid test (headless editor
  in jsdom — needs `environment: "jsdom"` for that file; Node ≥ 22 has a read-only global `navigator` → use
  `Object.defineProperty` when shimming, verified).
- zod content schema tests: rejects `javascript:` hrefs, external image urls, depth > limit, unknown types.

### 14.2 E2E (Playwright) — techniques verified in Chromium
```ts
// paste (AC-502 Excel 4×3, AC-503 screenshot) — synthetic ClipboardEvent is honoured by BlockNote's paste plugin
async function paste(page: Page, items: Record<string, string>, files: { name: string; type: string; b64: string }[] = []) {
  await page.evaluate(({ items, files }) => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(items)) dt.setData(k, v);
    for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }));
    document.querySelector(".bn-editor")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { items, files });
}
await page.locator(".bn-editor").click();
await paste(page, { "text/html": EXCEL_HTML, "text/plain": EXCEL_TSV });           // → 1 table, 3 rows × 4 cols
await paste(page, {}, [{ name: "image.png", type: "image/png", b64: PNG_1x1 }]);   // → image block url /api/files/<uuid>
// drop (file attachment):
await page.evaluate(({ x, y }) => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([37,80,68,70])], "สัญญา.pdf", { type: "application/pdf" }));
  document.querySelector(".bn-editor")!.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true })); }, pos);
// slash (AC-501/504): Thai typing works with keyboard.type
await page.keyboard.type("/ตาราง"); await page.locator(".bn-suggestion-menu").waitFor(); await page.keyboard.press("Enter");
// item titles: .bn-mt-suggestion-menu-item-title · group labels: .bn-suggestion-menu-label
// table handles: .bn-table-handle → menu .bn-table-handle-menu → getByText("เพิ่มคอลัมน์ทางขวา")
// side menu: .bn-side-menu button[aria-label="เพิ่มบล็อก"] · formatting toolbar: .bn-formatting-toolbar
// read-only: expect(page.locator(".bn-editor")).toHaveAttribute("contenteditable", "false")   (AC-505)
```
- Assert persistence by reading the DB/API after reload, or `window.__bn?.document` only in a test build
  (don't ship a global in production; gate behind `process.env.NEXT_PUBLIC_E2E`).
- AC-503's "worker opens image URL directly → 404" is an API test against `/api/files/:id`.
- Excel fixture HTML (Windows Excel 15 clipboard with `<!--StartFragment-->`, `class=xl65` header style) and the matching
  TSV are in `fixtures/excel.html`, `fixtures/excel.tsv`, Google Sheets in `fixtures/gsheets.html` — copy into
  `e2e/fixtures/`.
- Dev-server gotcha: `next dev` blocks `/_next/*` dev resources for origin `127.0.0.1` when it serves as `localhost`
  ("Blocked cross-origin request … add it to allowedDevOrigins") and the dynamic editor chunk never mounted → use
  `baseURL: "http://localhost:3000"` or `allowedDevOrigins: ["127.0.0.1"]`. [V]

---

## 15. Known issues / gotchas (evidence-backed)

| # | issue | evidence | mitigation |
|---|---|---|---|
| G1 | SSR crash (`window is not defined`) | `next build` prerender error | client component + `dynamic(ssr:false)` in a Client Component [V] |
| G2 | stock paste loses Excel tables when TSV looks like markdown; TSV-only → paragraph | Playwright paste matrix §7.3 | custom pasteHandler [V] |
| G3 | stock paste/drop hot-links external images | `images:["https://example.com/cat.png"]`, drop test | pasteHandler + server sanitiser + onChange fix [V] |
| G4 | `/หน้า` picks `ย่อหน้า` | test titles `["ย่อหน้า","หน้า"]` before fix | ranked filter [V] |
| G5 | `10:30`→`10🕒`, `1/2`→Heading 2 | emoji-probe | `atWordStart` guards [V] |
| G6 | default `/table` = 2×3 | `getDefaultSlashMenuItems.ts` | custom 3×3 item [V] |
| G7 | no file size in stock file block | `File/block.ts` propSchema | custom `file` block [V] |
| G8 | Embed-URL tab in FilePanel | `FilePanel.tsx` | UploadOnlyFilePanel [V] |
| G9 | uploadFile rejection → unhandled rejection on drop | `pageerror` in drop test | never reject [V] |
| G10 | `useUploadLoading` race for React custom blocks | indicator 0 → 1 after fix | external store [V] |
| G11 | `onChange` on `editable` toggle | probe3 | dirty check [V] |
| G12 | `initialContent` `[]` or unknown type throws → tree unmount | reload test, headless check | sanitise + error boundary [V] |
| G13 | content font ignores `--bn-font-family` | computed style | `.bn-default-styles` override [V] |
| G14 | object `theme` follows OS scheme | `BlockNoteView.tsx` (mantine) | string theme + CSS vars [V] |
| G15 | viewport-meta console warning | harness console | `viewport.interactiveWidget` [V] |
| G16 | `Cmd/Ctrl+K`: BlockNote's link popover (only while text is selected) calls `preventDefault` but not `stopPropagation` | window listener saw `defaultPrevented:true` with selection, `false` without | global palette hotkey must `return` when `e.defaultPrevented` [V] |
| G17 | links open in a new window by default, also for `/p/...` | probe5 (2 pages) | `links.onClick` → `router.push` for same-origin [V] |
| G18 | JSON props/hrefs not validated on load | headless + probe5 | zod + sanitiser (§13) [V] |
| G19 | tiptap paste rules italicise `* … *` even for plain text | probe7 | accept (minor) [V] |
| G20 | emoji search is English-only (emoji-mart index) | emoji-mart init `locale` default `en` | accept; or remove emoji picker entirely (optional) [L] |
| G21 | React 19 + tiptap `flushSync` warnings are a known upstream topic ("flushSync was called from inside a lifecycle method"); BlockNote 0.55 has guards (`useNodeViewBlock`) | web search; none observed in our runs (0 console warnings in Next dev/prod) | monitor e2e console [L] |
| G22 | Mantine CSS adds ≈ 38 KB gzip; all component CSS imported | bundle measurement | acceptable; lazy with the editor chunk [V] |
| G23 | `SuggestionMenuController getItems` inline arrow → effect re-runs every render | `useLoadSuggestionMenuItems.ts` deps | `useCallback` [V code-read] |
| G24 | Server Actions default body limit 1 MB | Next `action-handler.js` | raise limit + zod size cap [V code-read] |

Collaboration/Yjs: not needed (Phase 2); Yjs peers are optional in 0.55 and nothing is pulled in. [V]

---

## 16. Cross-cutting findings for other milestones (found while verifying)

- **Next 16.3 `next dev` auto-edits `CLAUDE.md`/`AGENTS.md`** when it detects an AI coding agent
  (`dist/server/lib/generate-agent-files.js`: if `CLAUDE.md` exists → upsert a `<!-- BEGIN:nextjs-agent-rules -->` block;
  if neither exists → create both). Observed: "Generated AGENTS.md and CLAUDE.md for AI agents. Set `agentRules: false` in
  next.config to disable." ⇒ **M0 must set `agentRules: false` in `next.config.ts`** (typed option, verified accepted by
  `next build`), otherwise the project's CLAUDE.md gets modified on the first `pnpm dev`. Next also ships version-matched
  docs in `node_modules/next/dist/docs/` — useful reference for implementers. [V]
- MUI **v9** removed system props on `Stack` (`<Stack gap={2}>` → TS2769 in `next build`); use `spacing` or `sx`. [V]
- `@mui/material-nextjs` 9.4.0 provides `v16-appRouter` (`AppRouterCacheProvider`) — used in the probe. [V]
- `npm view typescript` latest = **7.0.2** (native compiler). The probe used `typescript@5.9.3` for Next's type-check
  (worked); TS 7 type-checked the harness fine but it emitted TS2882 for CSS side-effect imports without a
  `declare module "*.css"` (Next's `next-env.d.ts`/global types normally cover it) — r1 should decide the TS pin. [V]
- `output: "standalone"`: `next start` warns ("does not work with output: standalone"); run
  `node .next/standalone/server.js` and copy `.next/static` (+ `public`) as in the Dockerfile. [V]
- pnpm 12.8.1 install verified ("Lockfile passes supply-chain policies"). [V]

---

## 17. Suggested file layout & work breakdown for the editor-engineer (M4)

```
src/components/editor/
  EditorClient.tsx          "use client" + next/dynamic(ssr:false) + MUI Skeleton
  PageEditor.tsx            useCreateBlockNote + BlockNoteView(mantine) + controllers + autosave + lock-driven editable
  editor-theme.css          §10 bridge
  schema.ts                 §4.1
  blocks/subpage.tsx        §4.2
  blocks/attachment.tsx     §4.4
  inline/mention.tsx        §4.3
  slash-menu.tsx            §5.2
  UploadOnlyFilePanel.tsx   §8.2
  EditorErrorBoundary.tsx   §12
src/lib/editor/             (pure/unit-tested unless noted)
  content-text.ts (+test)   §9      — also imported by server code
  suggest.ts (+test)        §5.1
  tsv.ts (+test)            §7.4
  paste.ts                  §7.4 (client; DOM helpers tested in jsdom)
  upload.ts                 §8.2 (client; classifyFile rules shared with server allow-lists)
  dictionary.ts             §6 (client)
  sanitize-content.ts       §13 (server+client: unknown types, external images, hrefs)
src/i18n/th.ts              th.editor.blocknote (Dictionary) + custom editor strings
src/i18n/templates.th.ts    Appendix B builders (PartialBlock[])
src/server/validation/page-content.ts   zod schema + pre-checks (§13)
```
Order: schema + dictionary + client-only mount (smoke) → slash/mention/guards → paste/TSV → upload (needs `/api/files`
from the backend slice) → subpage (needs create-child-page action + page summary API) → autosave/lock/read-only →
content_text + validation on save (backend) → templates → e2e `m4-pages.spec.ts` (AC-501..505).

Decisions to record in `PROGRESS.md` (suggested wording):
- Deviation §7.1 Editor: `@blocknote/shadcn` → `@blocknote/mantine` (+ `@mantine/core`/`@mantine/hooks` 9.6.3) because the
  UI kit is MUI (owner decision 2026-09-30); shadcn variant requires Tailwind v4/base-ui; Mantine is BlockNote's default UI,
  scoped CSS, themed via `--bn-*` variables.
- Decisions: `/ตาราง` inserts 3×3 · slash/emoji/mention open only at word start · ranked slash filter · headings H1–H3, no
  toggle headings, no video/audio blocks, no code highlighting · tables: header row/col + cell background only (no
  merge/split, no cell text colour) · custom `file` block with `size` · no Embed-URL tab; external images become links ·
  deleting a sub-page card does not delete the page; moving a page leaves existing cards (they still link) · text/plain
  pastes keep BlockNote's markdown interpretation · emoji picker kept (guarded) — or removed if the owner prefers.

---

## 18. Evidence index (all under `…/scratchpad/r3-blocknote/`)

| what | path |
|---|---|
| installed packages (npm) | `node_modules/@blocknote/{core,react,mantine,server-util,ariakit}` 0.55.0, `@mantine/*` 9.6.3 |
| harness (React 19 StrictMode, esbuild) | `harness/src/**` (Editor.tsx, schema.ts, slashMenu.tsx, blocks/, inline/, lib/), `harness/build.mjs` |
| Playwright suite (41 checks, all green) | `tests/run.mjs`, log `tests/run-final.log` |
| extra probes | `tests/emoji-probe.mjs`, `tests/probe2..7.mjs`, `tests/roundtrip.mjs`, `tests/capture-doc.mjs`, `tests/next-probe.mjs` |
| screenshots | `tests/shot-empty.png`, `tests/shot-image-selected.png` |
| unit tests (15, all green) | `nodecheck/contentText.test.ts`, `nodecheck/suggest.test.ts` (`node --test`) |
| headless schema validation | `nodecheck/validate.tsx` → `validate.mjs` |
| Next 16 probe (npm) | `next-app/` (build, `next start`, `next dev`), variant that fails SSR: `direct-variant-disabled/` |
| Next 16 probe (pnpm 12 + standalone) | `next-app-pnpm/` |
| bundle comparison | `sizecmp/` |
| fixtures | `fixtures/excel.html`, `fixtures/excel.tsv`, `fixtures/gsheets.html`, `fixtures/complex-doc.json` |
| key source files read | core: `editor/BlockNoteEditor.ts(.d.ts)`, `api/clipboard/fromClipboard/{pasteExtension,handleFileInsertion,fileDropExtension,acceptedMIMETypes}.ts`, `api/parsers/markdown/detectMarkdown.ts`, `extensions/SuggestionMenu/{SuggestionMenu,getDefaultSlashMenuItems,getDefaultEmojiPickerItems}.ts`, `extensions/Placeholder/Placeholder.ts`, `blocks/{defaultBlocks,Table/block,Table/TableExtension,Image/block,File/block,Heading/block}.ts`, `i18n/locales/en.ts`, `editor/editor.css`; react: `hooks/useCreateBlockNote.tsx`, `editor/{BlockNoteView,BlockNoteDefaultUI,ElementRenderer}.tsx`, `schema/{ReactBlockSpec,ReactInlineContentSpec}.tsx`, `components/SuggestionMenu/**`, `components/FilePanel/**`, `components/TableHandles/**`, `components/FormattingToolbar/**`, `hooks/useUploadLoading.ts`; mantine: `BlockNoteView.tsx`, `BlockNoteTheme.ts`, `mantineStyles.css`, `blocknoteStyles.css`; next: `dist/server/lib/generate-agent-files.js`, `dist/server/config-shared.d.ts`, `dist/server/app-render/action-handler.js` |
| web | blocknotejs.org/docs/getting-started/nextjs, /docs/features/localization, /pricing; github.com/TypeCellOS/BlockNote/releases |

## M11 addendum — S5.1 spike results (2026-11-02, BlockNote 0.55)

- **(a) Islands:** the M10 `selectable: false` isolation (`LiveBlockFrame`) is reused for the database block; native
  `stopPropagation` on the island stays forbidden for the events BlockNote needs (M10-D8) — the frame filters by target.
- **(b) Clipboard:** BlockNote's copy / cut handler calls `clipboardData.clearData()`, so custom MIME types
  (`application/x-teamos-databases+json`) are added in a **bubble-phase** listener after it; block props appear as
  `data-*` attributes in the `blocknote/html` flavour (the paste side reads them there).
- **(c) Inline content:** `updateInlineContent` is available in the inline-content render props (inline equation edits).
- **(d) Toolbar:** `FormattingToolbar` + `getFormattingToolbarItems()` keeps the default items; the "สมการ" button is
  appended (`formattingToolbar={false}` + `FormattingToolbarController`).
- **(e) Tests:** headless editors cannot undo — mount with `editor.mount(div)`; a real `BlockNoteView` renders in jsdom
  once `window.matchMedia` is stubbed.
