import { expect, test, type Page } from '@playwright/test'

const logs = (page: Page) => page.evaluate(() => window.__log)
declare global { interface Window { __log: Record<string, unknown>[]; __tl?: { cols: () => number; scrollLeft: () => number } } }

test.describe('clock', () => {
  test('setFixedTime pins Date but timers keep running', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))
    await page.goto('/')
    await expect(page.locator('#today')).toHaveText('2026-09-30')
    await expect(page.locator('#today-th')).toHaveText('30 ก.ย. 2569')
    const t1 = await page.locator('#now-ms').textContent()
    await page.waitForTimeout(1200) // real time passes, setInterval fires, Date stays fixed
    expect(await page.locator('#now-ms').textContent()).toBe(t1)
  })
  test('install() fakes timers: 23:30 UTC is already the 30th in Bangkok; runFor drives sonner 8s toast', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-29T23:30:00Z') })
    await page.goto('/')
    await expect(page.locator('#today')).toHaveText('2026-09-30')
    await page.locator('#btn-toast').click()
    const toast = page.getByText('deleted task X')
    await expect(toast).toBeVisible()
    await page.clock.runFor(7000)
    await expect(toast).toBeVisible()
    await page.clock.runFor(1500)
    await expect(toast).toBeHidden()
  })
})

test('storageState from setup project is applied', async ({ page, context }) => {
  await page.goto('/')
  expect((await context.cookies()).find((c) => c.name === 'session')?.value).toBe('manager-token')
  expect(await page.evaluate(() => localStorage.getItem('ui.sidebar'))).toBe('expanded')
})

test.describe('clipboard (chromium, permissions granted in project config)', () => {
  test('writeText + keyboard paste of TSV into a textarea', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.clipboard.writeText('0.5\t1\n1\t0.5'))
    await page.locator('#ta').focus()
    await page.keyboard.press('ControlOrMeta+V')
    await expect(page.locator('#ta')).toHaveValue('0.5\t1\n1\t0.5')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('0.5\t1\n1\t0.5')
  })
  test('real image paste: ClipboardItem(image/png) + keyboard paste => trusted paste event with a File', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 4
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b as Blob), 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    })
    await page.locator('#paste-zone').focus()
    await page.keyboard.press('ControlOrMeta+V')
    await expect.poll(async () => (await logs(page)).filter((l) => l.evt === 'paste').length).toBe(1)
    const [evt] = (await logs(page)).filter((l) => l.evt === 'paste')
    console.log('[real paste]', JSON.stringify(evt))
    expect(evt?.trusted).toBe(true)
    expect(evt?.files).toEqual([expect.objectContaining({ type: 'image/png' })])
  })
  test('synthetic paste: DataTransfer + ClipboardEvent (image file + HTML table)', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 4
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b as Blob), 'image/png'))
      const dt = new DataTransfer()
      dt.items.add(new File([blob], 'screenshot.png', { type: 'image/png' }))
      dt.setData('text/html', '<table><tr><td>1</td><td>2</td></tr></table>')
      dt.setData('text/plain', '1\t2')
      const zone = document.querySelector('#paste-zone') as HTMLElement
      zone.focus()
      zone.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    const [evt] = (await logs(page)).filter((l) => l.evt === 'paste')
    console.log('[synthetic paste]', JSON.stringify(evt))
    expect(evt?.trusted).toBe(false)
    expect(evt?.files).toEqual([{ name: 'screenshot.png', type: 'image/png', size: expect.any(Number) }])
    expect(String(evt?.html)).toContain('<table>')
  })
})

test('cmdk inside MUI Dialog: Cmd/Ctrl+K, focus, server results, keyboard select, Esc', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('ControlOrMeta+K')
  const input = page.getByTestId('palette-input')
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()
  await input.fill('ลูกค้า')
  await expect(page.getByRole('option')).toHaveCount(2)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(input).toBeHidden()
  expect((await logs(page)).find((l) => l.evt === 'select')).toEqual({ evt: 'select', h: 'ลูกค้าใหม่ POS' })
  await page.keyboard.press('ControlOrMeta+K')
  await expect(input).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()
})

test.describe('2D virtual timeline', () => {
  const firstVisibleKey = (page: Page) =>
    page.evaluate(() => {
      const g = document.querySelector('#grid') as HTMLElement
      const r = g.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + 200 + 3, r.top + 10) // just right of the sticky first column, in the header
      return (el?.closest('[role=columnheader]') as HTMLElement | null)?.dataset.key ?? el?.textContent ?? null
    })

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))
    await page.goto('/')
  })

  test('sticky header row + sticky first column survive 2D scrolling', async ({ page }) => {
    await page.locator('#grid').evaluate((g) => { g.scrollTop = 2000; g.scrollLeft = 700 })
    await page.waitForTimeout(100)
    const hit = await page.evaluate(() => {
      const r = (document.querySelector('#grid') as HTMLElement).getBoundingClientRect()
      const at = (x: number, y: number) => document.elementFromPoint(r.left + x, r.top + y)
      return {
        corner: at(10, 10)?.getAttribute('data-testid'),
        header: at(260, 10)?.getAttribute('role'),
        rowHeader: at(10, 60)?.getAttribute('role'),
        rowName: at(10, 60)?.getAttribute('data-row'),
      }
    })
    expect(hit).toMatchObject({ corner: 'corner', header: 'columnheader', rowHeader: 'rowheader' })
    expect(hit.rowName).not.toBe('row-0')
  })

  test('Today button -> scrollToIndex aligns this week right after the sticky column', async ({ page }) => {
    await page.locator('#grid').evaluate((g) => { g.scrollLeft = 0 })
    await page.locator('#btn-today').click()
    await expect.poll(() => firstVisibleKey(page)).toBe('2026-09-28')
  })

  test('prepending 8 weeks keeps the same first visible column (anchorTo: end + stable keys)', async ({ page }) => {
    await page.locator('#btn-today').click()
    await expect.poll(() => firstVisibleKey(page)).toBe('2026-09-28')
    const before = await page.evaluate(() => window.__tl?.scrollLeft() ?? -1)
    const colsBefore = await page.evaluate(() => window.__tl?.cols() ?? -1)
    await page.locator('#btn-prepend').click()
    await expect.poll(() => page.evaluate(() => window.__tl?.cols() ?? -1)).toBe(colsBefore + 8)
    await expect.poll(() => firstVisibleKey(page)).toBe('2026-09-28')
    const after = await page.evaluate(() => window.__tl?.scrollLeft() ?? -1)
    console.log('[prepend] scrollLeft', before, '->', after)
    expect(after - before).toBe(8 * 80)
    // append does not move the viewport either
    await page.locator('#btn-append').click()
    await expect.poll(() => page.evaluate(() => window.__tl?.cols() ?? -1)).toBe(colsBefore + 16)
    expect(await firstVisibleKey(page)).toBe('2026-09-28')
  })

  test('expanding a week into 5 day columns re-lays out variable widths', async ({ page }) => {
    await page.locator('#btn-today').click()
    await page.locator('#btn-expand').click()
    await expect(page.locator('[role=columnheader][data-key="2026-10-02"]')).toBeVisible()
    const box = async (k: string) => (await page.locator(`[role=columnheader][data-key="${k}"]`).boundingBox())!
    const mon = await box('2026-09-28'), fri = await box('2026-10-02'), next = await box('2026-10-05')
    expect(Math.round(mon.width)).toBe(48)
    expect(Math.round(next.x - (fri.x + fri.width))).toBe(0)
    expect(Math.round(next.width)).toBe(80)
  })
})

test('dnd-kit tree: dragging C right by one indent nests it under B', async ({ page }) => {
  await page.goto('/')
  const c = page.locator('[data-tree-id="C"]')
  const b = (await c.boundingBox())!
  await page.mouse.move(b.x + 20, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 30, b.y + b.height / 2, { steps: 5 })
  await page.mouse.move(b.x + 52, b.y + b.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await logs(page)).find((l) => String(l.evt).startsWith('move'))).toEqual({
    evt: 'move', id: 'C', parentId: 'B', depth: 1, position: 'a0',
  })
})
