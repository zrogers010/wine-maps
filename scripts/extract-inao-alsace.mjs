import fs from 'node:fs/promises'
import path from 'node:path'
import proj4 from 'proj4'
import shapefile from 'shapefile'

const sourceBase =
  'data/raw/inao-aoc-viticoles-2026-05-05/2026-05-05_delim-parcellaire-aoc-shp'
const sourceOutputPath = 'src/data/france/alsace/alsace-inao-aoc-2026.geojson'
const detailOutputPath = 'public/data/france/alsace/alsace-display-2026.geojson'
const hullOutputPath = 'public/data/france/alsace/alsace-display-hulls-2026.geojson'

proj4.defs(
  'EPSG:2154',
  '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +units=m +no_defs',
)

const source = await shapefile.open(`${sourceBase}.shp`, `${sourceBase}.dbf`, {
  encoding: 'utf-8',
})

const features = []

while (true) {
  const result = await source.read()

  if (result.done) {
    break
  }

  const feature = result.value
  const target = targetForProperties(feature.properties)

  if (!target) {
    continue
  }

  features.push({
    type: 'Feature',
    id: `${target.id}-${features.length + 1}`,
    properties: {
      ...feature.properties,
      id: target.id,
      name: target.name,
      sourceApp: feature.properties.app,
      sourceDenom: feature.properties.denom,
      dataStatus:
        'Official INAO/data.gouv.fr parcel delimitation extract, informational use; official plans remain those deposited with town halls or INAO.',
    },
    geometry: transformGeometry(feature.geometry),
  })
}

const sourceCollection = createCollection('Alsace INAO AOC viticole extract', features)
const displayFeatures = buildDisplayFeatures(features)
const displayCollection = createCollection('Alsace display AOC layer', displayFeatures)
const hullCollection = createCollection('Alsace low-zoom hull AOC layer', displayFeatures)

await fs.mkdir(path.dirname(sourceOutputPath), { recursive: true })
await fs.mkdir(path.dirname(detailOutputPath), { recursive: true })
await fs.writeFile(sourceOutputPath, `${JSON.stringify(sourceCollection)}\n`)
await fs.writeFile(detailOutputPath, `${JSON.stringify(displayCollection)}\n`)
await fs.writeFile(hullOutputPath, `${JSON.stringify(hullCollection)}\n`)

console.log(`Wrote ${features.length} source features to ${path.resolve(sourceOutputPath)}`)
console.log(`Wrote ${displayFeatures.length} display features to ${path.resolve(detailOutputPath)}`)
console.log(`Wrote ${displayFeatures.length} hull features to ${path.resolve(hullOutputPath)}`)
console.log(
  displayFeatures.reduce((acc, feature) => {
    acc[feature.properties.id] = (acc[feature.properties.id] ?? 0) + 1
    return acc
  }, {}),
)

function targetForProperties(properties) {
  if (
    properties.app === "Alsace ou Vin d'Alsace" &&
    properties.denom === 'Alsace'
  ) {
    return { id: 'alsace', name: 'Alsace' }
  }

  if (properties.app === "Crémant d'Alsace") {
    return { id: 'cremant-d-alsace', name: "Crémant d'Alsace" }
  }

  if (String(properties.app ?? '').startsWith('Alsace grand cru ')) {
    return {
      id: slug(properties.app),
      name: properties.app,
    }
  }

  return null
}

function buildDisplayFeatures(sourceFeatures) {
  const renderedFeatures = sourceFeatures.filter(
    (feature) => feature.properties.id !== 'cremant-d-alsace',
  )

  return renderedFeatures.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      displayStatus:
        feature.properties.id === 'alsace'
          ? "Alsace regional display feature. Crémant d'Alsace shares this broad geometry in the map legend."
          : 'Alsace Grand Cru display feature.',
    },
  }))
}

function createCollection(name, collectionFeatures) {
  return {
    type: 'FeatureCollection',
    metadata: {
      name,
      placeholder: false,
      source:
        "Délimitation Parcellaire des AOC Viticoles de l'INAO, data.gouv.fr",
      sourceProjection: 'EPSG:2154',
      outputProjection: 'EPSG:4326',
    },
    features: collectionFeatures,
  }
}

function transformGeometry(geometry) {
  return {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates),
  }
}

function transformCoordinates(coordinates) {
  if (typeof coordinates[0] === 'number') {
    const [lng, lat] = proj4('EPSG:2154', 'EPSG:4326', coordinates)
    return [round(lng), round(lat)]
  }

  return coordinates.map(transformCoordinates)
}

function slug(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function round(value) {
  return Number(value.toFixed(7))
}
