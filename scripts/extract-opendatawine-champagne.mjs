import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const detailOutputPath =
  'public/data/france/champagne/champagne-opendatawine-display-2026.geojson'
const hullOutputPath =
  'public/data/france/champagne/champagne-opendatawine-hulls-2026.geojson'
const sourceArchivePath =
  'src/data/france/champagne/champagne-opendatawine-source-2026.geojson'

const denominations = [
  {
    id: 'champagne',
    name: 'Champagne',
    denomId: '00055',
    pageUrl: 'https://www.opendatawine.fr/denominations/00055.html',
    render: true,
  },
  {
    id: 'coteaux-champenois',
    name: 'Coteaux champenois',
    denomId: '00058',
    pageUrl: 'https://www.opendatawine.fr/denominations/00058.html',
    render: false,
    sharedGeometryWith: 'champagne',
  },
  {
    id: 'rose-des-riceys',
    name: 'Rosé des Riceys',
    denomId: '00059',
    pageUrl: 'https://www.opendatawine.fr/denominations/00059.html',
    render: true,
  },
]
const allowedChampagneDepartments = new Set(['02', '10', '51', '52', '77'])

const allSourceFeatures = []
const displayFeatures = []
const geometryHashes = new Map()

for (const denomination of denominations) {
  const inseeCodes = await fetchInseeCodes(denomination)

  if (inseeCodes.length === 0) {
    throw new Error(`No commune links found for ${denomination.name}`)
  }

  const fetched = await fetchFirstAvailableGeoJson(denomination, inseeCodes)
  const sourceFeature = normalizeFeature(
    denomination,
    fetched.feature,
    fetched.url,
    inseeCodes.length,
  )

  allSourceFeatures.push(sourceFeature)

  const geometryHash = hashJson(sourceFeature.geometry)
  const existingGeometryOwner = geometryHashes.get(geometryHash)

  if (denomination.render && !existingGeometryOwner) {
    geometryHashes.set(geometryHash, denomination.id)
    displayFeatures.push(sourceFeature)
  } else if (denomination.render) {
    console.log(
      `Skipping rendered duplicate geometry for ${denomination.name}; already rendered by ${existingGeometryOwner}`,
    )
  }

  console.log(
    `Fetched ${denomination.name} from ${fetched.url} using ${inseeCodes.length} OpenDataWine commune links`,
  )
}

const sourceCollection = createCollection(
  'Champagne OpenDataWine source denomination geometries',
  allSourceFeatures,
)
const displayCollection = createCollection(
  'Champagne OpenDataWine display geometries',
  displayFeatures,
)

await fs.mkdir(path.dirname(detailOutputPath), { recursive: true })
await fs.mkdir(path.dirname(sourceArchivePath), { recursive: true })
await fs.writeFile(sourceArchivePath, `${JSON.stringify(sourceCollection)}\n`)
await fs.writeFile(detailOutputPath, `${JSON.stringify(displayCollection)}\n`)
await fs.writeFile(hullOutputPath, `${JSON.stringify(displayCollection)}\n`)

console.log(`Wrote source archive with ${allSourceFeatures.length} features to ${path.resolve(sourceArchivePath)}`)
console.log(`Wrote display layer with ${displayFeatures.length} features to ${path.resolve(detailOutputPath)}`)
console.log(`Wrote hull layer with ${displayFeatures.length} features to ${path.resolve(hullOutputPath)}`)

async function fetchInseeCodes(denomination) {
  const html = await fetchText(denomination.pageUrl)
  return [
    ...new Set(
      [...html.matchAll(/insee=(\d{5})&denomid=(\d{5})/g)]
        .filter(([, , denomId]) => denomId === denomination.denomId)
        .map(([, insee]) => insee)
        .filter((insee) => allowedChampagneDepartments.has(insee.slice(0, 2))),
    ),
  ]
}

async function fetchFirstAvailableGeoJson(denomination, inseeCodes) {
  let lastError

  for (const insee of inseeCodes) {
    const dep = insee.slice(0, 2)
    const url = `https://data.opendatawine.fr/delimitation_aoc/${dep}/${insee}/${denomination.denomId}.geojson`

    try {
      const geoJson = JSON.parse(await fetchText(url))
      const feature = geoJson.features?.[0]

      if (feature?.geometry) {
        return { feature, url }
      }
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    `No GeoJSON found for ${denomination.name}: ${lastError?.message ?? 'unknown error'}`,
  )
}

async function fetchText(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

function normalizeFeature(denomination, feature, sourceUrl, sourceCommuneCount) {
  return {
    type: 'Feature',
    id: denomination.id,
    properties: {
      ...feature.properties,
      id: denomination.id,
      name: denomination.name,
      sourceDenomId: denomination.denomId,
      sourceUrl,
      sourceCommuneCount,
      sharedGeometryWith: denomination.sharedGeometryWith ?? null,
      dataStatus:
        'OpenDataWine access to INAO AOC delimitation geometry; online data are informational and official plans remain with town halls or INAO.',
    },
    geometry: feature.geometry,
  }
}

function createCollection(name, features) {
  return {
    type: 'FeatureCollection',
    metadata: {
      name,
      placeholder: false,
      source: 'OpenDataWine / INAO AOC delimitation data',
      sourceUrl: 'https://www.opendatawine.fr/',
      note:
        'Champagne and Coteaux champenois share the same geometry in this source, so the display layer renders the shared Champagne area once to avoid stacked fills.',
    },
    features,
  }
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
