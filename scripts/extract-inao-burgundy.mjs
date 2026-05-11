import fs from 'node:fs/promises'
import path from 'node:path'
import proj4 from 'proj4'
import shapefile from 'shapefile'

const sourceBase =
  'data/raw/inao-aoc-viticoles-2026-05-05/2026-05-05_delim-parcellaire-aoc-shp'
const outputPath = 'src/data/france/burgundy/burgundy-inao-aoc-2026.geojson'
const publicOutputPath = 'public/data/france/burgundy/burgundy-inao-aoc-2026.geojson'

const targetAocs = [
  { app: 'Petit Chablis', id: 'petit-chablis', name: 'Petit Chablis' },
  { app: 'Chablis', id: 'chablis', name: 'Chablis' },
  { app: 'Chablis Grand Cru', id: 'chablis-grand-cru', name: 'Chablis Grand Cru' },
  { app: 'Gevrey-Chambertin', id: 'gevrey-chambertin', name: 'Gevrey-Chambertin' },
  { app: 'Morey-Saint-Denis', id: 'morey-saint-denis', name: 'Morey-Saint-Denis' },
  { app: 'Chambolle-Musigny', id: 'chambolle-musigny', name: 'Chambolle-Musigny' },
  { app: 'Vougeot', id: 'vougeot', name: 'Vougeot' },
  { app: 'Vosne-Romanée', id: 'vosne-romanee', name: 'Vosne-Romanée' },
  { app: 'Nuits-Saint-Georges', id: 'nuits-saint-georges', name: 'Nuits-Saint-Georges' },
  { app: 'Aloxe-Corton', id: 'aloxe-corton', name: 'Aloxe-Corton' },
  { app: 'Beaune', id: 'beaune', name: 'Beaune' },
  { app: 'Pommard', id: 'pommard', name: 'Pommard' },
  { app: 'Volnay', id: 'volnay', name: 'Volnay' },
  { app: 'Meursault', id: 'meursault', name: 'Meursault' },
  { app: 'Puligny-Montrachet', id: 'puligny-montrachet', name: 'Puligny-Montrachet' },
  { app: 'Chassagne-Montrachet', id: 'chassagne-montrachet', name: 'Chassagne-Montrachet' },
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
  const target = targetAocs.find((candidate) => candidate.app === feature.properties.app)

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
    name: 'Burgundy INAO AOC viticole parcel delimitation extract',
    placeholder: false,
    source:
      "Délimitation Parcellaire des AOC Viticoles de l'INAO, data.gouv.fr",
    sourceUrl:
      'https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao/',
    sourceResource: '2026-05-05-delim-parcellaire-aoc-shp.zip',
    sourceProjection: 'EPSG:2154',
    outputProjection: 'EPSG:4326',
  },
  features,
}

const serialized = `${JSON.stringify(collection)}\n`

await fs.mkdir(path.dirname(outputPath), { recursive: true })
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
