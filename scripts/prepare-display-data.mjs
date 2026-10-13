#!/usr/bin/env node
/**
 * Prepare lighter display GeoJSON for the web maps (mapshaper-style).
 *
 *   node scripts/prepare-display-data.mjs [inputDir] [outputDir]
 *   defaults: public/data  ->  /workspace/sm-data2/public/data
 *
 * Input is the full-precision display data (the extracted sm-data.tgz /
 * S3 copy). Output has the same paths and file names, so it is a drop-in
 * replacement for public/data (sync it to S3 / CloudShell public/data).
 *
 * Per file:
 *  - Visvalingam (weighted) simplification with a metric interval chosen
 *    for the zoom range the file is drawn at, keeping every shape
 *    (keep-shapes) and repairing slivers/overlaps created by snapping (-clean is
 *    NOT used: it would merge exclusive parcels).
 *  - Coordinates rounded to 1e-5° (~1 m), more than enough below z14.
 *  - Long repeated provenance strings dropped (dataStatus/displayStatus etc.);
 *    every property the app reads is kept, and the top-level feature id
 *    (used for hover feature-state) is preserved.
 */
import fs from 'node:fs'
import path from 'node:path'
import mapshaper from 'mapshaper'

const inputDir = path.resolve(process.argv[2] ?? 'public/data')
const outputDir = path.resolve(process.argv[3] ?? '/workspace/sm-data2/public/data')

const DROP = [
  'dataStatus', 'displayStatus', 'sourceUrl', 'cvi', 'concaveMaxEdgeKilometers',
  'hullStrategy', 'hullPointCount', 'sourceFeatureCount', 'hullSourceFeatureCount', 'patchCount',
]

// interval = simplification tolerance in metres.
const FILES = [
  // Drawn up to z13.5; 1 px ≈ 13 m at z13 → 4 m is invisible.
  { file: 'france/bordeaux/bordeaux-display-exclusive-2026.geojson', interval: 5 },
  { file: 'france/bordeaux/bordeaux-display-cadillac-dissolve-trial-2026.geojson', interval: 15 },
  { file: 'france/burgundy/burgundy-display-exclusive-2026.geojson', interval: 2 },
  { file: 'france/burgundy/burgundy-display-hulls-2026.geojson', interval: 10 },
  { file: 'france/alsace/alsace-display-2026.geojson', interval: 3 },
  // Only drawn below the detail zoom, so it can be much coarser.
  { file: 'france/alsace/alsace-display-hulls-2026.geojson', interval: 25 },
  { file: 'france/champagne/champagne-opendatawine-display-2026.geojson', interval: 8 },
  { file: 'france/champagne/champagne-opendatawine-hulls-2026.geojson', interval: 40 },
]

function roundGeometry(geometry) {
  const round = (c) => (typeof c[0] === 'number' ? c.map((v) => Math.round(v * 1e5) / 1e5) : c.map(round))
  return { ...geometry, coordinates: round(geometry.coordinates) }
}

let totalIn = 0
let totalOut = 0
for (const { file, interval } of FILES) {
  const src = path.join(inputDir, file)
  if (!fs.existsSync(src)) {
    console.warn(`skip (missing): ${file}`)
    continue
  }
  const raw = fs.readFileSync(src, 'utf8')
  const json = JSON.parse(raw)
  for (const feature of json.features) {
    feature.properties = { ...(feature.properties ?? {}), __fid: feature.id ?? null }
  }
  const out = await mapshaper.applyCommands(
    `-i in.json -simplify weighted interval=${interval} keep-shapes -o out.json format=geojson precision=0.00001`,
    { 'in.json': JSON.stringify(json) },
  )
  const result = JSON.parse(out['out.json'])
  let restored = 0
  result.features.forEach((feature, index) => {
    // Simplification can collapse tiny slivers to null; keep the original
    // (rounded) geometry for those so every parcel stays selectable.
    if (!feature.geometry && json.features[index].geometry) {
      feature.geometry = roundGeometry(json.features[index].geometry)
      restored++
    }
  })
  for (const feature of result.features) {
    const { __fid, ...props } = feature.properties
    for (const key of DROP) delete props[key]
    feature.properties = props
    if (__fid !== null && __fid !== undefined) feature.id = __fid
  }
  if (result.features.length !== json.features.length) {
    throw new Error(`${file}: feature count changed ${json.features.length} -> ${result.features.length}`)
  }
  const text = JSON.stringify({ type: 'FeatureCollection', features: result.features })
  const dest = path.join(outputDir, file)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, text)
  totalIn += raw.length
  totalOut += text.length
  console.log(`${file}: ${(raw.length / 1e6).toFixed(2)} MB -> ${(text.length / 1e6).toFixed(2)} MB (interval ${interval} m${restored ? `, ${restored} slivers kept unsimplified` : ''})`)
}
console.log(`total: ${(totalIn / 1e6).toFixed(1)} MB -> ${(totalOut / 1e6).toFixed(1)} MB`)
