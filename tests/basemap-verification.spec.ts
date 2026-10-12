import { test } from '@playwright/test'

test('basemap verification - Bordeaux', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  
  await page.goto('/bordeaux')
  await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
  await page.waitForTimeout(8000) // Wait for tiles to load
  
  console.log('Errors:', errors.filter(e => !e.includes('GeoJSON')))
  
  await page.screenshot({ 
    path: 'screenshots/basemap-bordeaux.png',
    fullPage: false 
  })
})

test('basemap verification - Burgundy', async ({ page }) => {
  await page.goto('/burgundy')
  await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
  await page.waitForTimeout(8000)
  
  await page.screenshot({ 
    path: 'screenshots/basemap-burgundy.png',
    fullPage: false 
  })
})
