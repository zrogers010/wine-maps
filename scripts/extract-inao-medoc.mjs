import fs from 'node:fs/promises'
import path from 'node:path'
import proj4 from 'proj4'
import shapefile from 'shapefile'

const sourceBase =
  'data/raw/inao-aoc-viticoles-2026-05-05/2026-05-05_delim-parcellaire-aoc-shp'
const outputPath = 'src/data/medoc-inao-aoc-2026.geojson'
const publicOutputPath = 'public/data/medoc-inao-aoc-2026.geojson'

const targetApps = new Map([
  ['Médoc', 'medoc'],
  ['Haut-Médoc', 'haut-medoc'],
  ['Saint-Estèphe', 'saint-estephe'],
  ['Pauillac', 'pauillac'],
  ['Saint-Julien', 'saint-julien'],
  ['Margaux', 'margaux'],
  ['Moulis ou Moulis-en-Médoc', 'moulis-en-medoc'],
  ['Listrac-Médoc', 'listrac-medoc'],
])

const namesById = new Map([
  ['medoc', 'Médoc'],
  ['haut-medoc', 'Haut-Médoc'],
  ['saint-estephe', 'Saint-Estèphe'],
  ['pauillac', 'Pauillac'],
  ['saint-julien', 'Saint-Julien'],
  ['margaux', 'Margaux'],
  ['moulis-en-medoc', 'Moulis-en-Médoc'],
  ['listrac-medoc', 'Listrac-Médoc'],
])

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
  const id = targetApps.get(feature.properties.app)

  if (!id) {
    continue
  }

  const geometry = transformGeometry(feature.geometry)

  features.push({
    type: 'Feature',
    id: `${id}-${features.length + 1}`,
    properties: {
      id,
      name: namesById.get(id),
      sourceApp: feature.properties.app,
      sourceDenom: feature.properties.denom,
      sign: feature.properties.signe,
      typeProd: feature.properties.type_prod,
      category: feature.properties.categorie,
      insee: feature.properties.insee,
      commune: feature.properties.nomcom,
      idApp: feature.properties.id_app,
      idDenom: feature.properties.id_denom,
      idAire: feature.properties.id_aire,
      dataStatus:
        'Official INAO/data.gouv.fr parcel delimitation extract, informational use; official plans remain those deposited with town halls or INAO.',
    },
    geometry,
  })
}

const collection = {
  type: 'FeatureCollection',
  metadata: {
    name: 'Médoc INAO AOC viticole parcel delimitation extract',
    placeholder: false,
    source:
      'Délimitation Parcellaire des AOC Viticoles de l’INAO, data.gouv.fr',
    sourceUrl:
      'https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao/',
    sourceResource:
      '2026-05-05-delim-parcellaire-aoc-shp.zip',
    sourceProjection: 'EPSG:2154',
    outputProjection: 'EPSG:4326',
    note:
      'The INAO dataset itself says these online data are informational; official parcel delimitations are the deposited plans available from town halls or INAO services.',
  },
  features,
}

const serialized = `${JSON.stringify(collection)}\n`

await fs.mkdir(path.dirname(publicOutputPath), { recursive: true })
await fs.writeFile(outputPath, serialized)
await fs.writeFile(publicOutputPath, serialized)

const size = (await fs.stat(outputPath)).size
const counts = features.reduce((acc, feature) => {
  acc[feature.properties.id] = (acc[feature.properties.id] ?? 0) + 1
  return acc
}, {})

console.log(`Wrote ${features.length} features to ${path.resolve(outputPath)}`)
console.log(`Copied runtime asset to ${path.resolve(publicOutputPath)}`)
console.log(`Size: ${(size / 1024 / 1024).toFixed(2)} MB`)
console.log(counts)

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

function round(value) {
  return Number(value.toFixed(7))
}
