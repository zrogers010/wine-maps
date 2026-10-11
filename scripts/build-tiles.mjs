#!/usr/bin/env node

/**
 * PMTiles tile builder for wine regions
 * Converts GeoJSON to PMTiles vector tiles with tippecanoe
 * 
 * Usage: node build-tiles.mjs [--size-budget-mb MB] [--metadata-budget-kb KB] [--regions region1,region2,...] [--data-dir path]
 */

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as turf from '@turf/turf'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// ============================================================================
// REGION CONFIGURATION - Exact paths the app uses (from main/02e9f16)
// ============================================================================
// 
// These paths match what the app loaded before this PR:
// - Burgundy: StudyRegionMapPage (converted to PMTiles)
// - Alsace: StudyRegionMapPage (converted to PMTiles)  
// - Champagne: StudyRegionMapPage (converted to PMTiles)
//   Uses opendatawine version (not display-dev) per ChampagnePage.tsx L28-29
// - Bordeaux: MapView (has page, but not yet converted to PMTiles)
//   Uses exclusive for detail, cadillac-dissolve for hull per MapView.tsx L147-148
// ============================================================================

const REGION_CONFIG = {
  burgundy: {
    detail: 'burgundy-display-exclusive-2026.geojson',
    hull: 'burgundy-display-hulls-2026.geojson',
  },
  champagne: {
    detail: 'champagne-opendatawine-display-2026.geojson',
    hull: 'champagne-opendatawine-hulls-2026.geojson',
  },
  alsace: {
    detail: 'alsace-display-2026.geojson',
    hull: 'alsace-display-hulls-2026.geojson',
  },
  bordeaux: {
    detail: 'bordeaux-display-exclusive-2026.geojson',
    hull: 'bordeaux-display-cadillac-dissolve-trial-2026.geojson',
  },
}

// Parse arguments
let sizeBudgetMB = 5
let metadataBudgetKB = 300
let regions = 'burgundy,champagne,alsace'  // Default: exclude Bordeaux
let dataDir = process.env.DATA_DIR || 'public/data/france'

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--size-budget-mb') {
    sizeBudgetMB = parseFloat(process.argv[++i])
  } else if (process.argv[i] === '--metadata-budget-kb') {
    metadataBudgetKB = parseFloat(process.argv[++i])
  } else if (process.argv[i] === '--regions') {
    regions = process.argv[++i]
  } else if (process.argv[i] === '--data-dir') {
    dataDir = process.argv[++i]
  }
}

console.log('==> Building PMTiles for wine regions')
console.log(`Region budget: ${sizeBudgetMB} MB`)
console.log(`Metadata budget: ${metadataBudgetKB} KB`)
console.log(`Regions: ${regions}`)
console.log(`Data dir: ${dataDir}`)
console.log('')

const regionArray = regions.split(',').map(r => r.trim())
const sizeBudgetBytes = sizeBudgetMB * 1024 * 1024
const metadataBudgetBytes = metadataBudgetKB * 1024

// Setup paths
const version = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
const outputBase = join(PROJECT_ROOT, 'tiles')
const outputDir = join(outputBase, version)
const tempDir = join(outputBase, `.tmp-${process.pid}`)
const manifestFile = join(outputDir, 'manifest.json')

mkdirSync(outputDir, { recursive: true })
mkdirSync(tempDir, { recursive: true })

const manifest = {
  version,
  tiles: {},
}

let anyOverBudget = false
let builtCount = 0

// Helper: run command and return exit code
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    
    proc.stdout?.on('data', (data) => { stdout += data.toString() })
    proc.stderr?.on('data', (data) => { stderr += data.toString() })
    
    proc.on('close', (code) => {
      if (code === 0 || options.ignoreError) {
        resolve({ code, stdout, stderr })
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}\n${stderr}`))
      }
    })
    
    proc.on('error', reject)
  })
}

// Build each region
for (const region of regionArray) {
  console.log(`Processing ${region}...`)
  
  const config = REGION_CONFIG[region]
  if (!config) {
    console.error(`❌ ERROR: Region '${region}' not configured`)
    console.error(`   Valid regions: ${Object.keys(REGION_CONFIG).join(', ')}`)
    process.exit(1)
  }
  
  const detailPath = join(PROJECT_ROOT, dataDir, region, config.detail)
  const hullPath = join(PROJECT_ROOT, dataDir, region, config.hull)
  
  if (!existsSync(detailPath)) {
    console.error(`❌ ERROR: Detail file not found for ${region}`)
    console.error(`   Expected: ${detailPath}`)
    process.exit(1)
  }
  
  if (!existsSync(hullPath)) {
    console.error(`❌ ERROR: Hull file not found for ${region}`)
    console.error(`   Expected: ${hullPath}`)
    process.exit(1)
  }
  
  const detailOutput = join(outputDir, `${region}-detail.pmtiles`)
  const hullOutput = join(outputDir, `${region}-hull.pmtiles`)
  const metadataOutput = join(outputDir, `${region}-metadata.json`)
  
  // Copy feature.id to properties.id and strip top-level id
  const detailGeoJSON = JSON.parse(readFileSync(detailPath, 'utf8'))
  detailGeoJSON.features = detailGeoJSON.features.map(f => ({
    ...f,
    properties: {
      ...f.properties,
      id: f.id || f.properties.id,
    },
    id: undefined,
  }))
  
  const hullGeoJSON = JSON.parse(readFileSync(hullPath, 'utf8'))
  hullGeoJSON.features = hullGeoJSON.features.map(f => ({
    ...f,
    properties: {
      ...f.properties,
      id: f.id || f.properties.id,
    },
    id: undefined,
  }))
  
  const tempDetailPath = join(tempDir, `${region}-detail.geojson`)
  const tempHullPath = join(tempDir, `${region}-hull.geojson`)
  const tempDetailSeqPath = join(tempDir, `${region}-detail.geojsonl`)
  const tempHullSeqPath = join(tempDir, `${region}-hull.geojsonl`)
  
  writeFileSync(tempDetailPath, JSON.stringify(detailGeoJSON))
  writeFileSync(tempHullPath, JSON.stringify(hullGeoJSON))
  
  // Convert to GeoJSONSeq
  const detailSeq = detailGeoJSON.features.map(f => JSON.stringify(f)).join('\n')
  const hullSeq = hullGeoJSON.features.map(f => JSON.stringify(f)).join('\n')
  
  writeFileSync(tempDetailSeqPath, detailSeq)
  writeFileSync(tempHullSeqPath, hullSeq)
  
  const detailInputCount = detailGeoJSON.features.length
  
  // Build detail tiles to mbtiles first (for verification)
  const tempMbtilesPath = join(tempDir, `${region}-detail.mbtiles`)
  
  await runCommand('tippecanoe', [
    '-o', tempMbtilesPath,
    '-z15', '-Z11',
    '-r1',
    '-l', region,
    '--coalesce-densest-as-needed',
    '--detect-shared-borders',
    '--no-simplification-of-shared-nodes',
    '-P',
    tempDetailSeqPath,
  ])
  
  // Verify no features dropped at max zoom
  try {
    await runCommand('which', ['tippecanoe-decode'])
  } catch {
    console.error(`❌ ERROR: tippecanoe-decode not found`)
    console.error(`   Install: brew install tippecanoe (macOS) or apt install tippecanoe (Linux)`)
    process.exit(1)
  }
  
  const inputIds = detailGeoJSON.features
    .map(f => f.properties.id)
    .filter(Boolean)
    .sort()
  
  const { stdout } = await runCommand('tippecanoe-decode', ['-z', '15', '-Z', '15', tempMbtilesPath])
  const outputIds = []
  const lines = stdout.split('\n').filter(line => line.trim())
  
  for (const line of lines) {
    try {
      const feature = JSON.parse(line)
      if (feature.properties?.id) {
        outputIds.push(feature.properties.id)
      }
    } catch {
      // Skip non-JSON lines
    }
  }
  
  const uniqueOutputIds = [...new Set(outputIds)].sort()
  
  console.log(`  ids: input=${inputIds.length} z15=${uniqueOutputIds.length}`)
  
  if (uniqueOutputIds.length < inputIds.length) {
    const missing = inputIds.filter(id => !uniqueOutputIds.includes(id))
    console.error(`  ❌ FEATURES DROPPED: ${missing.length} features missing at max zoom`)
    missing.slice(0, 5).forEach(id => console.error(`     Missing: ${id}`))
    anyOverBudget = true
  }
  
  // Convert mbtiles to pmtiles
  await runCommand('pmtiles', ['convert', tempMbtilesPath, detailOutput])
  
  const detailSize = statSync(detailOutput).size
  const detailSizeMB = (detailSize / 1024 / 1024).toFixed(2)
  
  console.log(`  ✓ detail.pmtiles: ${detailSizeMB} MB`)
  
  // Build hull tiles
  await runCommand('tippecanoe', [
    '-o', hullOutput,
    '-z11', '-Z7',
    '-r2',
    '-l', region,
    '--drop-densest-as-needed',
    '-P',
    tempHullSeqPath,
  ])
  
  const hullSize = statSync(hullOutput).size
  const hullSizeMB = (hullSize / 1024 / 1024).toFixed(2)
  
  console.log(`  ✓ hull.pmtiles: ${hullSizeMB} MB`)
  
  // Create metadata
  console.log(`  Building metadata...`)
  
  const overallBbox = turf.bbox(hullGeoJSON)
  const byId = new Map()
  
  for (const feature of hullGeoJSON.features) {
    const id = feature.properties.id
    if (!id) continue
    
    const existing = byId.get(id)
    const area = turf.area(feature)
    
    if (!existing || area > existing.area) {
      byId.set(id, { feature, area })
    }
  }
  
  const metadataFeatures = Array.from(byId.values()).map(({ feature }) => {
    const id = feature.properties.id
    const name = feature.properties.name || id
    const centroid = turf.centroid(feature)
    const featureBbox = turf.bbox(feature)
    
    const props = { id, name }
    if (feature.properties.commune) props.commune = feature.properties.commune
    if (feature.properties.insee) props.insee = feature.properties.insee
    if (feature.properties.cruLevel) props.cruLevel = feature.properties.cruLevel
    if (feature.properties.climat) props.climat = feature.properties.climat
    
    return {
      type: 'Feature',
      properties: props,
      labelPoint: centroid.geometry.coordinates,
      bbox: featureBbox,
      geometry: centroid.geometry,
    }
  })
  
  const metadata = {
    type: 'FeatureCollection',
    bbox: overallBbox,
    features: metadataFeatures,
  }
  
  writeFileSync(metadataOutput, JSON.stringify(metadata, null, 2))
  
  const metadataSize = statSync(metadataOutput).size
  const metadataSizeKB = (metadataSize / 1024).toFixed(1)
  
  console.log(`  ✓ metadata.json: ${metadataSizeKB} KB`)
  
  // Check budgets
  if (metadataSize > metadataBudgetBytes) {
    console.error(`  ❌ METADATA OVER BUDGET: ${metadataSizeKB} KB > ${metadataBudgetKB} KB`)
    anyOverBudget = true
  }
  
  const totalSize = detailSize + hullSize + metadataSize
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)
  
  console.log(`  → Total: ${totalSizeMB} MB`)
  
  if (totalSize > sizeBudgetBytes) {
    console.error(`  ❌ OVER BUDGET: ${totalSizeMB} MB > ${sizeBudgetMB} MB`)
    anyOverBudget = true
  }
  
  console.log('')
  
  // Add to manifest
  manifest.tiles[region] = {
    detail: {
      file: `${region}-detail.pmtiles`,
      sizeBytes: detailSize,
      sizeMB: detailSizeMB,
    },
    hull: {
      file: `${region}-hull.pmtiles`,
      sizeBytes: hullSize,
      sizeMB: hullSizeMB,
    },
    metadata: {
      file: `${region}-metadata.json`,
      sizeBytes: metadataSize,
      sizeKB: metadataSizeKB,
    },
    totalSizeBytes: totalSize,
    totalSizeMB: totalSizeMB,
  }
  
  builtCount++
}

// Clean up temp
rmSync(tempDir, { recursive: true, force: true })

// Fail if no regions built
if (builtCount === 0) {
  console.error('❌ ERROR: No regions were built')
  rmSync(outputDir, { recursive: true, force: true })
  process.exit(1)
}

// Write manifest
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))

// Copy manifest to current/ (overwrite, not symlink)
const currentDir = join(outputBase, 'current')
mkdirSync(currentDir, { recursive: true })
writeFileSync(join(currentDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

console.log('==> Build complete!')
console.log('')
console.log(`Output: ${outputDir}`)
console.log(`Manifest: ${manifestFile}`)
console.log(`Current: ${join(currentDir, 'manifest.json')}`)
console.log('')

if (anyOverBudget) {
  console.error('❌ ERROR: One or more regions exceeded budget')
  console.error('')
  console.error('To fix:')
  console.error('  - For tile size: increase simplification (-r1 → -r1.5) or reduce max zoom (-z15 → -z14)')
  console.error('  - For metadata: check for geometry leaks or large property values')
  console.error('')
  process.exit(1)
}

console.log(`✅ All regions within budget (${builtCount} built)`)
