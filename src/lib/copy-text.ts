/**
 * Copies text to the clipboard (FR-202 "คัดลอก", X53). The async Clipboard API exists only in a secure context;
 * over plain HTTP on a LAN it is undefined, so fall back to a hidden textarea + `execCommand('copy')`.
 * Browser-only (call from event handlers). Resolves to whether the copy succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // permission denied or document not focused → try the legacy path
    }
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.setAttribute('aria-hidden', 'true')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  ta.style.pointerEvents = 'none'
  document.body.appendChild(ta)
  try {
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, text.length)
    // Deprecated but the only clipboard path without a secure context (X53).
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- no alternative over plain HTTP (X53)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    ta.remove()
    active?.focus()
  }
}
