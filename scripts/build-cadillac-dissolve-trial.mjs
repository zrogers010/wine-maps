import fs from 'node:fs/promises'
import path from 'node:path'
import { concave, coordAll, convex, featureCollection, point } from '@turf/turf'

const sourcePath = 'public/data/bordeaux-display-exclusive-2026.geojson'
const outputPath = 'public/data/bordeaux-display-cadillac-dissolve-trial-2026.geojson'
const targetId = 'cadillac'
const concaveMaxEdgeKilometers = 2.4

const source = JSON.parse(await fs.readFile(sourcePath, 'utf-8'))
const targetFeatures = source.features.filter(
  (feature) => feature.properties?.id === targetId,
)
const otherFeatures = source.features.filter(
  (feature) => feature.properties?.id !== targetId,
)

if (targetFeatures.length === 0) {
  throw new Error(`No features found for ${targetId}`)
}

const hullPoints = featureCollection(
  targetFeatures.flatMap((feature) => coordAll(feature).map((coordinate) => point(coordinate))),
)
const outerHull =
  concave(hullPoints, {
    maxEdge: concaveMaxEdgeKilometers,
    units: 'kilometers',
  }) ?? convex(hullPoints)

if (!outerHull) {
  throw new Error(`Could not create outer hull for ${targetId}`)
}

const trialFeature = {
  ...outerHull,
  id: targetId,
  properties: {
    ...targetFeatures[0].properties,
    displayStatus:
      'Trial display feature: Cadillac features replaced by one filled concave outer hull.',
    concaveMaxEdgeKilometers,
    hullPointCount: hullPoints.features.length,
    sourceFeatureCount: targetFeatures.length,
  },
  geometry: removeInteriorRings(outerHull.geometry),
}

const collection = {
  type: 'FeatureCollection',
  metadata: {
    ...source.metadata,
    name: 'Bordeaux display with Cadillac outer-hull trial',
    source: sourcePath,
    note:
      'Trial layer. Only Cadillac is replaced by one filled concave outer hull; all other features remain from the exclusive display layer.',
  },
  features: [...otherFeatures, trialFeature],
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(collection)}\n`)

console.log(`Wrote ${collection.features.length} features to ${path.resolve(outputPath)}`)
console.log(
  `Replaced ${targetFeatures.length} Cadillac features with one filled concave hull using maxEdge=${concaveMaxEdgeKilometers}km`,
)

function removeInteriorRings(geometry) {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: [geometry.coordinates[0]],
    }
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => [polygon[0]]),
    }
  }

  return geometry
}
