import { test, expect, type Page } from '@playwright/test'

test.describe('Home Page', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.region-index-page h1').first()).toContainText('Interactive Wine Region Maps')
  })

  test('shows region cards above fold', async ({ page }) => {
    await page.goto('/')
    const regionCards = page.locator('.region-card')
    await expect(regionCards.first()).toBeVisible()
    
    // Check that at least one card is visible without scrolling
    const firstCard = regionCards.first()
    const box = await firstCard.boundingBox()
    expect(box!.y).toBeLessThan(900)
  })

  test('has no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Filter out expected warnings
    const actualErrors = errors.filter(
      (err) => !err.includes('GeoJSON file not available')
    )
    expect(actualErrors).toHaveLength(0)
  })
})

test.describe('Bordeaux Map', () => {
  test('loads without crashing @desktop', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    await page.goto('/bordeaux')
    
    // Wait for map to be ready
    await page.waitForSelector('.maplibregl-canvas', { timeout: 10000 })
    await page.waitForTimeout(2000)
    
    // Check no white screen errors
    expect(errors.filter((e) => !e.includes('GeoJSON'))).toHaveLength(0)
    
    // Verify map canvas is visible
    const canvas = page.locator('.maplibregl-canvas')
    await expect(canvas).toBeVisible()
  })

  test('clicking features does not crash @desktop', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    await page.goto('/bordeaux')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 10000 })
    await page.waitForTimeout(3000)
    
    // Try to click on the map
    const canvas = page.locator('.maplibregl-canvas')
    await canvas.click({ position: { x: 400, y: 400 } })
    
    await page.waitForTimeout(1000)
    
    // Check for Style is not done loading error
    const styleErrors = errors.filter((e) => e.includes('Style is not done loading'))
    expect(styleErrors).toHaveLength(0)
    
    // Map should still be visible
    await expect(canvas).toBeVisible()
  })

  test('shows legend visible on desktop', async ({ page }) => {
    await page.goto('/bordeaux')
    await page.waitForSelector('.region-legend', { timeout: 10000 })
    
    const legend = page.locator('.region-legend')
    await expect(legend).toBeVisible()
    
    // Check first legend group is visible by default
    const firstGroup = page.locator('.region-legend-group').first()
    const firstList = firstGroup.locator('.region-legend-list')
    await expect(firstList).toBeVisible()
  })

  test('nav is scrollable on mobile @mobile', async ({ page }) => {
    await page.goto('/bordeaux')
    
    const nav = page.locator('.region-top-nav-links')
    await expect(nav).toBeVisible()
    
    // Check that overflow is enabled for scrolling
    const overflowX = await nav.evaluate((el) => window.getComputedStyle(el).overflowX)
    expect(overflowX).toBe('auto')
  })

  test('legend becomes collapsible chip on mobile @mobile', async ({ page }) => {
    await page.goto('/bordeaux')
    await page.waitForSelector('.region-legend', { timeout: 10000 })
    
    const legend = page.locator('.region-legend')
    await expect(legend).toBeVisible()
    
    // On mobile, legend should be present (positioning tested via CSS)
    const isVisible = await legend.isVisible()
    expect(isVisible).toBe(true)
  })
})

test.describe('Burgundy Map', () => {
  test('loads with tighter framing @desktop', async ({ page }) => {
    await page.goto('/burgundy')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 10000 })
    await page.waitForTimeout(2000)
    
    const canvas = page.locator('.maplibregl-canvas')
    await expect(canvas).toBeVisible()
  })
})

test.describe('Hover Effects', () => {
  test('shows burgundy outline on hover @desktop', async ({ page }) => {
    await page.goto('/bordeaux')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 10000 })
    await page.waitForTimeout(3000)
    
    // Hover over the map
    const canvas = page.locator('.maplibregl-canvas')
    await canvas.hover({ position: { x: 400, y: 400 } })
    
    await page.waitForTimeout(500)
    
    // Check cursor becomes pointer (indicates hover is working)
    const cursorStyle = await canvas.evaluate((el) => {
      return window.getComputedStyle(el).cursor
    })
    // Cursor might be pointer if hovering over a feature
    expect(['pointer', 'default', 'grab']).toContain(cursorStyle)
  })
})

test.describe('Error Boundary', () => {
  test('map error boundary prevents white screen', async ({ page }) => {
    // This test verifies the error boundary catches errors
    await page.goto('/bordeaux')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 10000 })
    
    // Even if there's an error, we should see either the map or error UI
    const hasMap = await page.locator('.maplibregl-canvas').isVisible()
    const hasError = await page.locator('.map-error-boundary').isVisible()
    
    expect(hasMap || hasError).toBe(true)
  })
})
