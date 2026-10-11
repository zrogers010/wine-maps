// Dev-only helper: navigate, expand a legend group, hover a legend row, then
// screenshot after the camera flight settles.
// Usage: node scripts/dev-legend-hover-screenshot.mjs <url> <outfile> <groupTitle> <rowLabel>

import { writeFileSync } from 'node:fs'

const [url, outfile, groupTitle, rowLabel] = process.argv.slice(2)

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

const expandResult = await send('Runtime.evaluate', {
  expression: `(() => {
    const headers = [...document.querySelectorAll('.region-legend h2')]
    const header = headers.find((h) => h.textContent.includes(${JSON.stringify(groupTitle)}))
    if (!header) return 'group not found'
    header.click()
    return 'expanded'
  })()`,
  returnByValue: true,
})
console.log('expand:', expandResult.result.value)
await new Promise((resolve) => setTimeout(resolve, 900))

const rowResult = await send('Runtime.evaluate', {
  expression: `(() => {
    const rows = [...document.querySelectorAll('.region-legend-row')]
    const row = rows.find((r) => r.textContent.trim() === ${JSON.stringify(rowLabel)})
    if (!row) return null
    row.scrollIntoView({ block: 'center' })
    const rect = row.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })()`,
  returnByValue: true,
})

if (!rowResult.result.value) {
  console.error('row not found:', rowLabel)
  process.exit(1)
}

const point = rowResult.result.value
console.log('row at', point)

for (const [dx, dy] of [[-4, -2], [0, 0], [1, 1]]) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x + dx,
    y: point.y + dy,
    buttons: 0,
  })
  await new Promise((resolve) => setTimeout(resolve, 250))
}

// Let the flyTo flight settle before capturing.
await new Promise((resolve) => setTimeout(resolve, 4200))

const { data } = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(outfile, Buffer.from(data, 'base64'))
console.log('saved', outfile)
ws.close()
process.exit(0)
