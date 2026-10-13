#!/usr/bin/env node
/**
 * Generates the home-page region thumbnails (public/thumbnails/<region>.svg) as
 * real, simplified appellation outlines from the runtime GeoJSON in public/data.
 *
 * The output is small, committed static SVG (no user input), served as cacheable
 * files and fetched by the home page, so builds/CI need no map data and the JS
 * bundle carries no geometry. Re-run after a data update:
 *   node scripts/generate-region-svgs.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 160 // viewBox matches the 16:10 card media
const H = 100
const PAD = 9
const QUANT = 0.25 // viewBox units; coordinates are snapped to this grid
const TOLERANCE = 0.45 // Douglas–Peucker tolerance in viewBox units (~0.7 px on a 240 px card)
const MIN_RING_AREA = 0.2 // viewBox units² — drops slivers invisible at card size

// Thumbnail palettes: same colour families as the live maps, slightly richer so
// they read at 240 px wide. `match` is tested against feature ids in order.
const regions = {
  bordeaux: {
    file: 'public/data/france/bordeaux/bordeaux-display-exclusive-2026.geojson',
    halo: '#dcc0a6',
    strokeWidth: 1.3,
    groups: [
      [/^(medoc|haut-medoc|saint-estephe|pauillac|saint-julien|margaux|moulis-en-medoc|listrac-medoc)$/, '#8a6f62'],
      [/^(pessac-leognan|graves|graves-superieures)$/, '#a57c68'],
      [/^(sauternes|barsac|cerons|loupiac|sainte-croix-du-mont|cadillac|cotes-de-bordeaux-cadillac|premieres-cotes-de-bordeaux|cotes-de-bordeaux-saint-macaire)$/, '#c99f62'],
      [/^(entre-deux-mers|entre-deux-mers-haut-benauge|graves-de-vayres)$/, '#97a98a'],
      [/./, '#8e5671'], // Right Bank
    ],
  },
  burgundy: {
    file: 'public/data/france/burgundy/burgundy-display-hulls-2026.geojson', // village hulls read better than 1,500 climats
    halo: '#dfc0b2',
    // Atlas-style: Chablis as an inset beside the Côte d'Or ribbon.
    panels: [
      { label: 'Chablis', test: (f) => /chablis/.test(f.properties.id) },
      { label: "Côte d'Or", test: (f) => !/chablis/.test(f.properties.id) },
    ],
    // Same families as the live map: Chablis sage, Nuits plum-rose,
    // Beaune reds terracotta, white villages straw-gold.
    groups: [
      [/^chablis-grand-cru$/, '#5b8478'],
      [/chablis/, '#93b0a2'],
      [/^(gevrey|morey|chambolle|vougeot|vosne|nuits)/, '#a46a80'],
      [/^(meursault|puligny|chassagne)/, '#cfa862'],
      [/./, '#b8785c'], // Côte de Beaune reds
    ],
  },
  champagne: {
    file: 'public/data/france/champagne/champagne-opendatawine-display-2026.geojson',
    halo: '#e2c9a0',
    groups: [
      [/rose-des-riceys/, '#cf7f8c'],
      [/./, '#cfae5c'],
    ],
  },
  alsace: {
    file: 'public/data/france/alsace/alsace-display-2026.geojson',
    halo: '#d6cba0',
    strokeWidth: 2,
    haloWidth: 10,
    trim: 0.02,
    // The 110 km wine route, split into its Bas-Rhin and Haut-Rhin halves.
    panels: [
      { label: 'Bas-Rhin', test: (f) => centroidLat(f) >= 48.3 },
      { label: 'Haut-Rhin', test: (f) => centroidLat(f) < 48.3 },
    ],
    // Pale regional AOC with the Grand Crus on top: north teal, centre amber,
    // south russet (split by latitude, matching the map's groups closely).
    groups: [
      [(f) => /grand-cru/.test(f.properties.id) && centroidLat(f) >= 48.3, '#4c7c74'],
      [(f) => /grand-cru/.test(f.properties.id) && centroidLat(f) >= 47.98, '#b9862f'],
      [(f) => /grand-cru/.test(f.properties.id), '#a4553f'],
      [/./, '#a9b77f'],
    ],
  },
}

function simplify(points, tolerance) {
  if (points.length < 4) return points
  const keep = new Uint8Array(points.length)
  const last = points.length - 1
  // Closed rings start and end on the same vertex: anchor on the farthest vertex too.
  let far = 0
  for (let i = 1; i < last; i++) {
    if (Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]) >
      Math.hypot(points[far][0] - points[0][0], points[far][1] - points[0][1])) far = i
  }
  keep[0] = keep[last] = keep[far] = 1
  const stack = far > 0 ? [[0, far], [far, last]] : [[0, last]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = points[a]; const [bx, by] = points[b]
    const dx = bx - ax; const dy = by - ay; const len = Math.hypot(dx, dy) || 1
    let max = 0; let index = -1
    for (let i = a + 1; i < b; i++) {
      const dist = Math.abs(dy * (points[i][0] - ax) - dx * (points[i][1] - ay)) / len
      if (dist > max) { max = dist; index = i }
    }
    if (max > tolerance && index > 0) { keep[index] = 1; stack.push([a, index], [index, b]) }
  }
  return points.filter((_, i) => keep[i])
}

function centroidLat(feature) {
  const r = rings(feature.geometry)[0] ?? [[0, 0]]
  return r.reduce((sum, c) => sum + c[1], 0) / r.length
}

function rings(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat()
  if (geometry.type === 'GeometryCollection') return geometry.geometries.flatMap(rings)
  return []
}

function renderPanel(features, cfg, box) {
  // Frame the 1st–99th percentile of vertices so a few outlying parcels do not
  // shrink the whole region (they may be clipped at the card edge).
  const xs = []
  const ys = []
  for (const f of features) for (const r of rings(f.geometry)) for (const [x, y] of r) { xs.push(x); ys.push(y) }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b)
  const trim = cfg.trim ?? 0.01
  const pct = (v, p) => v[Math.min(v.length - 1, Math.floor(p * v.length))]
  const [x0, x1, y0, y1] = [pct(xs, trim), pct(xs, 1 - trim), pct(ys, trim), pct(ys, 1 - trim)]
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180) // equirectangular, true aspect at mid-latitude
  const scale = Math.min((box.w - 2 * PAD) / ((x1 - x0) * k), (box.h - 2 * PAD) / (y1 - y0))
  const ox = box.x + (box.w - (x1 - x0) * k * scale) / 2
  const oy = box.y + (box.h - (y1 - y0) * scale) / 2
  const project = ([x, y]) => [ox + (x - x0) * k * scale, oy + (y1 - y) * scale]

  const byColor = new Map()
  for (const f of features) {
    const fid = String(f.properties?.id ?? '')
    const color = cfg.groups.find(([test]) => (typeof test === 'function' ? test(f) : test.test(fid)))[1]
    for (const ring of rings(f.geometry)) {
      const pts = []
      for (const [px, py] of simplify(ring.map(project), TOLERANCE)) {
        const q = [Math.round(px / QUANT) * QUANT, Math.round(py / QUANT) * QUANT]
        const last = pts[pts.length - 1]
        if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q)
      }
      if (pts.length < 3) continue
      let a = 0
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i]; const [bx, by] = pts[(i + 1) % pts.length]; a += ax * by - bx * ay
      }
      if (Math.abs(a / 2) < MIN_RING_AREA) continue
      const d = 'M' + pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join('L') + 'Z'
      if (!byColor.has(color)) byColor.set(color, new Set())
      byColor.get(color).add(d)
    }
  }
  const all = [...byColor.values()].flatMap((set) => [...set]).join('')
  // A soft footprint halo under the parcels keeps narrow areas legible at card size.
  return `<path d="${all}" fill="${cfg.halo}" stroke="${cfg.halo}" stroke-width="${cfg.haloWidth ?? 8}" stroke-linejoin="round"/>` +
    // Catch-all groups (listed last) are drawn first, so specific ones sit on top.
    [...byColor.entries()]
      .sort(([a], [b]) => cfg.groups.findLastIndex((g) => g[1] === b) - cfg.groups.findLastIndex((g) => g[1] === a))
      .map(([color, ds]) => `<path d="${[...ds].join('')}" fill="${color}" stroke="${color}" stroke-width="${cfg.strokeWidth ?? 1}" stroke-linejoin="round"/>`)
      .join('')
}

function build(id, cfg) {
  const file = path.join(root, cfg.file)
  if (!fs.existsSync(file)) throw new Error(`missing ${cfg.file} (extract the runtime data into public/ first)`)
  const features = JSON.parse(fs.readFileSync(file, 'utf8')).features.filter((f) => f.geometry)
  const panels = cfg.panels ?? [{ test: () => true }]
  const width = W / panels.length
  let body = ''
  panels.forEach((panel, i) => {
    const box = { x: i * width, y: 0, w: width, h: H }
    body += renderPanel(features.filter(panel.test), cfg, box)
    if (i > 0) body += `<line x1="${i * width}" y1="10" x2="${i * width}" y2="${H - 10}" stroke="#b89b80" stroke-width="0.5" stroke-dasharray="1.5 2"/>`
  })
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${id} appellation map" preserveAspectRatio="xMidYMid meet">${body}</svg>`
}

const outDir = path.join(root, 'public/thumbnails')
fs.mkdirSync(outDir, { recursive: true })
for (const [id, cfg] of Object.entries(regions)) {
  const svg = build(id, cfg)
  fs.writeFileSync(path.join(outDir, `${id}.svg`), svg)
  console.log(`public/thumbnails/${id}.svg: ${(svg.length / 1024).toFixed(1)} KB`)
}
