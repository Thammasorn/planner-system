'use client'

/**
 * Full page load (M1-D7): after login, logout and password changes the root layout must re-render (theme class,
 * preferences) and every client cache is dropped. Wrapped so ui tests can mock it (window.location is unforgeable).
 */
export function hardNavigate(url: string): void {
  window.location.assign(url)
}
