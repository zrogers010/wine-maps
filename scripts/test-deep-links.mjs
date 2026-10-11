/**
 * Playwright test to verify deep links work correctly
 */

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotsDir = path.resolve(__dirname, '../screenshots')

async function testDeepLinks() {
  fs.mkdirSync(screenshotsDir, { recursive: true })

  const browser = await chromium.launch()
  const baseURL = 'http://localhost:4173'

  const tests = [
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
    {
      url: `${baseURL}/bordeaux/pauillac`,
      name: 'pauillac-mobile',
      viewport: { width: 375, height: 667 },
      checks: {
        title: 'Pauillac',
        canonical: 'https://sommeliermaps.com/bordeaux/pauillac',
        h1: 'Pauillac',
      },
    },
    {
      url: `${baseURL}/burgundy/chablis`,
      name: 'chablis-desktop',
      viewport: { width: 1920, height: 1080 },
      checks: {
        title: 'Chablis',
        canonical: 'https://sommeliermaps.com/burgundy/chablis',
        h1: 'Chablis',
      },
    },
    {
      url: `${baseURL}/burgundy/chablis`,
      name: 'chablis-mobile',
      viewport: { width: 375, height: 667 },
      checks: {
        title: 'Chablis',
        canonical: 'https://sommeliermaps.com/burgundy/chablis',
        h1: 'Chablis',
      },
    },
    {
      url: `${baseURL}/bordeaux#12.5/44.9522/-0.7542`,
      name: 'bordeaux-hash-link',
      viewport: { width: 1920, height: 1080 },
      checks: {
        title: 'Bordeaux',
        hash: '#12.5/44.9522/-0.7542',
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

    try {
      await page.goto(test.url, { waitUntil: 'networkidle' })

      // Wait for React to mount
      await page.waitForTimeout(2000)

      // Check title
      const title = await page.title()
      console.log(`  Title: ${title}`)
      if (test.checks.title && !title.includes(test.checks.title)) {
        console.log(`  ❌ Title check failed: expected "${test.checks.title}"`)
      }

      // Check canonical
      if (test.checks.canonical) {
        const canonical = await page.$eval(
          'link[rel="canonical"]',
          (el) => el.getAttribute('href')
        )
        console.log(`  Canonical: ${canonical}`)
        if (canonical !== test.checks.canonical) {
          console.log(`  ❌ Canonical check failed`)
        }
      }

      // Check H1 (in prerendered content or app)
      if (test.checks.h1) {
        const h1 = await page.$eval('h1', (el) => el.textContent)
        console.log(`  H1: ${h1}`)
        if (!h1?.includes(test.checks.h1)) {
          console.log(`  ❌ H1 check failed`)
        }
      }

      // Check hash
      if (test.checks.hash) {
        const hash = await page.evaluate(() => window.location.hash)
        console.log(`  Hash: ${hash}`)
        if (!hash.includes(test.checks.hash.split('/')[0])) {
          console.log(`  ❌ Hash check failed`)
        }
      }

      // Check console errors
      if (consoleErrors.length > 0) {
        console.log(`  ⚠️  Console errors:`)
        consoleErrors.forEach((err) => console.log(`     ${err}`))
      } else {
        console.log(`  ✅ No console errors`)
      }

      // Take screenshot
      const screenshotPath = path.join(screenshotsDir, `${test.name}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: false })
      console.log(`  📸 Screenshot: ${screenshotPath}`)

    } catch (error) {
      console.error(`  ❌ Test failed:`, error.message)
    } finally {
      await page.close()
    }
  }

  await browser.close()
  console.log(`\n✅ All tests complete. Screenshots saved to: ${screenshotsDir}`)
}

testDeepLinks().catch((error) => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
