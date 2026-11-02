'use client'
// Command palette shell (FR-1102, FR-1105 pages part, KEY-01, X08, X49). Based on
// plan/research/snippets/r4/client/components/palette/CommandPalette.tsx with the open state from PaletteProvider
// (no own window listener), the pages search through `qk.search` + `getJson`, and data-driven groups (M4-D37e).
import { useDeferredValue, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Dialog from '@mui/material/Dialog'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import type { SearchResponse } from '@/lib/contracts/search'
import { qk } from '@/lib/query-keys'
import { CommandsGroup } from './CommandsGroup'
import { PALETTE_GROUPS, type PaletteItem } from './groups'
import { PaletteItemRow } from './PaletteItemRow'
import { usePalette } from './PaletteProvider'
import styles from './CommandPalette.module.css'

export function CommandPalette() {
  const { isOpen, close } = usePalette()
  const router = useRouter()
  const [q, setQ] = useState('')
  const deferred = useDeferredValue(q.trim())
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: qk.search(deferred),
    queryFn: ({ signal }) =>
      getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(deferred)}`, { signal }),
    enabled: isOpen && deferred.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
  const server = deferred.length > 0 ? data : undefined
  const groups = PALETTE_GROUPS.map((g) => ({ g, items: g.map({ server }) }))
  const total = groups.reduce((n, x) => n + x.items.length, 0)
  // A failed search must not read as "no results" (SPEC P4): its own alert + a retry item (Enter) instead.
  const failed = deferred.length > 0 && !isFetching && isError && total === 0

  const select = (item: PaletteItem) => {
    close()
    router.push(item.href)
  }

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
        transition: { onEntered: () => inputRef.current?.focus(), onExited: () => setQ('') },
      }}
    >
      <VisuallyHidden>
        <span id={titleId}>{th.palette.dialogLabel}</span>
      </VisuallyHidden>
      {/* shouldFilter={false}: the server already ranked the hits; vimBindings={false}: cmdk's Ctrl+K would fight the toggle */}
      <Command label={th.palette.dialogLabel} shouldFilter={false} loop vimBindings={false}>
        <Command.Input
          ref={inputRef}
          autoFocus
          value={q}
          onValueChange={setQ}
          placeholder={th.palette.placeholder}
          className={styles.input}
        />
        <Command.List className={styles.list} label={th.palette.dialogLabel}>
          {deferred.length === 0 ? <div className={styles.hint}>{th.palette.hint}</div> : null}
          {deferred.length > 0 && isFetching && total === 0 ? (
            <Command.Loading label={th.palette.loading} className={styles.loading}>
              {th.palette.loading}
            </Command.Loading>
          ) : null}
          {deferred.length > 0 && !isFetching && !isError && total === 0 ? (
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
          {/* M8-D18: quick commands first, also on an empty query (with the hint) */}
          <CommandsGroup q={deferred} />
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
      </Command>
    </Dialog>
  )
}
