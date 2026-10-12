import { test } from '@playwright/test'

test('hover and selection states', async ({ page }) => {
  await page.goto('/bordeaux')
  await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
  await page.waitForTimeout(8000)
  
  // Move mouse to Pauillac area to trigger hover
  const canvas = await page.locator('.maplibregl-canvas')
  const box = await canvas.boundingBox()
  if (box) {
    // Hover over Pauillac (roughly centered in the Médoc)
    await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.35)
    await page.waitForTimeout(500)
  }
  
  await page.screenshot({ 
    path: 'screenshots/hover-state.png',
    fullPage: false 
  })
  
  // Click to select
  await page.mouse.click(box!.x + box!.width * 0.38, box!.y + box!.height * 0.35)
  await page.waitForTimeout(500)
  
  // Move mouse away to verify selection persists
  await page.mouse.move(box!.x + 50, box!.y + 50)
  await page.waitForTimeout(300)
  
  await page.screenshot({ 
    path: 'screenshots/selection-state.png',
    fullPage: false 
  })
})
