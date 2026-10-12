import { test, expect } from '@playwright/test'

test('verify hover interaction', async ({ page }) => {
  await page.goto('/bordeaux')
  await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
  await page.waitForTimeout(8000)
  
  // Check initial state
  const initialCard = await page.locator('.hover-region-card').textContent()
  console.log('Initial card:', initialCard)
  
  const canvas = await page.locator('.maplibregl-canvas')
  const box = await canvas.boundingBox()
  
  if (box) {
    // Move to Pauillac area
    const x = box.x + box.width * 0.38
    const y = box.y + box.height * 0.35
    console.log(`Moving mouse to ${x}, ${y}`)
    await page.mouse.move(x, y, { steps: 10 })
    await page.waitForTimeout(1000)
    
    const hoveredCard = await page.locator('.hover-region-card').textContent()
    console.log('Hovered card:', hoveredCard)
    
    await page.screenshot({ 
      path: 'screenshots/hover-verified.png',
      fullPage: false 
    })
    
    // Verify hover card changed
    expect(hoveredCard).not.toEqual(initialCard)
  }
})
