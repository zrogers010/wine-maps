#!/usr/bin/env node

/**
 * PMTiles smoke test - validates that tile data loads and hovers work
 * Requires dev server running on http://localhost:5173
 * Usage: node scripts/smoke-pmtiles.mjs
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Known stable IDs per region for hover tests
const REGIONS = [
  {
    path: '/burgundy',
    name: 'Burgundy',
    testId: 'gevrey-chambertin',
    expectedName: 'Gevrey-Chambertin',
  },
  {
    path: '/alsace',
    name: 'Alsace',
    testId: 'alsace-grand-cru-riesling',
    expectedName: 'Alsace Grand Cru',
  },
  {
    path: '/champagne',
    name: 'Champagne',
    testId: 'montagne-de-reims',
    expectedName: 'Montagne de Reims',
  },
]

// Output directory for screenshots (gitignored)
const OUTPUT_DIR = join(process.cwd(), 'tiles', '.smoke-screenshots')

// Check if manifest exists
const MANIFEST_PATH = join(process.cwd(), 'tiles', 'current', 'manifest.json')
if (!existsSync(MANIFEST_PATH)) {
  console.log('⊘  tiles/current/manifest.json not found')
  console.log('   Run `npm run tiles:build` to generate tiles before running smoke tests')
  console.log('   Skipping smoke test (CI without data is OK)')
  process.exit(0)
}

console.log('🧪 PMTiles smoke test')
console.log('')

// Connect to Chrome DevTools Protocol
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = targets.find((t) => t.type === 'page')

if (!page) {
  console.error('❌ No browser page found')
  console.error('   Start Chrome with --remote-debugging-port=9222')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()

function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
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
})

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false,
})

// Create output directory
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

let failed = false

for (const region of REGIONS) {
  console.log(`Testing ${region.name}...`)
  
  // Navigate to region page
  await send('Page.navigate', { url: `http://localhost:5173${region.path}` })
  
  // Wait for initial load
  await new Promise((resolve) => setTimeout(resolve, 8000))
  
  // Check if map loaded by querying for MapLibre instance
  const { result: mapCheck } = await send('Runtime.evaluate', {
    expression: 'window.__wineMap ? "loaded" : "not found"',
  })
  
  if (mapCheck.value !== 'loaded') {
    console.error(`  ❌ Map did not load`)
    failed = true
    continue
  }
  
  console.log(`  ✓ Map loaded`)
  
  // Wait for tiles to settle
  await new Promise((resolve) => setTimeout(resolve, 2000))
  
  // Query for a feature with the test ID
  const { result: featureCheck } = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const map = window.__wineMap;
        const features = map.queryRenderedFeatures();
        const found = features.find(f => f.properties && f.properties.id === '${region.testId}');
        return found ? JSON.stringify({ id: found.properties.id, name: found.properties.name }) : null;
      })()
    `,
  })
  
  if (!featureCheck.value) {
    console.error(`  ❌ Feature "${region.testId}" not found in rendered tiles`)
    failed = true
    continue
  }
  
  const feature = JSON.parse(featureCheck.value)
  console.log(`  ✓ Feature found: ${feature.name}`)
  
  // Get feature bounds and zoom to it
  const { result: bounds } = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const map = window.__wineMap;
        const features = map.queryRenderedFeatures().filter(f => f.properties && f.properties.id === '${region.testId}');
        if (!features.length) return null;
        
        const coords = features[0].geometry.coordinates;
        let allCoords = [];
        
        function flatten(arr) {
          if (typeof arr[0] === 'number') {
            allCoords.push(arr);
          } else {
            arr.forEach(flatten);
          }
        }
        
        flatten(coords);
        
        const lngs = allCoords.map(c => c[0]);
        const lats = allCoords.map(c => c[1]);
        
        return {
          minLng: Math.min(...lngs),
          maxLng: Math.max(...lngs),
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats)
        };
      })()
    `,
  })
  
  if (bounds.value) {
    const bbox = JSON.parse(bounds.value)
    const centerLng = (bbox.minLng + bbox.maxLng) / 2
    const centerLat = (bbox.minLat + bbox.maxLat) / 2
    
    // Zoom to feature
    await send('Runtime.evaluate', {
      expression: `
        window.__wineMap.flyTo({
          center: [${centerLng}, ${centerLat}],
          zoom: 13,
          duration: 800
        });
      `,
    })
    
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
  
  // Find center of viewport to hover
  const centerX = 720
  const centerY = 450
  
  // Hover over the center (should be on the feature)
  for (const [dx, dy] of [[-10, -10], [0, 0], [2, 2]]) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: centerX + dx,
      y: centerY + dy,
      buttons: 0,
    })
    await new Promise((resolve) => setTimeout(resolve, 180))
  }
  
  // Wait for hover card to appear
  await new Promise((resolve) => setTimeout(resolve, 600))
  
  // Check if hover card appeared with expected name
  const { result: hoverCheck } = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const hoverCards = document.querySelectorAll('[class*="hover-card"], [class*="HoverCard"]');
        for (const card of hoverCards) {
          if (card.textContent.includes('${feature.name}')) {
            return card.textContent;
          }
        }
        return null;
      })()
    `,
  })
  
  if (!hoverCheck.value) {
    console.error(`  ❌ Hover card did not appear with expected name "${feature.name}"`)
    failed = true
  } else {
    console.log(`  ✓ Hover card appeared`)
  }
  
  // Take screenshot
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  const screenshotPath = join(OUTPUT_DIR, `${region.name.toLowerCase()}.png`)
  writeFileSync(screenshotPath, Buffer.from(data, 'base64'))
  console.log(`  ✓ Screenshot saved: ${screenshotPath}`)
  
  console.log('')
}

ws.close()

if (failed) {
  console.error('❌ Smoke test failed')
  process.exit(1)
}

console.log('✅ All smoke tests passed')
process.exit(0)
