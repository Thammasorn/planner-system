'use client'
// Command palette (FR-1102…1105, KEY-01, X08, X49, M10-D20…D24). Based on
// plan/research/snippets/r4/client/components/palette/CommandPalette.tsx with the open state from PaletteProvider
// (no own window listener) and data-driven groups (M4-D37e). M10: projects / people / clients are matched locally on
// every keystroke from the search index (NFR-06), tasks and pages come from GET /api/search 120 ms after the last
// keystroke (superseded requests are aborted by TanStack), and the "สร้าง task" steps (pick a project → name).
import { useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { toast } from 'sonner'
import { ColorSquare } from '@/components/common/ProjectChip'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { UNDO_TOAST_MS } from '@/components/undo/toastUndo'
import { UndoContext, type UndoEntry } from '@/components/undo/useUndo'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { SearchAllResponse, SearchIndexProject, SearchIndexResponse } from '@/lib/contracts/search'
import { invalidateTasks } from '@/lib/invalidate'
import { projectTasksHref } from '@/lib/nav/task-href'
import { qk } from '@/lib/query-keys'
import { matchLocal } from '@/lib/search/match'
import { normalizeQuery } from '@/lib/search/normalize'
import { createTask, deleteTaskTree, restoreTaskBatch } from '@/server/actions/tasks'
import { CommandsGroup } from './CommandsGroup'
import { useVisibleCommands } from './commands'
import { PALETTE_GROUPS, type PaletteItem } from './groups'
import { PaletteItemRow } from './PaletteItemRow'
import { usePalette, usePaletteMode, type PaletteMode } from './PaletteProvider'
import { useLocalMatches, useSearchIndex } from './useSearchIndex'
import styles from './CommandPalette.module.css'

/** M10-D21: the server search waits this long after the last keystroke. */
export const SEARCH_DEBOUNCE_MS = 120

export function CommandPalette() {
  const { isOpen, close } = usePalette()
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  return (
    <Dialog
      open={isOpen}
      onClose={close}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
      slotProps={{
        paper: {
          sx: { position: 'fixed', top: '12vh', m: 0, overflow: 'hidden', width: 'calc(100% - 32px)' },
        },
        // autoFocus already holds focus when the Fade ends; this is only a safety net (r4 §21)
        transition: { onEntered: () => inputRef.current?.focus() },
      }}
    >
      <VisuallyHidden>
        <span id={titleId}>{th.palette.dialogLabel}</span>
      </VisuallyHidden>
      {/* the body (and its queries) only exists while the dialog is mounted; its state resets after each close */}
      <PaletteBody inputRef={inputRef} />
    </Dialog>
  )
}

function PaletteBody({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const { isOpen, close } = usePalette()
  const { mode, setMode } = usePaletteMode()
  const [q, setQ] = useState('')
  const index = useSearchIndex()
  const { refetch: refetchIndex } = index

  // M10-D21: refresh the index whenever the palette opens (prefetched by the provider; 60 s stale time)
  useEffect(() => {
    if (isOpen) void refetchIndex()
  }, [isOpen, refetchIndex])

  const goTo = (next: PaletteMode) => {
    setQ('')
    setMode(next)
    inputRef.current?.focus()
  }

  return (
    // shouldFilter={false}: hits are ranked already (server / matchLocal); vimBindings={false}: cmdk's Ctrl+K would fight the toggle
    <Command label={th.palette.dialogLabel} shouldFilter={false} loop vimBindings={false}>
      {mode.kind === 'search' ? (
        <SearchStep
          q={q}
          setQ={setQ}
          inputRef={inputRef}
          close={close}
          isOpen={isOpen}
          index={index.data}
          indexFailed={index.isError}
        />
      ) : mode.kind === 'pickProject' ? (
        <PickProjectStep
          q={q}
          setQ={setQ}
          inputRef={inputRef}
          projects={index.data?.projects}
          loading={index.isPending}
          failed={index.isError}
          onRetry={() => void refetchIndex()}
          onBack={() => goTo({ kind: 'search' })}
          onPick={(p) => goTo({ kind: 'taskName', project: { id: p.id, name: p.name } })}
        />
      ) : (
        <TaskNameStep
          q={q}
          setQ={setQ}
          inputRef={inputRef}
          project={mode.project}
          onBack={() => goTo({ kind: 'pickProject' })}
          close={close}
        />
      )}
    </Command>
  )
}

// ── search (FR-1102) ────────────────────────────────────────────────────────────────────────────────────────────

function SearchStep({
  q,
  setQ,
  inputRef,
  close,
  isOpen,
  index,
  indexFailed,
}: {
  q: string
  setQ: (v: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  close: () => void
  isOpen: boolean
  index: SearchIndexResponse | undefined
  indexFailed: boolean
}) {
  const router = useRouter()
  const normalized = normalizeQuery(q)
  const debounced = useDebouncedValue(normalized, SEARCH_DEBOUNCE_MS)
  const local = useLocalMatches(indexFailed ? undefined : index, normalized)

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: qk.search(debounced, 'all'),
    queryFn: ({ signal }) =>
      getJson<SearchAllResponse>(`/api/search?q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: isOpen && debounced.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
  const server = normalized.length > 0 && debounced.length > 0 ? data : undefined
  const groups = PALETTE_GROUPS.map((g) => ({ g, items: g.map({ server, local }) }))
  const commands = useVisibleCommands(normalized)
  const total = groups.reduce((n, x) => n + x.items.length, 0)
  // the server query is "in flight" while typing too (debounce) — the empty text waits for the settled answer
  const settling = normalized !== debounced || isFetching
  // A failed search must not read as "no results" (SPEC P4): its own alert + a retry item (Enter) instead.
  const failed = normalized.length > 0 && !settling && isError && total === 0

  const select = (item: PaletteItem) => {
    close()
    router.push(item.href)
  }

  return (
    <>
      <Command.Input
        ref={inputRef}
        autoFocus
        value={q}
        onValueChange={setQ}
        placeholder={th.palette.placeholder}
        className={styles.input}
      />
      <Command.List className={styles.list} label={th.palette.dialogLabel}>
        {normalized.length === 0 ? <div className={styles.hint}>{th.palette.hint}</div> : null}
        {normalized.length > 0 && settling && total === 0 ? (
          <Command.Loading label={th.palette.loading} className={styles.loading}>
            {th.palette.loading}
          </Command.Loading>
        ) : null}
        {normalized.length > 0 && !settling && !isError && total === 0 && commands.length === 0 ? (
          <Command.Empty className={styles.empty}>{th.palette.empty}</Command.Empty>
        ) : null}
        {failed ? (
          <>
            <div role="alert" className={styles.error}>
              {th.palette.error}
            </div>
            <Command.Item value="__retry" onSelect={() => void refetch()} className={styles.item}>
              {th.palette.retry}
            </Command.Item>
          </>
        ) : null}
        {/* M8-D18 / M10-D22: quick commands first, also on an empty query (with the hint) */}
        <CommandsGroup q={normalized} />
        {groups.map(({ g, items }) =>
          items.length > 0 ? (
            <Command.Group key={g.key} heading={g.heading}>
              {items.map((item) => (
                <PaletteItemRow key={item.value} item={item} onSelect={select} />
              ))}
            </Command.Group>
          ) : null,
        )}
      </Command.List>
    </>
  )
}

// ── สร้าง task: pick a project (FR-1103, M10-D23) ─────────────────────────────────────────────────────────────────

/** Backspace on an empty input goes one step back (shortcut `palette.back`). */
function backOnEmpty(e: KeyboardEvent<HTMLInputElement>, q: string, onBack: () => void) {
  if (e.key === 'Backspace' && q === '' && !e.nativeEvent.isComposing) {
    e.preventDefault()
    onBack()
  }
}

function StepHeader({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div className={styles.step}>
      <IconButton size="small" aria-label={th.palette.createTask.back} onClick={onBack}>
        <ArrowBackOutlined fontSize="small" aria-hidden="true" />
      </IconButton>
      <span className={styles.stepText}>{text}</span>
    </div>
  )
}

function PickProjectStep({
  q,
  setQ,
  inputRef,
  projects,
  loading,
  failed,
  onRetry,
  onBack,
  onPick,
}: {
  q: string
  setQ: (v: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  projects: SearchIndexProject[] | undefined
  loading: boolean
  /** The search index failed: an alert + retry, never the "no projects" text (SPEC P4). */
  failed: boolean
  onRetry: () => void
  onBack: () => void
  onPick: (p: SearchIndexProject) => void
}) {
  const { prefs } = usePreferences()
  const lastId = prefs['palette.lastProjectId'] ?? null
  // X42 / PERM-11: every non-archived visible project (all viewer roles may create tasks)
  const open = (Array.isArray(projects) ? projects : []).filter((p) => !p.archived)
  const normalized = normalizeQuery(q)
  const list =
    normalized === ''
      ? [...open.filter((p) => p.id === lastId), ...open.filter((p) => p.id !== lastId)]
      : matchLocal(
          open.map((p) => ({ ...p, keys: [p.name] })),
          normalized,
          open.length,
        )
  return (
    <>
      <StepHeader text={th.palette.createTask.pickProject} onBack={onBack} />
      <Command.Input
        ref={inputRef}
        autoFocus
        value={q}
        onValueChange={setQ}
        onKeyDown={(e) => backOnEmpty(e, q, onBack)}
        placeholder={th.palette.createTask.projectPlaceholder}
        className={styles.input}
      />
      <Command.List className={styles.list} label={th.palette.createTask.pickProject}>
        {loading ? (
          <Command.Loading label={th.palette.loading} className={styles.loading}>
            {th.palette.loading}
          </Command.Loading>
        ) : failed && open.length === 0 ? (
          <>
            <div role="alert" className={styles.error}>
              {th.palette.error}
            </div>
            <Command.Item value="__retry" onSelect={onRetry} className={styles.item}>
              {th.palette.retry}
            </Command.Item>
          </>
        ) : open.length === 0 ? (
          <div className={styles.empty}>{th.palette.createTask.noProjects}</div>
        ) : list.length === 0 ? (
          <Command.Empty className={styles.empty}>{th.palette.empty}</Command.Empty>
        ) : null}
        {list.length > 0 ? (
          <Command.Group heading={th.palette.groups.projects}>
            {list.map((p) => (
              <Command.Item
                key={p.id}
                value={`pick:${p.id}`}
                onSelect={() => onPick(p)}
                className={styles.item}
              >
                <span className={styles.icon} aria-hidden="true">
                  <ColorSquare color={p.color} />
                </span>
                <span className={styles.text}>
                  <span className={styles.title}>{p.name}</span>
                </span>
                {p.id === lastId ? (
                  <>
                    {' '}
                    <span className={styles.chip}>{th.palette.createTask.lastUsed}</span>
                  </>
                ) : null}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </>
  )
}

// ── สร้าง task: the name (P1: name only) ────────────────────────────────────────────────────────────────────────

function TaskNameStep({
  q,
  setQ,
  inputRef,
  project,
  onBack,
  close,
}: {
  q: string
  setQ: (v: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  project: { id: string; name: string }
  onBack: () => void
  close: () => void
}) {
  const qc = useQueryClient()
  const router = useRouter()
  const undo = useContext(UndoContext)
  const { setPreference } = usePreferences()
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const name = q.trim()
    if (name === '' || busy) return // P1: an empty name does nothing
    setBusy(true)
    let taskId: string
    try {
      const r = await unwrap(createTask({ projectId: project.id, name }))
      taskId = r.task.id
    } catch {
      setBusy(false)
      toast.error(th.palette.createTask.failed) // stay in the step, the name is kept
      return
    }
    // immediate: "เปิด" or any full navigation may follow the toast at once (M10-D27)
    setPreference('palette.lastProjectId', project.id, { immediate: true })
    void invalidateTasks(qc, project.id)
    let batch: string | null = null
    const entry: UndoEntry = {
      label: th.tasks.undoLabel.create,
      undo: async () => {
        batch = (await unwrap(deleteTaskTree({ taskIds: [taskId] }))).batch
        await invalidateTasks(qc, project.id)
      },
      redo: async () => {
        if (batch === null) return
        await unwrap(restoreTaskBatch({ batch }))
        await invalidateTasks(qc, project.id)
      },
    }
    undo?.push(entry) // Cmd+Z; the toast below carries both "เลิกทำ" and "เปิด"
    const href = projectTasksHref(project.id, taskId)
    toast(th.palette.createTask.created(name, project.name), {
      duration: UNDO_TOAST_MS,
      ...(undo ? { action: { label: th.undo.undo, onClick: () => void undo.undoEntry(entry) } } : {}),
      cancel: { label: th.palette.createTask.open, onClick: () => router.push(href) },
    })
    close()
  }

  return (
    <>
      <StepHeader text={th.palette.createTask.namePlaceholder(project.name)} onBack={onBack} />
      <Command.Input
        ref={inputRef}
        autoFocus
        value={q}
        onValueChange={setQ}
        onKeyDown={(e) => {
          backOnEmpty(e, q, onBack)
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void submit()
          }
        }}
        placeholder={th.palette.createTask.namePlaceholder(project.name)}
        aria-busy={busy}
        className={styles.input}
      />
      <Command.List className={styles.list} label={th.palette.createTask.namePlaceholder(project.name)} />
    </>
  )
}
