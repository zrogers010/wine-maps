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

// Côte d'Or Grand Cru AOCs are separate appellations in the INAO source.
// `village` records the commonly associated village for study context.
const grandCruAocs = [
  { app: 'Chambertin', id: 'chambertin', name: 'Chambertin', village: 'gevrey-chambertin' },
  { app: 'Chambertin-Clos de Bèze', id: 'chambertin-clos-de-beze', name: 'Chambertin-Clos de Bèze', village: 'gevrey-chambertin' },
  { app: 'Chapelle-Chambertin', id: 'chapelle-chambertin', name: 'Chapelle-Chambertin', village: 'gevrey-chambertin' },
  { app: 'Charmes-Chambertin', id: 'charmes-chambertin', name: 'Charmes-Chambertin', village: 'gevrey-chambertin' },
  { app: 'Griotte-Chambertin', id: 'griotte-chambertin', name: 'Griotte-Chambertin', village: 'gevrey-chambertin' },
  { app: 'Latricières-Chambertin', id: 'latricieres-chambertin', name: 'Latricières-Chambertin', village: 'gevrey-chambertin' },
  { app: 'Mazis-Chambertin', id: 'mazis-chambertin', name: 'Mazis-Chambertin', village: 'gevrey-chambertin' },
  { app: 'Mazoyères-Chambertin', id: 'mazoyeres-chambertin', name: 'Mazoyères-Chambertin', village: 'gevrey-chambertin' },
  { app: 'Ruchottes-Chambertin', id: 'ruchottes-chambertin', name: 'Ruchottes-Chambertin', village: 'gevrey-chambertin' },
  { app: 'Clos de la Roche', id: 'clos-de-la-roche', name: 'Clos de la Roche', village: 'morey-saint-denis' },
  { app: 'Clos Saint-Denis', id: 'clos-saint-denis', name: 'Clos Saint-Denis', village: 'morey-saint-denis' },
  { app: 'Clos des Lambrays', id: 'clos-des-lambrays', name: 'Clos des Lambrays', village: 'morey-saint-denis' },
  { app: 'Clos de Tart', id: 'clos-de-tart', name: 'Clos de Tart', village: 'morey-saint-denis' },
  { app: 'Bonnes-Mares', id: 'bonnes-mares', name: 'Bonnes-Mares', village: 'chambolle-musigny' },
  { app: 'Musigny', id: 'musigny', name: 'Musigny', village: 'chambolle-musigny' },
  { app: 'Clos de Vougeot ou Clos Vougeot', id: 'clos-de-vougeot', name: 'Clos de Vougeot', village: 'vougeot' },
  { app: 'Echezeaux', id: 'echezeaux', name: 'Échezeaux', village: 'vosne-romanee' },
  { app: 'Grands-Echezeaux', id: 'grands-echezeaux', name: 'Grands-Échezeaux', village: 'vosne-romanee' },
  { app: 'Romanée-Conti', id: 'romanee-conti', name: 'Romanée-Conti', village: 'vosne-romanee' },
  { app: 'La Tâche', id: 'la-tache', name: 'La Tâche', village: 'vosne-romanee' },
  { app: 'Richebourg', id: 'richebourg', name: 'Richebourg', village: 'vosne-romanee' },
  { app: 'La Romanée', id: 'la-romanee', name: 'La Romanée', village: 'vosne-romanee' },
  { app: 'La Grande Rue', id: 'la-grande-rue', name: 'La Grande Rue', village: 'vosne-romanee' },
  { app: 'Romanée-Saint-Vivant', id: 'romanee-saint-vivant', name: 'Romanée-Saint-Vivant', village: 'vosne-romanee' },
  { app: 'Corton', id: 'corton', name: 'Corton', village: 'aloxe-corton' },
  { app: 'Corton-Charlemagne', id: 'corton-charlemagne', name: 'Corton-Charlemagne', village: 'aloxe-corton' },
  { app: 'Charlemagne', id: 'charlemagne', name: 'Charlemagne', village: 'aloxe-corton' },
  { app: 'Montrachet', id: 'montrachet', name: 'Montrachet', village: 'puligny-montrachet' },
  { app: 'Chevalier-Montrachet', id: 'chevalier-montrachet', name: 'Chevalier-Montrachet', village: 'puligny-montrachet' },
  { app: 'Bâtard-Montrachet', id: 'batard-montrachet', name: 'Bâtard-Montrachet', village: 'puligny-montrachet' },
  { app: 'Bienvenues-Bâtard-Montrachet', id: 'bienvenues-batard-montrachet', name: 'Bienvenues-Bâtard-Montrachet', village: 'puligny-montrachet' },
  { app: 'Criots-Bâtard-Montrachet', id: 'criots-batard-montrachet', name: 'Criots-Bâtard-Montrachet', village: 'chassagne-montrachet' },
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
  const grandCruTarget = grandCruAocs.find(
    (candidate) => candidate.app === feature.properties.app,
  )

  if (!target && !grandCruTarget) {
    continue
  }

  const geometry = transformGeometry(feature.geometry)
  const active = target ?? grandCruTarget
  const cru = target
    ? classifyDenomination(target, feature.properties.denom)
    : {
        cruLevel: 'grand-cru',
        climat: grandCruTarget.name,
        villageId: grandCruTarget.village,
      }

  features.push({
    type: 'Feature',
    id: `${active.id}-${features.length + 1}`,
    properties: {
      id: active.id,
      name: active.name,
      cruLevel: cru.cruLevel,
      climat: cru.climat,
      villageId: cru.villageId,
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

// Splits a village-AOC denomination like "Volnay premier cru Champans" into
// cru level and named climat. A bare "<village> premier cru" denomination is
// the generic premier-cru eligibility area without a named climat.
function classifyDenomination(target, denom) {
  const base = { cruLevel: 'village', climat: null, villageId: target.id }

  if (typeof denom !== 'string' || denom.length === 0) {
    return base
  }

  const match = denom.match(/premier cru\s*(.*)$/i)

  if (!match) {
    return base
  }

  const climat = match[1].trim()
  return {
    cruLevel: 'premier-cru',
    climat: climat.length > 0 ? climat : null,
    villageId: target.id,
  }
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
const cruCounts = features.reduce((acc, feature) => {
  acc[feature.properties.cruLevel] = (acc[feature.properties.cruLevel] ?? 0) + 1
  return acc
}, {})

console.log(`Wrote ${features.length} features to ${path.resolve(outputPath)}`)
console.log(`Copied runtime asset to ${path.resolve(publicOutputPath)}`)
console.log(counts)
console.log(cruCounts)

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
