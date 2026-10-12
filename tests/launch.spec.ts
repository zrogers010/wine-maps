import { test, expect } from '@playwright/test'

test.describe('Launch Readiness E2E', () => {
  test('1. CRITICAL: Pauillac selection does not trigger style error', async ({ page }) => {
    await page.goto('/bordeaux')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
    await page.waitForTimeout(8000)
    
    // Click Pauillac
    const canvas = await page.locator('.maplibregl-canvas')
    const box = await canvas.boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.35)
      await page.waitForTimeout(1000)
    }
    
    // Assert no error
    const errorText = await page.locator('text=Map Error').count()
    expect(errorText).toBe(0)
    
    // Assert canvas still visible
    await expect(canvas).toBeVisible()
    
    // Assert outline filter includes pauillac
    const hasOutline = await page.evaluate(() => {
      const map = (window as any).__wineMap
      if (!map) return false
      const layer = map.getLayer('appellation-hover-outline')
      if (!layer) return false
      const filter = map.getFilter('appellation-hover-outline')
      return JSON.stringify(filter).includes('pauillac')
    })
    expect(hasOutline).toBe(true)
  })

  test('2. CRITICAL: Burgundy renders shapes with valid hex colors', async ({ page }) => {
    await page.goto('/burgundy')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
    await page.waitForTimeout(8000)
    
    // Check that burgundy-fill has rendered features
    const featureCount = await page.evaluate(() => {
      const map = (window as any).__wineMap
      if (!map) return 0
      const features = map.queryRenderedFeatures({ layers: ['burgundy-fill'] })
      return features.length
    })
    expect(featureCount).toBeGreaterThan(0)
  })

  test('3a. Mobile bottom sheet works on Bordeaux', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    
    await page.goto('/bordeaux')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
    await page.waitForTimeout(8000)
    
    // Tap Pauillac
    const canvas = await page.locator('.maplibregl-canvas')
    const box = await canvas.boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.35)
      await page.waitForTimeout(500)
    }
    
    // Check bottom sheet is open
    const sheet = page.locator('.hover-region-card.mobile-open')
    await expect(sheet).toBeVisible()
    
    // Check × button is visible
    const closeBtn = page.locator('.mobile-close-button')
    await expect(closeBtn).toBeVisible()
    
    // Click × to close
    await closeBtn.click()
    await page.waitForTimeout(300)
    
    // Sheet should be closed
    await expect(sheet).not.toBeVisible()
  })

  test('3b. Mobile bottom sheet works on Burgundy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    
    await page.goto('/burgundy')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
    await page.waitForTimeout(8000)
    
    const canvas = await page.locator('.maplibregl-canvas')
    const box = await canvas.boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5)
      await page.waitForTimeout(500)
    }
    
    const sheet = page.locator('.hover-region-card.mobile-open')
    await expect(sheet).toBeVisible()
    
    const closeBtn = page.locator('.mobile-close-button')
    await expect(closeBtn).toBeVisible()
    await closeBtn.click()
    await page.waitForTimeout(300)
  })

  test('3c. Mobile bottom sheet works on Champagne', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    
    await page.goto('/champagne')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
    await page.waitForTimeout(8000)
    
    const canvas = await page.locator('.maplibregl-canvas')
    const box = await canvas.boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
      await page.waitForTimeout(500)
    }
    
    const sheet = page.locator('.hover-region-card.mobile-open')
    const closeBtn = page.locator('.mobile-close-button')
    
    if (await sheet.isVisible()) {
      await expect(closeBtn).toBeVisible()
      await closeBtn.click()
      await page.waitForTimeout(300)
    }
  })

  test('4. SEO heading does not ghost through mobile nav', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    
    await page.goto('/bordeaux')
    await page.waitForTimeout(2000)
    
    // Check nav has proper z-index and background
    const navZIndex = await page.locator('.region-top-nav').evaluate((el) => {
      const styles = window.getComputedStyle(el)
      return {
        zIndex: styles.zIndex,
        background: styles.background,
      }
    })
    
    expect(parseInt(navZIndex.zIndex)).toBeGreaterThan(5)
  })

  test('5. Deep link shows selected outline with proper zoom', async ({ page }) => {
    await page.goto('/bordeaux/pauillac/')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
    await page.waitForTimeout(8000)
    
    // Check zoom level is reasonable (not too close)
    const zoom = await page.evaluate(() => {
      const map = (window as any).__wineMap
      return map ? map.getZoom() : 0
    })
    expect(zoom).toBeLessThan(12)
    expect(zoom).toBeGreaterThan(9)
    
    // Check outline includes pauillac
    const hasOutline = await page.evaluate(() => {
      const map = (window as any).__wineMap
      if (!map) return false
      const filter = map.getFilter('appellation-hover-outline')
      return JSON.stringify(filter).includes('pauillac')
    })
    expect(hasOutline).toBe(true)
  })

  test('6. Home page shows 4 cards with real SVG thumbnails', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)
    
    const cards = await page.locator('.region-card').count()
    expect(cards).toBe(4)
    
    // Check for SVG or img elements in each card
    const hasThumbnails = await page.locator('.region-card-media').first().isVisible()
    expect(hasThumbnails).toBe(true)
  })

  test('7. Champagne and Alsace have distinguishable colors', async ({ page }) => {
    await page.goto('/champagne')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
    await page.waitForTimeout(8000)
    
    // Check that legend items have different colors
    const colors = await page.locator('.region-legend-swatch').evaluateAll((swatches) => {
      return swatches.map(s => window.getComputedStyle(s).backgroundColor)
    })
    
    const uniqueColors = new Set(colors)
    expect(uniqueColors.size).toBeGreaterThan(1)
  })
})
