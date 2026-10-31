'use client'
import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { EditorClient } from '@/components/editor/EditorClient'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import type { PageView } from '@/lib/contracts/pages'
import { invalidatePage, invalidatePages } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import { PageBreadcrumbs } from './Breadcrumbs'
import { CoverImage } from './CoverImage'
import { IconPicker } from './IconPicker'
import { PageActionsMenu } from './PageActionsMenu'
import { PageTitle } from './PageTitle'
import { TemplateChooser } from './TemplateChooser'

/** Focuses the editable editor inside `box`; false when there is none (still loading, read-only, no lease). */
function focusEditable(box: HTMLElement | null): boolean {
  const el = box?.querySelector<HTMLElement>('.bn-editor[contenteditable="true"]')
  el?.focus()
  return el != null
}

/**
 * 🔒 of the header (FR-510, M4-D24): the page's own lock (optimistic) or one inherited from an ancestor. The server
 * reports only the combined `effectiveProtected`, so the inherited part is known only from a reading taken while the
 * page itself was unlocked; until then (own lock just removed) the 🔒 stays — never shown unprotected by mistake.
 */
export function headerProtected(locked: boolean, server: { locked: boolean; effective: boolean }): boolean {
  if (locked) return true
  return server.locked ? true : server.effective
}

/** Readable column on wide screens, full width on phones (NFR-07b). */
export const PAGE_MAX_WIDTH = 900

/**
 * `/p/[pageId]` client shell (FR-504…510): cover, icon + title, breadcrumb, page menu, protected / archived banners,
 * the template chooser on blank pages and the editor. Header fields are local state seeded from the RSC `PageView`
 * and updated from action results (M4-D29: no refresh()).
 */
export function PageScreen({ view }: { view: PageView }) {
  const { page, can } = view
  const qc = useQueryClient()
  const [title, setTitle] = useState(page.title)
  const [icon, setIcon] = useState(page.icon)
  const [cover, setCover] = useState(page.cover)
  const [locked, setLocked] = useState(page.locked)
  /** Last server reading of the protection (the RSC view, then a re-read after each saved protect toggle). */
  const [serverProt, setServerProt] = useState({ locked: page.locked, effective: page.effectiveProtected })
  const [reloadToken, setReloadToken] = useState(0)
  const [chooserDismissed, setChooserDismissed] = useState(false)
  /** Where focus goes after the chooser row unmounts under the pressed button (never left on <body>). */
  const [focusReq, setFocusReq] = useState<{ n: number; to: 'title' | 'editor' }>({ n: 0, to: 'title' })
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const editorBox = useRef<HTMLDivElement>(null)
  const scope = { space: page.space, projectId: page.projectId }
  const effectiveProtected = headerProtected(locked, serverProt)

  const rereadProtection = async () => {
    try {
      const fresh = await qc.query({
        queryKey: qk.page(page.id),
        queryFn: ({ signal }) => getJson<PageView>(`/api/pages/${page.id}`, { signal }),
        staleTime: 0,
      })
      setServerProt({ locked: fresh.page.locked, effective: fresh.page.effectiveProtected })
    } catch {
      // keep the conservative 🔒; the tree row (refetched) and the next visit show the server state
    }
  }

  useEffect(() => {
    if (focusReq.n === 0) return
    if (focusReq.to === 'editor' && focusEditable(editorBox.current)) return
    titleRef.current?.focus() // after a template the title is re-mounted (key) — the ref is the new one here
  }, [focusReq])
  const requestFocus = (to: 'title' | 'editor') => setFocusReq((r) => ({ n: r.n + 1, to }))

  // Hidden once the page has a title or content (typed in the editor before its autosave, M4-D7).
  const showChooser = page.isBlank && can.edit && !chooserDismissed && title === ''

  const focusEditor = () => {
    focusEditable(editorBox.current)
  }

  return (
    <Box sx={{ pb: 8 }}>
      <Box sx={{ maxWidth: PAGE_MAX_WIDTH, mx: 'auto', px: { xs: 2, sm: 3 } }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 40, py: 1 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <PageBreadcrumbs
              space={page.space}
              projectId={page.projectId}
              projectName={page.projectName}
              crumbs={view.breadcrumb}
              current={{ title, icon }}
            />
          </Box>
          <PageActionsMenu
            page={{
              id: page.id,
              title,
              space: page.space,
              projectId: page.projectId,
              isCharter: page.isCharter,
              locked,
            }}
            can={can}
            navigateAfterDelete
            onProtectedChange={setLocked}
            onProtectedSaved={() => void rereadProtection()}
          />
        </Stack>
        <CoverImage
          pageId={page.id}
          cover={cover}
          canEdit={can.edit}
          uploadLimits={view.uploadLimits}
          onChange={setCover}
        />
        <Stack spacing={1} sx={{ pt: 2 }}>
          <IconPicker pageId={page.id} icon={icon} canEdit={can.edit} scope={scope} onChange={setIcon} />
          <PageTitle
            key={reloadToken}
            pageId={page.id}
            value={title}
            canEdit={can.edit}
            scope={scope}
            onChange={setTitle}
            onEnter={focusEditor}
            inputRef={titleRef}
          />
          {effectiveProtected ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                color: 'text.secondary',
                fontSize: '0.875rem',
              }}
            >
              <span role="img" aria-label={th.pages.protectedIcon} style={{ display: 'inline-flex' }}>
                <LockOutlined fontSize="inherit" />
              </span>
            </Box>
          ) : null}
          {effectiveProtected && !can.edit ? (
            <Alert severity="info" icon={<LockOutlined fontSize="inherit" />}>
              {th.pages.protectedBanner}
            </Alert>
          ) : null}
          {page.projectArchived ? (
            <Alert severity="warning" icon={<Inventory2Outlined fontSize="inherit" />}>
              {th.pages.archivedBanner}
            </Alert>
          ) : null}
          {showChooser ? (
            <TemplateChooser
              pageId={page.id}
              version={page.version}
              onDismiss={() => {
                setChooserDismissed(true)
                requestFocus('editor') // ว่าง → start writing
              }}
              onApplied={(r) => {
                setTitle(r.title)
                setIcon(r.icon)
                setChooserDismissed(true)
                setReloadToken((n) => n + 1)
                void invalidatePages(qc, scope)
                void invalidatePage(qc, page.id)
                requestFocus('title') // SOP: type the empty title; others: Enter goes on into the content
              }}
            />
          ) : null}
        </Stack>
        <Box ref={editorBox} sx={{ pt: 2, mx: { xs: -1, sm: -6 } }}>
          <EditorClient
            pageId={page.id}
            space={page.space}
            projectId={page.projectId}
            depth={page.depth}
            initialContent={page.content}
            version={page.version}
            canEdit={can.edit}
            uploadLimits={view.uploadLimits}
            reloadToken={reloadToken}
            // only while the chooser is up: the check reads the whole document on every change
            onBlankChange={
              showChooser
                ? (blank) => {
                    if (!blank) setChooserDismissed(true)
                  }
                : undefined
            }
          />
        </Box>
      </Box>
    </Box>
  )
}
