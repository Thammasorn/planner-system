import { expect, test, type Page } from '@playwright/test'
declare global { interface Window { __log: Record<string, unknown>[]; __tl?: { cols: () => number; scrollLeft: () => number } } }
const firstVisibleKey = (page: Page) =>
  page.evaluate(() => {
    const r = (document.querySelector('#grid') as HTMLElement).getBoundingClientRect()
    const el = document.elementFromPoint(r.left + 203, r.top + 10)
    return (el?.closest('[role=columnheader]') as HTMLElement | null)?.dataset.key ?? null
  })

test('control: default anchorTo "start" JUMPS when columns are prepended', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))
  await page.goto('/?anchor=start')
  await page.locator('#btn-today').click()
  await expect.poll(() => firstVisibleKey(page)).toBe('2026-09-28')
  const before = await page.evaluate(() => window.__tl?.scrollLeft() ?? -1)
  await page.locator('#btn-prepend').click()
  await page.waitForTimeout(200)
  const after = await page.evaluate(() => window.__tl?.scrollLeft() ?? -1)
  const key = await firstVisibleKey(page)
  console.log('[anchor=start] scrollLeft', before, '->', after, 'first visible', key)
  expect(key).not.toBe('2026-09-28')
})

test('control: restrictToVerticalAxis on DndContext zeroes delta.x -> depth never changes', async ({ page }) => {
  await page.goto('/?restrict=1')
  const b = (await page.locator('[data-tree-id="C"]').boundingBox())!
  await page.mouse.move(b.x + 20, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 30, b.y + b.height / 2, { steps: 5 })
  await page.mouse.move(b.x + 52, b.y + b.height / 2, { steps: 5 })
  await page.mouse.up()
  const move = await expect.poll(async () => (await page.evaluate(() => window.__log)).find((l) => String(l.evt).startsWith('move'))).toBeTruthy()
  const logged = (await page.evaluate(() => window.__log)).find((l) => String(l.evt).startsWith('move'))
  console.log('[restrictToVerticalAxis] ->', JSON.stringify(logged), move)
  expect(logged).toMatchObject({ evt: 'move', id: 'C', parentId: null, depth: 0 })
})
