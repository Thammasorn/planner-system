// Test-only: cmdk measures its list (ResizeObserver) and scrolls the selected item into view; jsdom has neither.
export function installCmdkShims(): void {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  if (typeof Element.prototype.scrollIntoView !== 'function') Element.prototype.scrollIntoView = () => {}
}
