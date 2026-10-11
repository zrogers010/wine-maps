// Dev-only helper: capture home-page thumbnail images for each region map.
// Navigates to each region, jumps the camera to a curated scenic view via the
// __wineMap dev handle, hides the UI overlays, and saves a cropped JPEG.
// Usage: node scripts/dev-home-thumbnails.mjs [baseUrl]

import { mkdirSync, writeFileSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const outputDir = 'public/images/home'

const shots = [
  { id: 'bordeaux', path: '/bordeaux', center: [-0.35, 44.86], zoom: 9.1 },
  // Bearing turns the north-south Côte d'Or strip horizontal for a 16:10 crop.
  { id: 'burgundy', path: '/burgundy', center: [4.96, 47.17], zoom: 11.6, bearing: 62 },
  { id: 'champagne', path: '/champagne', center: [4.1, 48.75], zoom: 7.7 },
  { id: 'alsace', path: '/alsace', center: [7.3, 48.1], zoom: 9.1, bearing: 65 },
]

const hideUiCss = `
  .region-top-nav, .region-legend, .hover-region-card, .map-source-badge,
  .maplibregl-ctrl, .map-loading-veil { display: none !important; }
  .map-only-shell { inset: 0 !important; }
`

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = targets.find((t) => t.type === 'page')
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
  deviceScaleFactor: 1,
  mobile: false,
})

mkdirSync(outputDir, { recursive: true })

for (const shot of shots) {
  await send('Page.navigate', { url: `${baseUrl}${shot.path}` })
  await new Promise((resolve) => setTimeout(resolve, 8000))

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const style = document.createElement('style')
        style.textContent = ${JSON.stringify(hideUiCss)}
        document.head.appendChild(style)
        window.__wineMap && window.__wineMap.jumpTo({
          center: [${shot.center[0]}, ${shot.center[1]}],
          zoom: ${shot.zoom},
          bearing: ${shot.bearing ?? 0},
        })
      })()
    `,
  })
  await new Promise((resolve) => setTimeout(resolve, 5000))

  const { data } = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 82,
    clip: { x: 80, y: 50, width: 1280, height: 800, scale: 1 },
  })
  const outfile = `${outputDir}/${shot.id}.jpg`
  writeFileSync(outfile, Buffer.from(data, 'base64'))
  console.log('saved', outfile)
}

ws.close()
process.exit(0)
