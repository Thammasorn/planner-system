/**
 * "This click opens a new browser tab at <url>" — observed at the browser level (CDP `Target.*`), not through
 * Playwright's `context.on('page')`.
 *
 * Why (M11 close-out, T3 FR-685): Playwright reports a tab only after its first non-initial navigation commits, which it
 * learns from `Page.frameNavigated`. When a Cmd/Ctrl+click opens a tab while the opener's renderer is busy (that renderer
 * is shared by the same-site tab), Chromium sometimes commits the new tab's document without ever sending
 * `Page.frameNavigated` on the new session. The tab really is open on the right URL (target list, title, `load`), but
 * `context.waitForEvent('page')` never resolves. This was traced with `DEBUG=pw:protocol`: `Page.getFrameTree` gave the
 * initial empty frame, then `frameStartedNavigating` → `domContentEventFired` → `load` on the new session with no
 * `frameNavigated`. The target list is the browser's own record of open tabs and does not have that race.
 */
import type { CDPSession, Page } from '@playwright/test'

interface TargetInfo {
  targetId: string
  type: string
  url: string
  browserContextId?: string
}

/**
 * Runs `action` (e.g. a modifier click) and resolves with the URL of the new tab it opened in the same browser context
 * as `page`, once that tab's URL matches `url`. The tab is closed afterwards. Rejects after `timeout` ms.
 */
export async function newTabOpenedBy(
  page: Page,
  action: () => Promise<void>,
  url: RegExp,
  timeout = 10_000,
): Promise<string> {
  const browser = page.context().browser()
  if (!browser)
    throw new Error('newTabOpenedBy: the page has no browser (persistent contexts are not supported)')
  const pageCdp = await page.context().newCDPSession(page)
  const own = (await pageCdp.send('Target.getTargetInfo')).targetInfo as TargetInfo
  await pageCdp.detach()

  const cdp: CDPSession = await browser.newBrowserCDPSession()
  try {
    const before = new Set(
      ((await cdp.send('Target.getTargets')).targetInfos as TargetInfo[]).map((t) => t.targetId),
    )
    let found: (t: TargetInfo) => void = () => {}
    const opened = new Promise<TargetInfo>((resolve) => {
      found = resolve
    })
    const check = (t: TargetInfo) => {
      if (t.type !== 'page' || before.has(t.targetId)) return
      if (t.browserContextId !== own.browserContextId) return
      if (url.test(new URL(t.url || 'about:blank').pathname)) found(t)
    }
    cdp.on('Target.targetCreated', (e: { targetInfo: TargetInfo }) => check(e.targetInfo))
    cdp.on('Target.targetInfoChanged', (e: { targetInfo: TargetInfo }) => check(e.targetInfo))
    await cdp.send('Target.setDiscoverTargets', { discover: true })

    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`newTabOpenedBy: no new tab matching ${url} within ${timeout} ms`)),
        timeout,
      )
    })
    try {
      await action()
      const tab = await Promise.race([opened, timedOut])
      await cdp.send('Target.closeTarget', { targetId: tab.targetId })
      return tab.url
    } finally {
      clearTimeout(timer)
    }
  } finally {
    await cdp.detach()
  }
}
