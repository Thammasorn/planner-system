'use client'
// src/components/editor/PageEditor.tsx — the BlockNote page editor (PLAN §3.11, FR-520…543). Loaded only through
// EditorClient's next/dynamic({ ssr: false }) chunk (BlockNote needs `window`). From
// plan/research/snippets/r3/harness/src/Editor.tsx with the app's data layer (TanStack Query, server actions).
import './editor-theme.css' // before BlockNote's CSS (doubled selectors win regardless of order, r3 §10)
import '@blocknote/mantine/style.css' // never BlockNote's bundled Inter font CSS (Thai font stack, r3 §2)
import { BlockNoteView } from '@blocknote/mantine'
import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react'
import Box from '@mui/material/Box'
import { useColorScheme } from '@mui/material/styles'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { PageEditorProps, PageView } from '@/lib/contracts/pages'
import { thaiDictionary } from '@/lib/editor/dictionary'
import { resolveLinkTarget } from '@/lib/editor/links'
import { makePasteHandler } from '@/lib/editor/paste'
import { findForeignMedia, foreignMediaReplacement, prepareInitialContent } from '@/lib/editor/sanitize'
import { atWordStart } from '@/lib/editor/suggest'
import { makeUploadFile, registerUploadEditor } from '@/lib/editor/upload'
import { invalidatePages } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import { isBlankPage } from '@/lib/pages/blank'
import { isSafeHref } from '@/lib/schemas/page-content'
import { createPage } from '@/server/actions/pages'
import { EditorBanners } from './EditorBanners'
import { useEditLease } from './lease/useEditLease'
import { MentionMenu } from './mention-menu'
import { SaveStatus } from './SaveStatus'
import { type AppEditor, schema } from './schema'
import { SlashMenu, type SlashCtx } from './slash-menu'
import { UploadOnlyFilePanel } from './UploadOnlyFilePanel'
import { type Autosave, useAutosave } from './useAutosave'

/** The shell-facing props: the contract plus page-shell callbacks (kept out of the shared contract). */
export interface PageEditorShellProps extends PageEditorProps {
  /** After every local document change: whether the document is still blank (template chooser, M4-D7). */
  onBlankChange?: (blank: boolean) => void
  /** Page-header element the save status is portalled into (SPEC §7: it stays with the header); inline when absent. */
  saveStatusSlot?: HTMLElement | null
}

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
  const { pageId, space, projectId, canEdit, uploadLimits } = props
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
      dictionary: thaiDictionary,
      initialContent,
      uploadFile: makeUploadFile({ pageId, notify, limits: uploadLimits }),
      pasteHandler: makePasteHandler({ notify, limits: uploadLimits }),
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
    [pageId, doc.load],
  )
  useEffect(() => registerUploadEditor(pageId, editor), [pageId, editor])

  const reload = useCallback(async (): Promise<void> => {
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
    getVersion: () => saveRef.current?.getVersion() ?? props.version,
    isDirty: () => saveRef.current?.isDirty() ?? false,
    flush: () => saveRef.current?.flush() ?? Promise.resolve(),
    onRemoteVersion: () => reload(),
  })
  const save = useAutosave({
    editor,
    pageId,
    version: doc.version,
    // Displaced with unsaved work: keep saving (and retrying) it — accepted while our version is current (X63, FR-542).
    enabled: canEdit && (lease.mode === 'editing' || lease.unsaved),
    onLease: lease.report,
  })
  useEffect(() => {
    saveRef.current = save
  })

  const editable = canEdit && lease.mode === 'editing' && save.blocked === false

  const slashCtx = useMemo<SlashCtx>(
    () => ({
      canCreateSubpage: canEdit && props.depth <= MAX_PARENT_DEPTH,
      createSubpage: async () => {
        try {
          const res = await unwrap(createPage({ space, projectId, parentId: pageId }))
          void invalidatePages(qc, { space, projectId })
          return res.page.id
        } catch {
          notify(th.pages.toasts.createFailed)
          return null
        }
      },
    }),
    [canEdit, props.depth, space, projectId, pageId, qc],
  )

  return (
    <Box data-testid="page-editor" data-editable={editable} data-lease-mode={lease.mode}>
      <EditorBanners lease={lease} blocked={save.blocked} onReload={() => void reload()} />
      {props.saveStatusSlot ? (
        createPortal(<SaveStatus state={save.status} pending={save.pending} />, props.saveStatusSlot)
      ) : (
        <SaveStatus state={save.status} pending={save.pending} />
      )}
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={scheme}
        aria-label={th.editor.label}
        slashMenu={false}
        emojiPicker={false}
        filePanel={false}
        comments={false}
        onChange={() => {
          if (editor.isEditable) fixForeignMedia(editor)
          save.schedule()
          props.onBlankChange?.(isBlankPage({ title: '', content: editor.document }))
        }}
      >
        <SlashMenu editor={editor} ctx={slashCtx} />
        <GridSuggestionMenuController
          triggerCharacter=":"
          columns={10}
          minQueryLength={2}
          shouldOpen={atWordStart}
        />
        <MentionMenu editor={editor} />
        <FilePanelController filePanel={UploadOnlyFilePanel} />
      </BlockNoteView>
    </Box>
  )
}
