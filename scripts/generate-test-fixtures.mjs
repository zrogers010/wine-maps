#!/usr/bin/env node
// Generate minimal GeoJSON fixtures for acceptance tests
// These are simplified geometries that match the schema the app expects

import fs from 'node:fs'
import path from 'node:path'

// Approximate bounding boxes for key Bordeaux appellations (lon, lat)
// Non-overlapping regions for testing
const appellationBounds = {
  'pauillac': [-0.745, 45.175, -0.715, 45.205],
  'medoc': [-0.95, 45.40, -0.85, 45.60],
  'haut-medoc': [-0.78, 45.25, -0.75, 45.28], // Moved away from Pauillac
  'saint-estephe': [-0.78, 45.30, -0.74, 45.34],
  'saint-julien': [-0.745, 45.12, -0.71, 45.16],
  'margaux': [-0.70, 44.98, -0.66, 45.04],
  'moulis-en-medoc': [-0.82, 45.03, -0.76, 45.08],
  'listrac-medoc': [-0.83, 45.08, -0.78, 45.12],
  'graves': [-0.52, 44.50, -0.36, 44.72],
  'pessac-leognan': [-0.68, 44.70, -0.60, 44.76],
  'sauternes': [-0.36, 44.52, -0.32, 44.56],
  'barsac': [-0.33, 44.58, -0.31, 44.62],
  'cerons': [-0.36, 44.62, -0.32, 44.66],
  'cadillac': [-0.35, 44.68, -0.32, 44.71],
  'cotes-de-bordeaux-cadillac': [-0.30, 44.68, -0.26, 44.74],
  'loupiac': [-0.31, 44.61, -0.27, 44.65],
  'sainte-croix-du-mont': [-0.30, 44.58, -0.26, 44.62],
  'premieres-cotes-de-bordeaux': [-0.50, 44.70, -0.30, 44.88],
  'cotes-de-bordeaux-saint-macaire': [-0.26, 44.54, -0.20, 44.58],
  'graves-de-vayres': [-0.35, 44.88, -0.29, 44.92],
  'entre-deux-mers': [-0.25, 44.72, 0.00, 44.90],
  'entre-deux-mers-haut-benauge': [-0.23, 44.66, -0.15, 44.72],
  'saint-emilion': [-0.18, 44.88, -0.12, 44.92],
  'pomerol': [-0.22, 44.91, -0.18, 44.95],
  'lalande-de-pomerol': [-0.25, 44.94, -0.19, 44.98],
  'fronsac': [-0.30, 44.91, -0.24, 44.95],
  'canon-fronsac': [-0.30, 44.94, -0.26, 44.97],
  'montagne-saint-emilion': [-0.16, 44.92, -0.12, 44.96],
  'lussac-saint-emilion': [-0.10, 44.93, -0.06, 44.97],
  'puisseguin-saint-emilion': [-0.08, 44.90, -0.04, 44.94],
  'saint-georges-saint-emilion': [-0.15, 44.95, -0.11, 44.99],
}

// Create a rectangle polygon from bounds
function boundsToPolygon(bounds) {
  const [minLon, minLat, maxLon, maxLat] = bounds
  return {
    type: 'Polygon',
    coordinates: [[
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat], // Close the ring
    ]]
  }
}

// Create a feature with multiple parcels (to test commune-level data)
function createFeature(id, bounds, commune = null, insee = null) {
  return {
    type: 'Feature',
    id: id,
    properties: {
      id: id,
      ...(commune && { commune }),
      ...(insee && { insee }),
    },
    geometry: boundsToPolygon(bounds),
  }
}

// Generate Bordeaux exclusive display GeoJSON
function generateBordeauxDisplay() {
  const features = []
  
  // Add all appellations with some having commune/insee data
  for (const [id, bounds] of Object.entries(appellationBounds)) {
    // Add a few features with commune data for testing
    if (id === 'pauillac') {
      features.push(createFeature(id, bounds, 'Pauillac', '33314'))
    } else if (id === 'graves') {
      features.push(createFeature(id, bounds, 'Podensac', '33327'))
    } else {
      features.push(createFeature(id, bounds))
    }
  }
  
  return {
    type: 'FeatureCollection',
    features,
  }
}

// Generate Cadillac dissolve trial (simpler hull version)
function generateCadillacDissolve() {
  const hullIds = [
    'medoc', 'haut-medoc', 'saint-estephe', 'pauillac', 'saint-julien',
    'margaux', 'moulis-en-medoc', 'listrac-medoc', 'entre-deux-mers',
    'entre-deux-mers-haut-benauge', 'cadillac', 'loupiac',
    'sainte-croix-du-mont', 'premieres-cotes-de-bordeaux',
    'cotes-de-bordeaux-saint-macaire', 'graves-de-vayres',
    'saint-emilion', 'pomerol', 'lalande-de-pomerol', 'fronsac',
    'canon-fronsac', 'montagne-saint-emilion', 'lussac-saint-emilion',
    'puisseguin-saint-emilion', 'saint-georges-saint-emilion',
    'pessac-leognan', 'graves', 'sauternes', 'barsac', 'cerons',
  ]
  
  const features = hullIds
    .filter(id => appellationBounds[id])
    .map(id => createFeature(id, appellationBounds[id]))
  
  return {
    type: 'FeatureCollection',
    features,
  }
}

// Generate other region fixtures (simplified)
function generateBurgundyDisplay() {
  return {
    type: 'FeatureCollection',
    features: [
      createFeature('chablis', [3.78, 47.78, 3.82, 47.82]),
      createFeature('chassagne-montrachet', [4.74, 46.92, 4.76, 46.94]),
      createFeature('puligny-montrachet', [4.73, 46.94, 4.75, 46.96]),
    ],
  }
}

function generateBurgundyHulls() {
  return generateBurgundyDisplay()
}

function generateChampagneDisplay() {
  return {
    type: 'FeatureCollection',
    features: [
      createFeature('champagne', [3.85, 49.00, 4.10, 49.30]),
      createFeature('montagne-de-reims', [3.95, 49.15, 4.05, 49.25]),
    ],
  }
}

function generateChampagneHulls() {
  return generateChampagneDisplay()
}

function generateAlsaceDisplay() {
  return {
    type: 'FeatureCollection',
    features: [
      createFeature('alsace', [7.10, 47.80, 7.50, 48.60]),
      createFeature('alsace-grand-cru', [7.20, 47.90, 7.40, 48.50]),
      createFeature('alsace-grand-cru-saering', [7.28, 47.85, 7.30, 47.87]),
    ],
  }
}

function generateAlsaceHulls() {
  return generateAlsaceDisplay()
}

// Create all fixture files
const dataDir = 'public/data/france'

const fixtures = [
  ['bordeaux/bordeaux-display-exclusive-2026.geojson', generateBordeauxDisplay()],
  ['bordeaux/bordeaux-display-cadillac-dissolve-trial-2026.geojson', generateCadillacDissolve()],
  ['burgundy/burgundy-display-exclusive-2026.geojson', generateBurgundyDisplay()],
  ['burgundy/burgundy-display-hulls-2026.geojson', generateBurgundyHulls()],
  ['champagne/champagne-opendatawine-display-2026.geojson', generateChampagneDisplay()],
  ['champagne/champagne-opendatawine-hulls-2026.geojson', generateChampagneHulls()],
  ['alsace/alsace-display-2026.geojson', generateAlsaceDisplay()],
  ['alsace/alsace-display-hulls-2026.geojson', generateAlsaceHulls()],
]

for (const [relativePath, data] of fixtures) {
  const fullPath = path.join(dataDir, relativePath)
  const dir = path.dirname(fullPath)
  
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2))
  console.log(`✓ Generated ${fullPath}`)
}

console.log('\n✅ All test fixtures generated')
console.log('⚠️  Note: These are simplified geometries for testing only')
