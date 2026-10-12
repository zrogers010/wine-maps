// Dev-only helper: navigate, jump the map camera to an exact lng/lat/zoom via
// the __wineMap dev handle, hover a screen point, then screenshot.
// Usage: node scripts/dev-jump-hover-screenshot.mjs <url> <outfile> <lng> <lat> <zoom> [hoverX] [hoverY]

import { writeFileSync } from 'node:fs'

const [url, outfile, lngArg, latArg, zoomArg, hoverXArg, hoverYArg] =
  process.argv.slice(2)
const lng = Number(lngArg)
const lat = Number(latArg)
const zoom = Number(zoomArg)
const hoverX = Number(hoverXArg ?? 720)
const hoverY = Number(hoverYArg ?? 450)

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
  deviceScaleFactor: 2,
  mobile: false,
})
await send('Page.navigate', { url })
await new Promise((resolve) => setTimeout(resolve, 8000))

await send('Runtime.evaluate', {
  expression: `window.__wineMap && window.__wineMap.jumpTo({ center: [${lng}, ${lat}], zoom: ${zoom} })`,
})
await new Promise((resolve) => setTimeout(resolve, 2500))

for (const [dx, dy] of [[-6, -6], [0, 0], [1, 1]]) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: hoverX + dx,
    y: hoverY + dy,
    buttons: 0,
  })
  await new Promise((resolve) => setTimeout(resolve, 220))
}

await new Promise((resolve) => setTimeout(resolve, 1600))

const { data } = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(outfile, Buffer.from(data, 'base64'))
console.log('saved', outfile)
ws.close()
process.exit(0)
