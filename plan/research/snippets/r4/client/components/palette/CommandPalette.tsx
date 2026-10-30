'use client'
import Dialog from '@mui/material/Dialog'
import { useTheme } from '@mui/material/styles'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { th } from '@/i18n/th'

type Hit = { kind: 'project' | 'task' | 'page' | 'user' | 'client'; id: string; title: string; subtitle?: string; href: string }

async function search(q: string, signal: AbortSignal): Promise<Hit[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) throw new Error(`search ${res.status}`)
  return (await res.json()) as Hit[]
}

export function CommandPalette({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const deferred = useDeferredValue(q.trim())
  const theme = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd+K / Ctrl+K from anywhere (SPEC FR-1102)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { data = [], isFetching } = useQuery({
    queryKey: ['search', deferred],
    queryFn: ({ signal }) => search(deferred, signal), // TanStack aborts stale requests via signal
    enabled: open && deferred.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      fullWidth
      maxWidth="sm"
      // MUI v9: slots/slotProps only (PaperProps / TransitionProps props were removed)
      slotProps={{
        paper: { sx: { position: 'fixed', top: '12vh', m: 0, overflow: 'hidden' } },
        // verified: autoFocus already holds focus when the Fade ends; this is only a safety net
        transition: { onEntered: () => inputRef.current?.focus() },
      }}
    >
      {/* shouldFilter={false}: server already ranked with pg_trgm; cmdk must not re-filter/re-sort */}
      {/* vimBindings={false}: cmdk binds Ctrl+N/J/P/K by default, which collides with the global Ctrl+K toggle */}
      <Command label={th.palette.placeholder} shouldFilter={false} loop vimBindings={false}>
        <Command.Input
          ref={inputRef}
          autoFocus
          value={q}
          onValueChange={setQ}
          placeholder={th.palette.placeholder}
          style={{ width: '100%', padding: theme.spacing(2), border: 0, outline: 'none', font: 'inherit' }}
        />
        <Command.List style={{ maxHeight: 420, overflowY: 'auto' }}>
          {isFetching && data.length === 0 ? <Command.Loading>{th.palette.loading}</Command.Loading> : null}
          <Command.Empty>{th.palette.empty}</Command.Empty>
          {data.map((h) => (
            <Command.Item
              key={`${h.kind}:${h.id}`}
              value={`${h.kind}:${h.id}`} // unique value: two hits with the same title must not collide
              onSelect={() => {
                setOpen(false)
                onNavigate(h.href)
              }}
            >
              {h.title}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </Dialog>
  )
}
