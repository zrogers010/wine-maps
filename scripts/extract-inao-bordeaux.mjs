import fs from 'node:fs/promises'
import path from 'node:path'
import proj4 from 'proj4'
import shapefile from 'shapefile'

const sourceBase =
  'data/raw/inao-aoc-viticoles-2026-05-05/2026-05-05_delim-parcellaire-aoc-shp'
const outputPath = 'src/data/bordeaux-inao-aoc-2026.geojson'
const publicOutputPath = 'public/data/bordeaux-inao-aoc-2026.geojson'

const targetAocs = [
  { app: 'Médoc', id: 'medoc', name: 'Médoc' },
  { app: 'Haut-Médoc', id: 'haut-medoc', name: 'Haut-Médoc' },
  { app: 'Saint-Estèphe', id: 'saint-estephe', name: 'Saint-Estèphe' },
  { app: 'Pauillac', id: 'pauillac', name: 'Pauillac' },
  { app: 'Saint-Julien', id: 'saint-julien', name: 'Saint-Julien' },
  { app: 'Margaux', id: 'margaux', name: 'Margaux' },
  {
    app: 'Moulis ou Moulis-en-Médoc',
    id: 'moulis-en-medoc',
    name: 'Moulis-en-Médoc',
  },
  { app: 'Listrac-Médoc', id: 'listrac-medoc', name: 'Listrac-Médoc' },
  { app: 'Entre-deux-Mers', id: 'entre-deux-mers', name: 'Entre-deux-Mers' },
  {
    app: 'Entre-deux-Mers',
    denom: 'Entre-deux-Mers Haut-Benauge',
    id: 'entre-deux-mers-haut-benauge',
    name: 'Entre-deux-Mers Haut-Benauge',
  },
  { app: 'Cadillac', id: 'cadillac', name: 'Cadillac' },
  {
    app: 'Côtes de Bordeaux',
    denom: 'Côtes de Bordeaux Cadillac',
    id: 'cotes-de-bordeaux-cadillac',
    name: 'Côtes de Bordeaux Cadillac',
  },
  { app: 'Loupiac', id: 'loupiac', name: 'Loupiac' },
  {
    app: 'Sainte-Croix-du-Mont',
    id: 'sainte-croix-du-mont',
    name: 'Sainte-Croix-du-Mont',
  },
  {
    app: 'Premières Côtes de Bordeaux',
    id: 'premieres-cotes-de-bordeaux',
    name: 'Premières Côtes de Bordeaux',
  },
  {
    app: 'Côtes de Bordeaux-Saint-Macaire',
    id: 'cotes-de-bordeaux-saint-macaire',
    name: 'Côtes de Bordeaux-Saint-Macaire',
  },
  { app: 'Graves de Vayres', id: 'graves-de-vayres', name: 'Graves de Vayres' },
  { app: 'Saint-Emilion', id: 'saint-emilion', name: 'Saint-Émilion' },
  { app: 'Pomerol', id: 'pomerol', name: 'Pomerol' },
  {
    app: 'Lalande-de-Pomerol',
    id: 'lalande-de-pomerol',
    name: 'Lalande-de-Pomerol',
  },
  { app: 'Fronsac', id: 'fronsac', name: 'Fronsac' },
  { app: 'Canon Fronsac', id: 'canon-fronsac', name: 'Canon Fronsac' },
  {
    app: 'Montagne-Saint-Emilion',
    id: 'montagne-saint-emilion',
    name: 'Montagne-Saint-Émilion',
  },
  {
    app: 'Lussac Saint-Emilion',
    id: 'lussac-saint-emilion',
    name: 'Lussac-Saint-Émilion',
  },
  {
    app: 'Puisseguin Saint-Emilion',
    id: 'puisseguin-saint-emilion',
    name: 'Puisseguin-Saint-Émilion',
  },
  {
    app: 'Saint-Georges-Saint-Emilion',
    id: 'saint-georges-saint-emilion',
    name: 'Saint-Georges-Saint-Émilion',
  },
  { app: 'Pessac-Léognan', id: 'pessac-leognan', name: 'Pessac-Léognan' },
  { app: 'Graves', id: 'graves', name: 'Graves' },
  {
    app: 'Graves supérieures',
    id: 'graves-superieures',
    name: 'Graves Supérieures',
  },
  { app: 'Sauternes', id: 'sauternes', name: 'Sauternes' },
  { app: 'Barsac', id: 'barsac', name: 'Barsac' },
  { app: 'Cérons', id: 'cerons', name: 'Cérons' },
]

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
  const target = targetAocs
    .slice()
    .sort((left, right) => Number(Boolean(right.denom)) - Number(Boolean(left.denom)))
    .find((candidate) => {
      if (candidate.app !== feature.properties.app) {
        return false
      }

      return !candidate.denom || candidate.denom === feature.properties.denom
    })

  if (!target) {
    continue
  }

  const geometry = transformGeometry(feature.geometry)

  features.push({
    type: 'Feature',
    id: `${target.id}-${features.length + 1}`,
    properties: {
      id: target.id,
      name: target.name,
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
    name: 'Bordeaux INAO AOC viticole parcel delimitation extract',
    placeholder: false,
    source:
      'Délimitation Parcellaire des AOC Viticoles de l’INAO, data.gouv.fr',
    sourceUrl:
      'https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao/',
    sourceResource: '2026-05-05-delim-parcellaire-aoc-shp.zip',
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

const counts = features.reduce((acc, feature) => {
  acc[feature.properties.id] = (acc[feature.properties.id] ?? 0) + 1
  return acc
}, {})

console.log(`Wrote ${features.length} features to ${path.resolve(outputPath)}`)
console.log(`Copied runtime asset to ${path.resolve(publicOutputPath)}`)
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
