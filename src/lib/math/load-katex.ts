// src/lib/math/load-katex.ts — memoised lazy loader of the KaTeX runtime chunk (M11-D30, NFR-12). Equation renders
// show a sized skeleton until this resolves; pages without equations never call it, so they never fetch KaTeX.
export type KatexRuntime = typeof import('./katex-runtime')

let pending: Promise<KatexRuntime> | null = null
let loaded: KatexRuntime | null = null

export function loadKatex(): Promise<KatexRuntime> {
  if (!pending) {
    pending = import('./katex-runtime').then(
      (rt) => {
        loaded = rt
        return rt
      },
      (e: unknown) => {
        pending = null // a failed chunk load may be retried (offline → online)
        throw e
      },
    )
  }
  return pending
}

/** The runtime when it has already loaded (renders after the first equation skip the skeleton), else null. */
export function loadedKatex(): KatexRuntime | null {
  return loaded
}
