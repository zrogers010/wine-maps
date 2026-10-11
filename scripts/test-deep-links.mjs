/**
 * Playwright test to verify deep links work correctly
 * Tests: one appellation, one region, and home page
 */

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotsDir = path.resolve(__dirname, '../docs/qa')

async function testDeepLinks() {
  fs.mkdirSync(screenshotsDir, { recursive: true })

  const browser = await chromium.launch()
  const baseURL = 'http://localhost:4173'

  const tests = [
    // One appellation: Pauillac
    {
      url: `${baseURL}/bordeaux/pauillac`,
      name: 'pauillac-desktop',
      viewport: { width: 1920, height: 1080 },
      checks: {
        title: 'Pauillac',
        canonical: 'https://sommeliermaps.com/bordeaux/pauillac',
        h1: 'Pauillac',
      },
    },
    // One region: Bordeaux
    {
      url: `${baseURL}/bordeaux`,
      name: 'bordeaux-region',
      viewport: { width: 1920, height: 1080 },
      checks: {
        title: 'Bordeaux Wine Map',
        canonical: 'https://sommeliermaps.com/bordeaux',
        h1: 'Bordeaux Wine Region',
      },
    },
    // Home page
    {
      url: `${baseURL}/`,
      name: 'home',
      viewport: { width: 1920, height: 1080 },
      checks: {
        title: 'SommelierMaps',
        canonical: 'https://sommeliermaps.com/',
        h1: 'Interactive Wine Region Maps for WSET Study',
      },
    },
  ]

  for (const test of tests) {
    console.log(`\n🧪 Testing: ${test.name}`)
    const page = await browser.newPage({ viewport: test.viewport })

    // Listen for console errors
    const consoleErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto(test.url, { waitUntil: 'networkidle' })

    // Wait for React to mount
    await page.waitForTimeout(1000)

    // Check title
    const title = await page.title()
    console.log(`  Title: ${title}`)
    if (test.checks.title && !title.includes(test.checks.title)) {
      throw new Error(`Title mismatch: expected "${test.checks.title}", got "${title}"`)
    }

    // Check canonical link
    if (test.checks.canonical) {
      const canonical = await page.evaluate(() => {
        const link = document.querySelector('link[rel="canonical"]')
        return link?.href
      })
      console.log(`  Canonical: ${canonical}`)
      if (canonical !== test.checks.canonical) {
        throw new Error(`Canonical mismatch: expected "${test.checks.canonical}", got "${canonical}"`)
      }
    }

    // Check H1
    if (test.checks.h1) {
      const h1Text = await page.evaluate(() => {
        const h1 = document.querySelector('h1')
        return h1?.textContent?.trim()
      })
      console.log(`  H1: ${h1Text}`)
      if (h1Text !== test.checks.h1) {
        throw new Error(`H1 mismatch: expected "${test.checks.h1}", got "${h1Text}"`)
      }
    }

    // Check hash
    if (test.checks.hash) {
      const hash = await page.evaluate(() => window.location.hash)
      console.log(`  Hash: ${hash}`)
      if (hash !== test.checks.hash) {
        throw new Error(`Hash mismatch: expected "${test.checks.hash}", got "${hash}"`)
      }
    }

    // Report console errors
    if (consoleErrors.length > 0) {
      console.log(`  ⚠️  Console errors:`, consoleErrors)
    } else {
      console.log(`  ✅ No console errors`)
    }

    // Take screenshot
    const screenshotPath = path.join(screenshotsDir, `${test.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`  📸 Screenshot: ${screenshotPath}`)

    await page.close()
  }

  await browser.close()
  console.log(`\n✅ All tests complete. Screenshots saved to: ${screenshotsDir}`)
}

testDeepLinks().catch((error) => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
