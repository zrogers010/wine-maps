import fs from 'node:fs/promises'
import path from 'node:path'

const detailOutputPath = 'public/data/france/champagne/champagne-display-dev-2026.geojson'
const hullOutputPath = 'public/data/france/champagne/champagne-display-hulls-2026.geojson'

const features = [
  subregionFeature({
    id: 'montagne-de-reims',
    name: 'Montagne de Reims',
    coordinates: [
      [3.76, 49.03],
      [3.97, 49.07],
      [4.16, 49.03],
      [4.24, 49.15],
      [4.18, 49.28],
      [3.98, 49.31],
      [3.75, 49.25],
      [3.67, 49.12],
      [3.76, 49.03],
    ],
  }),
  subregionFeature({
    id: 'vallee-de-la-marne',
    name: 'Vallée de la Marne',
    coordinates: [
      [3.05, 48.92],
      [3.34, 48.91],
      [3.68, 49.0],
      [4.02, 49.02],
      [4.2, 49.11],
      [4.04, 49.19],
      [3.72, 49.15],
      [3.37, 49.06],
      [3.08, 49.04],
      [3.05, 48.92],
    ],
  }),
  subregionFeature({
    id: 'cote-des-blancs',
    name: 'Côte des Blancs',
    coordinates: [
      [3.85, 48.68],
      [4.02, 48.71],
      [4.08, 48.88],
      [4.02, 49.02],
      [3.92, 49.03],
      [3.82, 48.89],
      [3.78, 48.75],
      [3.85, 48.68],
    ],
  }),
  subregionFeature({
    id: 'cote-de-sezanne',
    name: 'Côte de Sézanne',
    coordinates: [
      [3.53, 48.46],
      [3.76, 48.47],
      [3.88, 48.59],
      [3.83, 48.75],
      [3.61, 48.71],
      [3.47, 48.58],
      [3.53, 48.46],
    ],
  }),
  subregionFeature({
    id: 'cote-des-bar',
    name: 'Côte des Bar',
    coordinates: [
      [4.2, 47.78],
      [4.56, 47.76],
      [4.87, 47.92],
      [4.92, 48.18],
      [4.72, 48.35],
      [4.34, 48.32],
      [4.08, 48.12],
      [4.2, 47.78],
    ],
  }),
]

const collection = {
  type: 'FeatureCollection',
  metadata: {
    name: 'Champagne development study-map subregions',
    placeholder: true,
    note:
      'Development teaching geometry only. These broad subregion polygons are not official INAO parcel delimitations and should be replaced by official Champagne boundary data.',
    source:
      'Hand-authored broad study-map geometry based on common Champagne subregion geography.',
  },
  features,
}

await fs.mkdir(path.dirname(detailOutputPath), { recursive: true })
await fs.mkdir(path.dirname(hullOutputPath), { recursive: true })
await fs.writeFile(detailOutputPath, `${JSON.stringify(collection)}\n`)
await fs.writeFile(hullOutputPath, `${JSON.stringify(collection)}\n`)

console.log(`Wrote Champagne dev detail layer to ${path.resolve(detailOutputPath)}`)
console.log(`Wrote Champagne dev hull layer to ${path.resolve(hullOutputPath)}`)

function subregionFeature({ id, name, coordinates }) {
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      name,
      sourceApp: 'Champagne',
      sourceDenom: name,
      sign: 'AOC',
      typeProd: 'Vins mousseux',
      dataStatus:
        'Development study-map geometry only; not official INAO parcel delimitation.',
      placeholder: true,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  }
}
