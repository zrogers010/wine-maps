// Dev-only helper: navigate, optionally zoom/hover the map, then screenshot.
// Usage: node scripts/dev-hover-screenshot.mjs <url> <outfile> <x> <y> [zoom] [settleMs]

import { writeFileSync } from 'node:fs'

const [url, outfile, xArg, yArg, zoomArg, settleArg] = process.argv.slice(2)
const x = Number(xArg)
const y = Number(yArg)
const zoom = zoomArg ? Number(zoomArg) : null
const settleMs = Number(settleArg ?? 2200)

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

// `zoom` here is the number of wheel bursts to send toward the target point.
if (zoom !== null) {
  for (let i = 0; i < zoom; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX: 0,
      deltaY: -900,
    })
    await new Promise((resolve) => setTimeout(resolve, 260))
  }
  await new Promise((resolve) => setTimeout(resolve, 1400))
}

// Wiggle onto the target point so MapLibre fires mousemove on the layer.
for (const [dx, dy] of [[-6, -6], [0, 0], [1, 1]]) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: x + dx,
    y: y + dy,
    buttons: 0,
  })
  await new Promise((resolve) => setTimeout(resolve, 220))
}

await new Promise((resolve) => setTimeout(resolve, settleMs))

const { data } = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(outfile, Buffer.from(data, 'base64'))
console.log('saved', outfile)
ws.close()
process.exit(0)
