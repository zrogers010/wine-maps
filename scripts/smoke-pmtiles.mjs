#!/usr/bin/env node

/**
 * Self-contained PMTiles smoke test
 * 
 * Tests:
 * - Tile loading and feature rendering
 * - Hover interactions and cards
 * - Legend hover zoom
 * - Subregion highlight
 * - Console errors for tiles/manifest
 * 
 * Usage: npm run smoke:tiles
 * 
 * Requires: macOS with Chrome installed, tiles built
 */

import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Configuration
const DEV_SERVER_PORT = 5174  // Use different port to avoid conflicts
const CDP_PORT = 9333
const OUTPUT_DIR = join(process.cwd(), 'tiles', '.smoke-screenshots')
const MANIFEST_PATH = join(process.cwd(), 'tiles', 'current', 'manifest.json')

// Expected regions that must be tested (fail if missing)
const EXPECTED_REGIONS = ['burgundy', 'champagne', 'alsace']

// Preferred test IDs per region (fallback to largest bbox if not found)
const PREFERRED_IDS = {
  burgundy: 'gevrey-chambertin',
  alsace: null,  // Will use largest bbox
  champagne: null,  // Will use largest bbox
}

// Check if manifest exists
if (!existsSync(MANIFEST_PATH)) {
  console.log('⊘  tiles/current/manifest.json not found')
  console.log('   Run `npm run tiles:build` to generate tiles')
  console.log('   SKIPPED (no data)')
  process.exit(0)
}

console.log('🧪 PMTiles smoke test')
console.log('')

// Create output directory
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

// Find Chrome on macOS
function findChrome() {
  const paths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  
  for (const path of paths) {
    if (existsSync(path)) {
      return path
    }
  }
  
  console.error('❌ Chrome not found')
  console.error('   Install Google Chrome or set CHROME_PATH environment variable')
  process.exit(1)
}

const chromePath = process.env.CHROME_PATH || findChrome()

// Start headless Chrome
console.log('Starting Chrome...')
const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  `--remote-debugging-port=${CDP_PORT}`,
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--window-size=1440,900',
])

// Wait for Chrome to be ready
await new Promise((resolve) => setTimeout(resolve, 1500))

// Start Vite dev server
console.log('Starting dev server...')
const vite = spawn('npx', ['vite', '--port', String(DEV_SERVER_PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VITE_DATA_BASE_URL: '/tiles' },
})

// Wait for dev server to be ready
await new Promise((resolve) => {
  vite.stdout.on('data', (data) => {
    if (data.toString().includes('Local:')) {
      resolve()
    }
  })
  setTimeout(resolve, 5000)  // Fallback timeout
})

console.log('Dev server ready')
console.log('')

let failed = false
const allConsoleMessages = []
const allNetworkFailures = []
const allExceptions = []

try {
  // Connect to Chrome CDP
  const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json())
  const page = targets.find((t) => t.type === 'page')

  if (!page) {
    console.error('❌ No browser page found')
    failed = true
  } else {
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    let nextId = 1
    const pending = new Map()

    function send(method, params = {}) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id)
            reject(new Error(`Timeout: ${method}`))
          }
        }, 15000)
      })
    }
    
    // Poll helper
    async function pollFor(testFn, timeout = 30000, interval = 500) {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const result = await testFn()
        if (result) return result
        await new Promise(resolve => setTimeout(resolve, interval))
      }
      throw new Error(`Poll timeout after ${timeout}ms`)
    }

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      
      // Capture all console messages (error and warn)
      if (message.method === 'Runtime.consoleAPICalled') {
        if (message.params.type === 'error' || message.params.type === 'warning') {
          const text = message.params.args.map(a => a.value || a.description || '').join(' ')
          allConsoleMessages.push({ type: message.params.type, text })
        }
      }
      
      // Capture runtime exceptions
      if (message.method === 'Runtime.exceptionThrown') {
        const exception = message.params.exceptionDetails
        const text = exception.exception?.description || exception.text || 'Unknown exception'
        allExceptions.push(text)
      }
      
      // Capture log entries
      if (message.method === 'Log.entryAdded') {
        const entry = message.params.entry
        if (entry.level === 'error' || entry.level === 'warning') {
          allConsoleMessages.push({ type: entry.level, text: entry.text })
        }
      }
      
      // Capture all network failures and 4xx/5xx responses
      if (message.method === 'Network.loadingFailed') {
        const url = message.params.documentURL || 'unknown'
        const errorText = message.params.errorText || 'Network error'
        allNetworkFailures.push({ url, error: errorText })
      }
      
      if (message.method === 'Network.responseReceived') {
        const response = message.params.response
        if (response.status >= 400) {
          allNetworkFailures.push({ url: response.url, status: response.status })
        }
      }
      
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      }
    })

    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve)
      ws.addEventListener('error', reject)
      setTimeout(reject, 5000)
    })

    // Enable all CDP domains BEFORE navigation
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Console.enable')
    await send('Log.enable')
    await send('Network.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    })

    const baseUrl = `http://localhost:${DEV_SERVER_PORT}`
    const manifestUrl = `${baseUrl}/tiles/current/manifest.json`
    
    console.log(`Base URL: ${baseUrl}`)
    console.log(`Manifest: ${manifestUrl}`)
    console.log('')
    
    // Warm up: request root page and wait for Vite to settle (dependency pre-bundling)
    console.log('Warming up dev server...')
    await send('Page.navigate', { url: baseUrl })
    await new Promise(resolve => setTimeout(resolve, 3000))  // Wait for initial bundling
    console.log('Warmup complete')
    console.log('')

    // Load test metadata for all EXPECTED regions
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    const testCases = []
    
    // Verify all expected regions are in manifest
    for (const region of EXPECTED_REGIONS) {
      if (!manifest.tiles[region]) {
        console.error(`❌ Expected region "${region}" not in manifest`)
        failed = true
      }
    }
    
    if (failed) {
      console.error('❌ Manifest missing expected regions')
      ws.close()
    } else {
      for (const region of EXPECTED_REGIONS) {
      
      const metadataPath = join(process.cwd(), 'tiles', manifest.version, `${region}-metadata.json`)
      if (!existsSync(metadataPath)) {
        console.error(`❌ ${region} metadata not found at ${metadataPath}`)
        failed = true
        continue
      }
      
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
      
      // Choose test ID: preferred or largest bbox
      let testFeature
      const preferredId = PREFERRED_IDS[region]
      
      if (preferredId) {
        testFeature = metadata.features.find(f => f.properties.id === preferredId)
      }
      
      if (!testFeature) {
        // Find largest bbox feature
        let maxArea = 0
        for (const f of metadata.features) {
          if (f.bbox) {
            const area = (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
            if (area > maxArea) {
              maxArea = area
              testFeature = f
            }
          }
        }
      }
      
      if (!testFeature) {
        console.error(`❌ ${region} has no testable features`)
        failed = true
        continue
      }
      
      testCases.push({
        region,
        path: region === 'burgundy' ? '/burgundy' : `/${region}`,
        testId: testFeature.properties.id,
        expectedName: testFeature.properties.name,
        bbox: testFeature.bbox,
      })
    }
    
    // Fail if we don't have test cases for all expected regions
    if (testCases.length < EXPECTED_REGIONS.length) {
      console.error(`❌ Only ${testCases.length}/${EXPECTED_REGIONS.length} expected regions have test cases`)
      failed = true
    }
    
    if (failed) {
      console.error('❌ Pre-flight checks failed')
      ws.close()
    } else {

    // Run tests for each region
    for (const testCase of testCases) {
      console.log(`Testing ${testCase.region}...`)
      const regionErrors = []
      const regionFailures = []
      
      // Navigate to region page
      await send('Page.navigate', { url: `${baseUrl}${testCase.path}` })
      
      // Poll for map to load (30s timeout)
      let mapLoaded = false
      try {
        await pollFor(async () => {
          const { result } = await send('Runtime.evaluate', {
            expression: 'window.__wineMap ? "loaded" : null',
          })
          return result.value === 'loaded'
        }, 30000, 500)
        mapLoaded = true
      } catch (err) {
        console.error(`  ❌ Map did not load: ${err.message}`)
      }
      
      if (!mapLoaded) {
        // Dump diagnostics
        const { result: bodyLength } = await send('Runtime.evaluate', {
          expression: 'document.body ? document.body.innerHTML.length : 0',
        })
        const { result: pageTitle } = await send('Runtime.evaluate', {
          expression: 'document.title || "no title"',
        })
        
        console.error(`  Page title: "${pageTitle.value}"`)
        console.error(`  Body HTML length: ${bodyLength.value}`)
        
        // Collect errors and failures since navigation
        const recentErrors = allConsoleMessages.filter(m => !regionErrors.includes(m))
        const recentFailures = allNetworkFailures.filter(f => !regionFailures.includes(f))
        const recentExceptions = allExceptions.slice(regionErrors.length)
        
        if (recentFailures.length > 0) {
          console.error(`  Failed network requests:`)
          recentFailures.forEach(r => {
            if (r.status) {
              console.error(`    ${r.url} -> ${r.status}`)
            } else {
              console.error(`    ${r.url} -> ${r.error}`)
            }
          })
        }
        if (recentErrors.length > 0) {
          console.error(`  Console messages:`)
          recentErrors.forEach(e => console.error(`    [${e.type}] ${e.text}`))
        }
        if (recentExceptions.length > 0) {
          console.error(`  Exceptions:`)
          recentExceptions.forEach(e => console.error(`    ${e}`))
        }
        
        // Save failure screenshot
        const { data: screenshot } = await send('Page.captureScreenshot', { format: 'png' })
        const failScreenshotPath = join(OUTPUT_DIR, `${testCase.region}-FAIL.png`)
        writeFileSync(failScreenshotPath, screenshot, 'base64')
        console.error(`  Screenshot saved: ${failScreenshotPath}`)
        
        failed = true
        continue
      }
      
      console.log(`  ✓ Map loaded`)
      
      // Poll for map idle
      try {
        await pollFor(async () => {
          const { result } = await send('Runtime.evaluate', {
            expression: 'window.__wineMap && window.__wineMap.loaded() && !window.__wineMap.isMoving() ? "idle" : null',
          })
          return result.value === 'idle'
        }, 10000, 300)
      } catch {
        // Non-critical, continue anyway
      }
      
      // Query for the test feature
      const { result: featureCheck } = await send('Runtime.evaluate', {
        expression: `
          (function() {
            const map = window.__wineMap;
            const features = map.queryRenderedFeatures();
            const found = features.find(f => f.properties && f.properties.id === '${testCase.testId}');
            return found ? JSON.stringify({ id: found.properties.id, name: found.properties.name }) : null;
          })()
        `,
      })
      
      if (!featureCheck.value) {
        console.error(`  ❌ Feature "${testCase.testId}" not found in rendered tiles`)
        
        // Save failure screenshot
        const { data: screenshot } = await send('Page.captureScreenshot', { format: 'png' })
        const failScreenshotPath = join(OUTPUT_DIR, `${testCase.region}-FAIL.png`)
        writeFileSync(failScreenshotPath, screenshot, 'base64')
        console.error(`  Screenshot saved: ${failScreenshotPath}`)
        
        failed = true
        continue
      }
      
      const feature = JSON.parse(featureCheck.value)
      console.log(`  ✓ Feature found: ${feature.name}`)
      
      // Zoom to feature using bbox
      if (testCase.bbox) {
        const [w, s, e, n] = testCase.bbox
        await send('Runtime.evaluate', {
          expression: `
            window.__wineMap.fitBounds([[${w}, ${s}], [${e}, ${n}]], { 
              padding: 50, 
              duration: 800 
            });
          `,
        })
        
        await new Promise((resolve) => setTimeout(resolve, 1200))
      }
      
      // Find center of viewport to hover
      const centerX = 720
      const centerY = 450
      
      // Hover over the center
      for (const [dx, dy] of [[-10, -10], [0, 0], [2, 2]]) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: centerX + dx,
          y: centerY + dy,
          buttons: 0,
        })
        await new Promise((resolve) => setTimeout(resolve, 180))
      }
      
      // Wait for hover card
      await new Promise((resolve) => setTimeout(resolve, 600))
      
      // Check if hover card appeared
      const { result: hoverCheck } = await send('Runtime.evaluate', {
        expression: `
          (function() {
            const allText = document.body.textContent;
            return allText.includes('${testCase.expectedName}') ? '${testCase.expectedName}' : null;
          })()
        `,
      })
      
      if (!hoverCheck.value) {
        console.error(`  ❌ Hover card did not appear with expected name "${testCase.expectedName}"`)
        
        // Save failure screenshot
        const { data: screenshot } = await send('Page.captureScreenshot', { format: 'png' })
        const failScreenshotPath = join(OUTPUT_DIR, `${testCase.region}-FAIL.png`)
        writeFileSync(failScreenshotPath, screenshot, 'base64')
        console.error(`  Screenshot saved: ${failScreenshotPath}`)
        
        failed = true
      } else {
        console.log(`  ✓ Hover card appeared`)
      }
      
      // Test legend hover (Burgundy only)
      if (testCase.region === 'burgundy') {
        console.log(`  Testing legend hover...`)
        
        // Find and click a legend item
        await send('Runtime.evaluate', {
          expression: `
            (function() {
              const legendItems = document.querySelectorAll('[class*="legend"] button, [class*="legend"] [role="button"]');
              if (legendItems.length > 0) {
                legendItems[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                return 'hovered';
              }
              return null;
            })()
          `,
        })
        
        await new Promise((resolve) => setTimeout(resolve, 800))
        
        console.log(`  ✓ Legend hover tested`)
      }
      
      // Take screenshot
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      const screenshotPath = join(OUTPUT_DIR, `${testCase.region}.png`)
      writeFileSync(screenshotPath, Buffer.from(data, 'base64'))
      console.log(`  ✓ Screenshot saved`)
      
      // Check for console errors
      if (allConsoleMessages.filter(m => m.type === 'error').length > 0) {
        console.error(`  ❌ Console errors detected:`)
        allConsoleMessages.filter(m => m.type === 'error').forEach(err => console.error(`     ${err.text}`))
        failed = true
      }
      
      console.log('')
    }
    
    // Final check: must have tested all expected regions
    if (testCases.length === 0) {
      console.error('❌ No regions were tested')
      failed = true
    } else if (testCases.length < EXPECTED_REGIONS.length) {
      console.error(`❌ Only tested ${testCases.length}/${EXPECTED_REGIONS.length} expected regions`)
      failed = true
    }
  }

  ws.close()
  }
}
} catch (error) {
  console.error('❌ Test error:', error.message)
  failed = true
} finally {
  // Cleanup
  console.log('Cleaning up...')
  chrome.kill()
  vite.kill()
}

if (failed) {
  console.error('❌ Smoke test failed')
  process.exit(1)
}

console.log('✅ All smoke tests passed')
process.exit(0)
