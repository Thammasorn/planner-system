import { expect, test } from '@playwright/test'
test('sticky footer row stays at the viewport bottom during 2D scroll; its first cell stays left', async ({ page }) => {
  await page.goto('/')
  for (const [top, left] of [[0, 0], [1500, 600], [100000, 100000]] as const) {
    await page.locator('#grid').evaluate((g, [t, l]) => { g.scrollTop = t; g.scrollLeft = l }, [top, left])
    await page.waitForTimeout(80)
    const hit = await page.evaluate(() => {
      const g = document.querySelector('#grid') as HTMLElement
      const r = g.getBoundingClientRect()
      const bottomY = r.top + g.clientHeight - 5 // just above the horizontal scrollbar
      return {
        label: document.elementFromPoint(r.left + 10, bottomY)?.getAttribute('data-testid'),
        cell: document.elementFromPoint(r.left + 260, bottomY)?.getAttribute('data-testid'),
        header: document.elementFromPoint(r.left + 260, r.top + 10)?.getAttribute('role'),
      }
    })
    expect(hit, `scroll ${top},${left}`).toEqual({ label: 'footer-label', cell: 'footer-cell', header: 'columnheader' })
  }
})
