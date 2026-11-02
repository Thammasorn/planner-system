'use client'
// src/components/palette/project-scope.tsx — the palette's "current project" (M10-D24, FR-1103): screens of a project
// (`/projects/[id]/**`, a PROJECT page `/p/[pageId]`) register it; the quick commands read the innermost one.
// Mounted in AppShell around PaletteProvider so useCommandCtx() can read it wherever it runs.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export interface PaletteScopeProject {
  id: string
  name: string
  archived: boolean
}

interface ScopeEntry {
  key: symbol
  project: PaletteScopeProject
}

interface ScopeActions {
  push(entry: ScopeEntry): void
  pop(key: symbol): void
}

const ScopeTopContext = createContext<PaletteScopeProject | null>(null)
const ScopeActionsContext = createContext<ScopeActions | null>(null)

/** A stack of registered scopes: the last registered (innermost) wins; unmounting restores the outer one. */
export function PaletteProjectScopeProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<readonly ScopeEntry[]>([])
  const actions = useMemo<ScopeActions>(
    () => ({
      push: (entry) => setStack((s) => [...s.filter((e) => e.key !== entry.key), entry]),
      pop: (key) => setStack((s) => s.filter((e) => e.key !== key)),
    }),
    [],
  )
  return (
    <ScopeActionsContext value={actions}>
      <ScopeTopContext value={stack.at(-1)?.project ?? null}>{children}</ScopeTopContext>
    </ScopeActionsContext>
  )
}

/** The innermost registered project, or null (no provider = no scope). */
export function usePaletteScope(): PaletteScopeProject | null {
  return useContext(ScopeTopContext)
}

/** Registers `project` while mounted (null registers nothing — e.g. a wiki page). */
export function usePaletteProjectScope(project: PaletteScopeProject | null): void {
  const actions = useContext(ScopeActionsContext)
  const [key] = useState(() => Symbol('palette-scope'))
  const id = project?.id
  const name = project?.name
  const archived = project?.archived
  useEffect(() => {
    if (!actions || id === undefined || name === undefined || archived === undefined) return
    actions.push({ key, project: { id, name, archived } })
    return () => actions.pop(key)
  }, [actions, key, id, name, archived])
}

/** For server components (the project layout): `<PaletteProjectScope project={…} />` registers it. */
export function PaletteProjectScope({ project }: { project: PaletteScopeProject }) {
  usePaletteProjectScope(project)
  return null
}
