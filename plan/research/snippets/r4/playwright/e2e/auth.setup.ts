import { test as setup } from '@playwright/test'

// Real app: fill the login form as the manager, wait for /home, then save state.
setup('authenticate as manager', async ({ page }) => {
  await page.goto('/')
  await page.context().addCookies([
    { name: 'session', value: 'manager-token', domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
  ])
  await page.evaluate(() => localStorage.setItem('ui.sidebar', 'expanded'))
  await page.context().storageState({ path: 'e2e/.auth/manager.json' })
})
