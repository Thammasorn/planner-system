// Test-only harness for the page shell / tree / palette UI (not imported by app code).
import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { vi, type Mock } from 'vitest'
import { UndoContext, type UndoApi } from '@/components/undo/useUndo'
import { CurrentUserContext } from '@/hooks/useCurrentUser'
import { PreferencesContext, type PreferencesApi } from '@/hooks/usePreferences'
import type { CurrentUserDTO } from '@/lib/contracts/users'
import type { PageTreeNode } from '@/lib/contracts/pages'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/schemas/preferences'
import { theme } from '@/lib/theme/theme'

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const MANAGER: CurrentUserDTO = {
  id: uuid(1),
  email: 'manager@example.com',
  name: 'Manager',
  nickname: null,
  displayName: 'Manager',
  role: 'manager',
  color: null,
}
export const WORKER: CurrentUserDTO = {
  ...MANAGER,
  id: uuid(2),
  name: 'Ivy',
  displayName: 'Ivy',
  role: 'worker',
}

export const treeNode = (over: Partial<PageTreeNode> & Pick<PageTreeNode, 'id' | 'title'>): PageTreeNode => ({
  parentId: null,
  icon: null,
  depth: 0,
  position: 'a0',
  hasChildren: false,
  locked: false,
  effectiveProtected: false,
  isCharter: false,
  ...over,
})

function Prefs({
  initial,
  spy,
  children,
}: {
  initial: Preferences
  spy: PreferencesApi['setPreference']
  children: ReactNode
}) {
  const [prefs, setPrefs] = useState(initial)
  const api = useMemo<PreferencesApi>(
    () => ({
      prefs,
      setPreference: (key, value) => {
        spy(key, value)
        setPrefs((p) => ({ ...p, [key]: value }))
      },
    }),
    [prefs, spy],
  )
  return <PreferencesContext value={api}>{children}</PreferencesContext>
}

export function fakeUndo(): UndoApi & { push: Mock<UndoApi['push']> } {
  return {
    push: vi.fn<UndoApi['push']>(),
    undo: vi.fn(() => Promise.resolve()),
    redo: vi.fn(() => Promise.resolve()),
    undoEntry: vi.fn(() => Promise.resolve()),
    canUndo: false,
    canRedo: false,
  }
}

export function renderPages(
  ui: ReactElement,
  opts: {
    user?: CurrentUserDTO
    prefs?: Partial<Preferences>
    seed?: (qc: QueryClient) => void
    undo?: UndoApi & { push: Mock<UndoApi['push']> }
  } = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  })
  opts.seed?.(qc)
  const setPreference = vi.fn()
  const undo = opts.undo ?? fakeUndo()
  const utils = render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme} storageManager={null}>
        <CurrentUserContext value={opts.user ?? WORKER}>
          <Prefs initial={{ ...DEFAULT_PREFERENCES, ...opts.prefs }} spy={setPreference}>
            <UndoContext value={undo}>
              {ui}
              <Toaster />
            </UndoContext>
          </Prefs>
        </CurrentUserContext>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...utils, qc, setPreference, undo }
}

export const okResult = <T extends object>(v: T) => Promise.resolve({ ok: true as const, ...v })
