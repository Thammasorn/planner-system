'use client'
// src/components/editor/PageEditor.tsx — the BlockNote page editor (PLAN §3.11, FR-520…543). Loaded only through
// EditorClient's next/dynamic({ ssr: false }) chunk (BlockNote needs `window`). From
// plan/research/snippets/r3/harness/src/Editor.tsx with the app's data layer (TanStack Query, server actions).
// M6.1-D8 (task bodies): `pageId` may be null until the first focus / input / paste / drop / upload calls
// `ensurePageId` once (memoised); then the lease is requested (`leaseAcquire 'focus'`) and autosave sends what was
// typed meanwhile. The BlockNote instance is keyed by `editorKey` (never re-created when the id arrives). TASK bodies:
// no sub-page item / cards (FR-680), their own empty-document placeholder, `variant` page | compact.
// M11: DB_ROW bodies (row pages, FR-1453) — no sub-page and no database blocks (M11-D38); the slash "ฐานข้อมูล" group
// creates databases (FR-1404); copy/cut adds the database clipboard type and a paste deep-copies database blocks
// (M11-D13); the formatting toolbar gains "สมการ" (FR-1502); custom blocks read the page context (kind, getPageId,
// canEdit, variant).
import './editor-theme.css' // before BlockNote's CSS (doubled selectors win regardless of order, r3 §10)
import '@blocknote/mantine/style.css' // never BlockNote's bundled Inter font CSS (Thai font stack, r3 §2)
import { BlockNoteView } from '@blocknote/mantine'
import {
  FilePanelController,
  FormattingToolbarController,
  GridSuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import Box from '@mui/material/Box'
import { useColorScheme } from '@mui/material/styles'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  type JSX,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { DbViewType } from '@/lib/contracts/databases'
import type { PageEditorProps, PageView } from '@/lib/contracts/pages'
import { databaseTitleOf } from '@/lib/editor/database-block-state'
import { databaseIdsInHtml, writeDatabaseClip } from '@/lib/editor/database-clipboard'
import { makeDatabasePasteHook } from '@/lib/editor/database-copy-flow'
import { dictionaryFor } from '@/lib/editor/dictionary'
import { resolveLinkTarget } from '@/lib/editor/links'
import { makePasteHandler } from '@/lib/editor/paste'
import { findForeignMedia, foreignMediaReplacement, prepareInitialContent } from '@/lib/editor/sanitize'
import { atWordStart } from '@/lib/editor/suggest'
import { replaceDatabasesWithParagraphs, replaceSubpagesWithMentions } from '@/lib/editor/task-body'
import { makeUploadFile, registerUploadEditor } from '@/lib/editor/upload'
import { invalidatePages } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import { isBlankPage } from '@/lib/pages/blank'
import { isSafeHref } from '@/lib/schemas/page-content'
import { copyDatabase, createDatabase } from '@/server/actions/databases'
import { createPage } from '@/server/actions/pages'
import { EditorBanners } from './EditorBanners'
import { AppFormattingToolbar } from './formatting-toolbar'
import { LeaseBadge } from './lease/LeaseBadge'
import { useEditLease } from './lease/useEditLease'
import { MentionMenu } from './mention-menu'
import { PageEditorContext, type PageEditorContextValue } from './PageEditorContext'
import { SaveStatus } from './SaveStatus'
import { type AppEditor, schema } from './schema'
import { SlashMenu, type SlashCtx } from './slash-menu'
import { AppSideMenuController } from './side-menu'
import { UploadOnlyFilePanel } from './UploadOnlyFilePanel'
import { type Autosave, useAutosave } from './useAutosave'
import { useLazyPageId } from './useLazyPageId'

/** The shell-facing props: the contract plus page-shell callbacks (kept out of the shared contract). */
export interface PageEditorShellProps extends PageEditorProps {
  /** After every local document change: whether the document is still blank (template chooser, M4-D7). */
  onBlankChange?: (blank: boolean) => void
  /** Page-header element the save status is portalled into (SPEC §7: it stays with the header); inline when absent. */
  saveStatusSlot?: HTMLElement | null
  /** M6.1-D26: header element the compact LeaseBadge (held / view-only) is portalled into; inline banner when absent. */
  leaseSlot?: HTMLElement | null
  /** After every local document change, with the document (TaskBody derives hasBody from it, FR-691). */
  onDocumentChange?: (doc: unknown[]) => void
  /** After every successful save: saved document + new version (TaskBody keeps qk.taskBody in step). */
  onSaved?: (r: { content: unknown[]; version: number }) => void
  /** `focus()` puts the caret into the editor (Enter in the task page title, FR-683). */
  focusHandle?: Ref<{ focus(): void }>
}

/** Thai message of a failed action, or the fallback. */
const messageOf = (err: unknown, fallback: string): string =>
  err instanceof ActionFailure && err.message !== '' ? err.message : fallback

/** Native events that mean "the user starts working in the body" (M6.1-D8). Capture phase: before ProseMirror. */
const ACTIVATING_EVENTS = ['focusin', 'beforeinput', 'paste', 'drop'] as const

/** FR-502: depth 0…9 → a page at depth 9 cannot get children. */
const MAX_PARENT_DEPTH = 8

const notify = (message: string): void => {
  toast.error(message)
}

/** Client post-fix for external images that bypass the paste handler (drag & drop from another tab, r3 §8.3). */
function fixForeignMedia(editor: AppEditor): void {
  for (const id of findForeignMedia(editor.document)) {
    const block = editor.getBlock(id)
    if (block) editor.replaceBlocks([id], [foreignMediaReplacement(block)])
  }
}

export default function PageEditor(props: PageEditorShellProps): JSX.Element {
  const { space, projectId, canEdit, uploadLimits } = props
  // M6.1-D8 contract with DOC defaults (M4 behaviour) until every call site passes them (PageScreen: S4).
  const kind = props.kind ?? 'DOC'
  const leaseAcquire = props.leaseAcquire ?? 'mount'
  const variant = props.variant ?? 'page'
  const editorKey = props.editorKey ?? props.pageId ?? ''
  const lazy = useLazyPageId({ pageId: props.pageId, ensurePageId: props.ensurePageId, canEdit, notify })
  const { pageId, getPageId, peekPageId } = lazy
  const router = useRouter()
  const qc = useQueryClient()
  const { mode, systemMode } = useColorScheme()
  const scheme: 'light' | 'dark' = (mode === 'system' ? systemMode : mode) === 'dark' ? 'dark' : 'light'

  // Re-created (never replaceBlocks) on reload so undo history cannot go back into a stale version (r3 §3.4).
  const [doc, setDoc] = useState({ content: props.initialContent, version: props.version, load: 0 })
  const initialContent = useMemo(() => prepareInitialContent(doc.content), [doc.content])

  const editor = useCreateBlockNote(
    {
      schema,
      dictionary: dictionaryFor(kind),
      initialContent,
      // getPageId is stable and resolves the id when it arrives later (uploads of a new task body await it)
      uploadFile: makeUploadFile({ getPageId, editorKey, notify, limits: uploadLimits }),
      pasteHandler: makePasteHandler({
        notify,
        limits: uploadLimits,
        kind,
        databaseTitle: databaseTitleOf,
        // M11-D13: database blocks a paste inserted → copy or keep (getPageId: a task body creates its row first)
        onDatabaseBlocksPasted: makeDatabasePasteHook({
          currentPageId: peekPageId,
          getPageId,
          copyDatabase: (input) => unwrap(copyDatabase(input)),
          notify,
        }),
      }),
      tables: { headers: true, cellBackgroundColor: true, cellTextColor: false, splitCells: false },
      links: {
        isValidLink: isSafeHref, // the same rule the server enforces on save (M4-D9)
        onClick: (event: MouseEvent) => {
          const a = event.target instanceof Element ? event.target.closest('a') : null
          const target = resolveLinkTarget(a?.getAttribute('href') ?? '', window.location.origin)
          if (target?.kind === 'internal') router.push(target.path)
          else if (target?.kind === 'external') window.open(target.href, '_blank', 'noopener')
          return true
        },
      },
    },
    [editorKey, doc.load],
  )
  useEffect(() => registerUploadEditor(editorKey, editor), [editorKey, editor])
  useImperativeHandle(props.focusHandle, () => ({ focus: () => editor.focus() }), [editor])

  const reload = useCallback(async (): Promise<void> => {
    if (pageId === null) return // nothing stored yet
    try {
      const view = await qc.query({
        queryKey: qk.page(pageId),
        queryFn: ({ signal }) => getJson<PageView>(`/api/pages/${pageId}`, { signal }),
        staleTime: 0,
      })
      setDoc((d) => ({ content: view.page.content, version: view.page.version, load: d.load + 1 }))
    } catch (err) {
      notify(err instanceof Error && err.message !== '' ? err.message : th.errors.INTERNAL)
    }
  }, [qc, pageId])

  // After applyTemplate the shell bumps reloadToken (S3.4): fetch fresh content once per token.
  const handledToken = useRef(0)
  const { reloadToken } = props
  useEffect(() => {
    if (reloadToken <= handledToken.current) return
    handledToken.current = reloadToken
    const t = setTimeout(() => void reload(), 0)
    return () => clearTimeout(t)
  }, [reloadToken, reload])

  // Lease ↔ autosave: each needs the other's latest callbacks; bridged through a ref set after render.
  const saveRef = useRef<Autosave | null>(null)
  const lease = useEditLease({
    pageId,
    canEdit,
    acquire: leaseAcquire,
    getVersion: () => saveRef.current?.getVersion() ?? props.version,
    isDirty: () => saveRef.current?.isDirty() ?? false,
    flush: () => saveRef.current?.flush() ?? Promise.resolve(),
    onRemoteVersion: () => reload(),
  })
  // 'idle' (TASK, lease not requested yet / in flight): editable and saved like 'editing' (X63: no lease needed).
  const leaseLetsEdit = lease.mode === 'editing' || lease.mode === 'idle'
  const save = useAutosave({
    editor,
    pageId,
    getPageId,
    version: doc.version,
    // Displaced with unsaved work: keep saving (and retrying) it — accepted while our version is current (X63, FR-542).
    enabled: canEdit && (leaseLetsEdit || lease.unsaved),
    onLease: lease.report,
    onSaved: props.onSaved,
  })
  useEffect(() => {
    saveRef.current = save
  })

  const editable = canEdit && leaseLetsEdit && save.blocked === false

  // M6.1-D8: first focus / input / paste / drop of a 'focus' body → ensure the row (memoised), then the lease.
  const activateRef = useRef<() => void>(() => {})
  useEffect(() => {
    activateRef.current = () => {
      if (!editable || leaseAcquire !== 'focus') return
      getPageId().catch(() => {}) // a failure is toasted by useLazyPageId; the next focus retries
      lease.activate() // POSTs now, or as soon as the id arrives
    }
  })
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = surface.current
    if (!el) return
    const on = (): void => activateRef.current()
    // M11-D13: bubble phase — BlockNote's copy handler (on the editor element inside) clears the clipboard first
    const onCopy = (e: ClipboardEvent): void => {
      const dt = e.clipboardData
      const sourcePageId = peekPageId()
      if (!dt || sourcePageId === null) return
      const ids = databaseIdsInHtml(dt.getData('blocknote/html'))
      if (ids.length > 0) writeDatabaseClip(dt, { v: 1, sourcePageId, cut: e.type === 'cut', ids })
    }
    for (const t of ACTIVATING_EVENTS) el.addEventListener(t, on, true)
    el.addEventListener('copy', onCopy)
    el.addEventListener('cut', onCopy)
    return () => {
      for (const t of ACTIVATING_EVENTS) el.removeEventListener(t, on, true)
      el.removeEventListener('copy', onCopy)
      el.removeEventListener('cut', onCopy)
    }
  }, [peekPageId])

  // M10/M11: the custom blocks read the page from here (they never store its id).
  const liveCtx = useMemo<PageEditorContextValue>(
    () => ({ pageId, editable, kind, canEdit, getPageId, variant }),
    [pageId, editable, kind, canEdit, getPageId, variant],
  )

  // M11 (FR-1404, M11-D10): the slash item's database — row of a task body first, then createDatabase; the answer
  // seeds qk.database so the block renders without a GET. null after a failure (toasted here or by getPageId).
  const createDatabaseFor = useCallback(
    async (view: DbViewType): Promise<string | null> => {
      let id: string
      try {
        id = await getPageId()
      } catch {
        return null
      }
      try {
        const res = await unwrap(createDatabase({ pageId: id, view }))
        qc.setQueryData(qk.database(id, res.databaseId), res.database)
        return res.databaseId
      } catch (err) {
        notify(messageOf(err, th.database.toasts.createFailed))
        return null
      }
    },
    [getPageId, qc],
  )

  const slashCtx = useMemo<SlashCtx>(
    () => ({
      kind,
      space,
      canEdit,
      canCreateSubpage: kind === 'DOC' && canEdit && props.depth <= MAX_PARENT_DEPTH,
      createSubpage: async () => {
        if (pageId === null) return null
        try {
          const res = await unwrap(createPage({ space, projectId, parentId: pageId }))
          void invalidatePages(qc, { space, projectId })
          return res.page.id
        } catch {
          notify(th.pages.toasts.createFailed)
          return null
        }
      },
      ...(canEdit && (kind === 'DOC' || kind === 'TASK') ? { createDatabase: createDatabaseFor } : {}),
    }),
    [kind, canEdit, props.depth, space, projectId, pageId, qc, createDatabaseFor],
  )

  return (
    <Box
      className="app-editor"
      data-testid="page-editor"
      data-kind={kind}
      data-variant={variant}
      data-editable={editable}
      data-lease-mode={lease.mode}
    >
      <EditorBanners
        lease={lease}
        blocked={save.blocked}
        onReload={() => void reload()}
        leaseInHeader={Boolean(props.leaseSlot)}
      />
      {props.leaseSlot
        ? createPortal(
            <LeaseBadge mode={lease.mode} lease={lease.lease} onTakeover={() => void lease.takeover()} />,
            props.leaseSlot,
          )
        : null}
      {props.saveStatusSlot ? (
        createPortal(<SaveStatus state={save.status} pending={save.pending} />, props.saveStatusSlot)
      ) : (
        <SaveStatus state={save.status} pending={save.pending} />
      )}
      <div ref={surface} className="app-editor-surface">
        <PageEditorContext value={liveCtx}>
          <BlockNoteView
            editor={editor}
            editable={editable}
            theme={scheme}
            aria-label={th.editor.label}
            slashMenu={false}
            formattingToolbar={false}
            sideMenu={false}
            emojiPicker={false}
            filePanel={false}
            comments={false}
            onChange={() => {
              if (editor.isEditable) {
                fixForeignMedia(editor)
                if (kind !== 'DOC') replaceSubpagesWithMentions(editor) // dropped / moved cards too (FR-680)
                // M11-D38: a database dropped into a row body becomes its title
                if (kind === 'DB_ROW' && replaceDatabasesWithParagraphs(editor, databaseTitleOf))
                  notify(th.editor.errors.databaseNotAllowed)
              }
              save.schedule()
              props.onBlankChange?.(isBlankPage({ title: '', content: editor.document }))
              props.onDocumentChange?.(editor.document)
            }}
          >
            <SlashMenu editor={editor} ctx={slashCtx} />
            <AppSideMenuController />
            <FormattingToolbarController formattingToolbar={AppFormattingToolbar} />
            <GridSuggestionMenuController
              triggerCharacter=":"
              columns={10}
              minQueryLength={2}
              shouldOpen={atWordStart}
            />
            <MentionMenu editor={editor} />
            <FilePanelController filePanel={UploadOnlyFilePanel} />
          </BlockNoteView>
        </PageEditorContext>
      </div>
    </Box>
  )
}
