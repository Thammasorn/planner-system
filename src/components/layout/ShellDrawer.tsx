'use client'
// src/components/layout/ShellDrawer.tsx — the narrow-screen navigation drawer of AppShell (M6.1-D19, S4.3). AppShell
// provides it; PageHeaderBar renders ☰ below 900 px when it is present (it replaces AppShell's former mobile bar).
import { createContext, useContext } from 'react'

export interface ShellDrawerApi {
  open(): void
}

export const ShellDrawerContext = createContext<ShellDrawerApi | null>(null)

/** The app shell's drawer, or null outside AppShell (auth pages, isolated tests). */
export function useShellDrawer(): ShellDrawerApi | null {
  return useContext(ShellDrawerContext)
}
