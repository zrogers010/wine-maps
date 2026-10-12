import { test } from '@playwright/test'

test('baseline no hover', async ({ page }) => {
  await page.goto('/bordeaux')
  await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
  await page.waitForTimeout(8000)
  
  // Position mouse outside map area
  await page.mouse.move(50, 50)
  await page.waitForTimeout(300)
  
  await page.screenshot({ 
    path: 'screenshots/no-hover-baseline.png',
    fullPage: false 
  })
})

test('hover comparison', async ({ page }) => {
  await page.goto('/bordeaux')
  await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
  await page.waitForTimeout(8000)
  
  const canvas = await page.locator('.maplibregl-canvas')
  const box = await canvas.boundingBox()
  
  if (box) {
    // Hover over Saint-Émilion area (right side)
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5)
    await page.waitForTimeout(800)
    
    await page.screenshot({ 
      path: 'screenshots/hover-right-side.png',
      fullPage: false 
    })
  }
})
