import { test } from '@playwright/test'

test('mobile layout - Bordeaux', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  
  await page.goto('/bordeaux')
  await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
  await page.waitForTimeout(8000)
  
  await page.screenshot({ 
    path: 'screenshots/mobile-bordeaux-baseline.png',
    fullPage: true
  })
  
  // Tap on Pauillac to open bottom sheet
  const canvas = await page.locator('.maplibregl-canvas')
  const box = await canvas.boundingBox()
  if (box) {
    await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.35)
    await page.waitForTimeout(1000)
    
    await page.screenshot({ 
      path: 'screenshots/mobile-bordeaux-bottomsheet.png',
      fullPage: true
    })
  }
})
