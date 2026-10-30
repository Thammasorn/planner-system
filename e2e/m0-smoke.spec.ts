/**
 * M0 smoke (plan/m00-scaffold.md §7.3): the first page opens on a production build behind the nonce CSP,
 * with the Thai shell, self-hosted font, collapsible sidebar, drawer on narrow screens and Thai 404.
 * Guards (CSP, external requests, page errors) and the browser clock come from the auto fixture.
 *
 * Determinism: from M1 the /home placeholder renders serverToday(), which honours the webServer's APP_NOW (X45),
 * so the expected date is the calendar date of `E2E.appNow` (2026-09-30), not the machine's clock.
 * M1 (S4.13): every shell page is behind the proxy session gate, so tests 1–7 and 9 `loginAs(page, 'manager')`
 * first; the health check stays anonymous. The DB is reset (golden seed) once per file.
 */
import { th } from '../src/i18n/th'
import { buildCsp } from '../src/lib/csp'
import { formatThaiDate } from '../src/lib/format'
import { E2E } from './env'
import { expect, loginAs, resetDb, test } from './fixtures'
import { ShellPage } from './pages/shell'

const HOME_URL = new URL('/home', E2E.baseUrl).href

test.beforeAll(async () => {
  await resetDb()
})

test.describe('m0 smoke', () => {
  test('root redirects to /home', async ({ page }) => {
    await loginAs(page, 'manager')
    const res = await page.request.get('/', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/home$/)

    await page.goto('/')
    await expect(page).toHaveURL(HOME_URL)
  })

  test('home renders the Thai shell', async ({ page }) => {
    await loginAs(page, 'manager')
    const shell = new ShellPage(page)
    await shell.goto('/home')

    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', 'th')
    await expect(html).toHaveClass(/(^|\s)light(\s|$)/)
    await expect(page).toHaveTitle(th.meta.titleTemplate.replace('%s', th.home.title))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(th.home.title)
    await expect(page.getByText(th.home.greeting, { exact: true })).toBeVisible()
    await expect(
      page.getByText(th.home.today(formatThaiDate(E2E.appNow.slice(0, 10))), { exact: true }),
    ).toBeVisible()
    await expect(page.getByText(th.home.placeholderTitle, { exact: true })).toBeVisible()
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /interactive-widget=resizes-content/,
    )
    await expect(shell.navLink(th.nav.home)).toHaveAttribute('aria-current', 'page')
  })

  test('self-hosted Thai font is used', async ({ page }) => {
    await loginAs(page, 'manager')
    const fonts: { url: string; status: number }[] = []
    page.on('response', (r) => {
      if (new URL(r.url()).pathname.endsWith('.woff2')) fonts.push({ url: r.url(), status: r.status() })
    })
    await new ShellPage(page).goto('/home')

    const loadedFamilies = await page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
    })

    expect(fonts.length, 'woff2 responses').toBeGreaterThanOrEqual(1)
    for (const font of fonts) {
      const url = new URL(font.url)
      expect(url.origin, font.url).toBe(E2E.baseUrl)
      expect(url.pathname, font.url).toMatch(/^\/_next\/static\/media\//)
      expect(font.status, font.url).toBe(200)
    }
    expect(
      loadedFamilies.some((f) => f.includes('plexThai')),
      loadedFamilies.join(', '),
    ).toBe(true)
    expect(
      loadedFamilies.some((f) => f.includes('plexLatin')),
      loadedFamilies.join(', '),
    ).toBe(true)

    const h1Family = await page
      .getByRole('heading', { level: 1 })
      .evaluate((el) => getComputedStyle(el).fontFamily)
    const latinAt = h1Family.indexOf('plexLatin')
    const thaiAt = h1Family.indexOf('plexThai')
    expect(latinAt, h1Family).toBeGreaterThanOrEqual(0)
    expect(thaiAt, h1Family).toBeGreaterThan(latinAt)
  })

  test('security headers and CSP nonce', async ({ page }) => {
    await loginAs(page, 'manager')
    const res = await page.request.get('/home')
    expect(res.status()).toBe(200)
    const headers = res.headers()
    const csp = headers['content-security-policy'] ?? ''
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce, csp).toBeTruthy()
    if (!nonce) return

    expect(csp).toBe(buildCsp(nonce, { dev: false, https: false }))
    expect(csp).not.toContain('strict-dynamic')
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('upgrade-insecure-requests')

    const body = await res.text()
    const scripts = body.match(/<script\b[^>]*>/g) ?? []
    expect(scripts.length, 'script tags').toBeGreaterThan(0)
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`)

    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['strict-transport-security']).toBeUndefined()
    expect(headers['x-powered-by']).toBeUndefined()

    const second = await page.request.get('/home')
    const secondNonce = /'nonce-([^']+)'/.exec(second.headers()['content-security-policy'] ?? '')?.[1]
    expect(secondNonce).toBeTruthy()
    expect(secondNonce).not.toBe(nonce)
  })

  test('sidebar collapses with the shortcut and the button', async ({ page }) => {
    await loginAs(page, 'manager')
    const shell = new ShellPage(page)
    await shell.goto()
    await shell.expectCollapsed(false)

    await shell.pressToggleShortcut()
    await shell.expectCollapsed(true)
    await expect(shell.expandButton()).toBeVisible()
    await expect(shell.expandButton()).toHaveAttribute('aria-expanded', 'false')
    await expect(shell.navLink(th.nav.home)).toBeVisible()

    await shell.expandButton().click()
    await shell.expectCollapsed(false)
    await expect(shell.collapseButton()).toHaveAttribute('aria-expanded', 'true')

    await shell.collapseButton().click()
    await shell.expectCollapsed(true)
  })

  test('keyboard: skip link and focus', async ({ page }) => {
    await loginAs(page, 'manager')
    const shell = new ShellPage(page)
    await shell.goto()

    await page.keyboard.press('Tab')
    await expect(shell.skipLink()).toBeFocused()
    await expect(shell.skipLink()).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(shell.main()).toBeFocused()
  })

  test('narrow screens use a temporary drawer', async ({ page }) => {
    await loginAs(page, 'manager')
    await page.setViewportSize({ width: 800, height: 900 })
    const shell = new ShellPage(page)
    await shell.goto()

    await expect(shell.sidebar()).toBeHidden()
    await expect(shell.nav()).toBeHidden()

    await shell.menuButton().click()
    await expect(shell.nav()).toBeVisible()
    await expect(shell.navLink(th.nav.home)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(shell.nav()).toBeHidden()
  })

  test('health endpoint is public and uncached', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const headers = res.headers()
    expect(headers['cache-control']).toContain('no-store')
    expect(headers['x-content-type-options']).toBe('nosniff')
  })

  test.describe('not found', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] })

    test('unknown page shows the Thai 404', async ({ page }) => {
    await loginAs(page, 'manager')
      const res = await page.goto('/no-such-page')
      expect(res?.status()).toBe(404)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(th.errors.notFoundPage.title)
      await expect(page.getByText(th.errors.notFoundPage.body, { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: th.common.backToHome, exact: true })).toHaveAttribute(
        'href',
        '/home',
      )
    })
  })
})
