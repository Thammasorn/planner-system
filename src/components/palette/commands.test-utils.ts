// Test-only: a PaletteCommandCtx with vi.fn() defaults (plan/m08 S4.10, X88). The cast keeps it compiling when M10
// adds required fields; M10 adds its own vi.fn() defaults here.
import { vi } from 'vitest'
import type { PaletteCommandCtx } from './commands'

export function fakeCommandCtx(over: Partial<PaletteCommandCtx> = {}): PaletteCommandCtx {
  const defaults: Partial<PaletteCommandCtx> = {
    close: vi.fn(),
    pathname: '/',
    currentProjectId: null,
    openMilestoneDialog: vi.fn(),
    // M10
    navigate: vi.fn(),
    openLeaveDialog: vi.fn(),
    beginCreateTask: vi.fn(),
    createPageHere: vi.fn(async () => {}),
  }
  return { ...defaults, ...over } as PaletteCommandCtx
}
