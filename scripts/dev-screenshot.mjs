// Dev-only helper: screenshot app pages via Chrome DevTools Protocol.
// Usage: node scripts/dev-screenshot.mjs <url> <outfile> [waitMs] [actionsJs]
// Requires a headless Chrome with --remote-debugging-port=9222.

import { writeFileSync } from 'node:fs'

const [url, outfile, waitMsArg, actionsJs] = process.argv.slice(2)
const waitMs = Number(waitMsArg ?? 5000)

if (!url || !outfile) {
  console.error('usage: node scripts/dev-screenshot.mjs <url> <outfile> [waitMs] [actionsJs]')
  process.exit(1)
}

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
let page = targets.find((t) => t.type === 'page')

if (!page) {
  page = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json()
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
await send('Page.navigate', { url })
await new Promise((resolve) => setTimeout(resolve, waitMs))

if (actionsJs) {
  await send('Runtime.evaluate', { expression: actionsJs, awaitPromise: true })
  await new Promise((resolve) => setTimeout(resolve, 1600))
}

const { data } = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(outfile, Buffer.from(data, 'base64'))
console.log('saved', outfile)
ws.close()
process.exit(0)
