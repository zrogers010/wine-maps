import fs from 'node:fs/promises'
import path from 'node:path'
import {
  area,
  bbox,
  booleanIntersects,
  concave,
  coordAll,
  convex,
  difference,
  featureCollection,
  point,
} from '@turf/turf'

const sourcePath = 'public/data/bordeaux-display-exclusive-2026.geojson'
const outputPath = 'public/data/bordeaux-display-cadillac-dissolve-trial-2026.geojson'
const concaveMaxEdgeKilometers = 2.4
const targetIds = [
  'medoc',
  'haut-medoc',
  'saint-estephe',
  'pauillac',
  'saint-julien',
  'margaux',
  'moulis-en-medoc',
  'listrac-medoc',
  'entre-deux-mers',
  'entre-deux-mers-haut-benauge',
  'cadillac',
  'cotes-de-bordeaux-cadillac',
  'loupiac',
  'sainte-croix-du-mont',
  'premieres-cotes-de-bordeaux',
  'cotes-de-bordeaux-saint-macaire',
  'graves-de-vayres',
]

const priorityById = new Map([
  ['medoc', 1],
  ['haut-medoc', 2],
  ['saint-estephe', 3],
  ['pauillac', 3],
  ['saint-julien', 3],
  ['margaux', 3],
  ['moulis-en-medoc', 3],
  ['listrac-medoc', 3],
  ['entre-deux-mers', 1],
  ['premieres-cotes-de-bordeaux', 2],
  ['cotes-de-bordeaux-cadillac', 2],
  ['cotes-de-bordeaux-saint-macaire', 2],
  ['graves-de-vayres', 2],
  ['entre-deux-mers-haut-benauge', 3],
  ['cadillac', 3],
  ['loupiac', 3],
  ['sainte-croix-du-mont', 3],
])
const minimumHullFeatureAreaShareById = new Map([
  ['pauillac', 0.02],
  ['saint-julien', 0.02],
])

const source = JSON.parse(await fs.readFile(sourcePath, 'utf-8'))
const otherFeatures = source.features.filter(
  (feature) => !targetIds.includes(feature.properties?.id),
)
const trialFeatures = []
let omittedSatelliteFeatureCount = 0

for (const targetId of targetIds) {
  const targetFeatures = source.features.filter(
    (feature) => feature.properties?.id === targetId,
  )

  if (targetFeatures.length === 0) {
    throw new Error(`No features found for ${targetId}`)
  }

  const hullSourceFeatures = filterSatelliteFeaturesForHull(targetId, targetFeatures)
  omittedSatelliteFeatureCount += targetFeatures.length - hullSourceFeatures.length
  const hullPoints = featureCollection(
    hullSourceFeatures.flatMap((feature) => coordAll(feature).map((coordinate) => point(coordinate))),
  )
  const outerHull =
    concave(hullPoints, {
      maxEdge: concaveMaxEdgeKilometers,
      units: 'kilometers',
    }) ?? convex(hullPoints)

  if (!outerHull) {
    throw new Error(`Could not create outer hull for ${targetId}`)
  }

  trialFeatures.push({
    ...outerHull,
    id: targetId,
    properties: {
      ...targetFeatures[0].properties,
      displayStatus:
        'Trial display feature: AOC features replaced by one filled concave outer hull for low-zoom display.',
      concaveMaxEdgeKilometers,
      hullPointCount: hullPoints.features.length,
      sourceFeatureCount: targetFeatures.length,
      hullSourceFeatureCount: hullSourceFeatures.length,
    },
    geometry: removeInteriorRings(outerHull.geometry),
  })
}

let overlapCutCount = 0
let overlapFallbackCount = 0
const displayHullFeatures = removeOverlaps(trialFeatures)

const collection = {
  type: 'FeatureCollection',
  metadata: {
    ...source.metadata,
    name: 'Bordeaux display with low-zoom outer-hull trial',
    source: sourcePath,
    note:
      'Trial layer. Selected AOCs are replaced by filled, non-overlapping concave outer hulls for low-zoom display; all other features remain from the exclusive display layer.',
    hullTargetIds: targetIds,
    overlapCutCount,
    overlapFallbackCount,
    omittedSatelliteFeatureCount,
  },
  features: [...otherFeatures, ...displayHullFeatures],
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(collection)}\n`)

console.log(`Wrote ${collection.features.length} features to ${path.resolve(outputPath)}`)
console.log(`Built ${trialFeatures.length} filled concave hulls using maxEdge=${concaveMaxEdgeKilometers}km`)
console.log(`Cut overlaps from ${overlapCutCount} hull features`)
console.log(`Kept ${overlapFallbackCount} hulls uncut after full-overlap fallback`)
console.log(`Omitted ${omittedSatelliteFeatureCount} tiny satellite features from low-zoom hulls`)

function filterSatelliteFeaturesForHull(targetId, features) {
  const minimumAreaShare = minimumHullFeatureAreaShareById.get(targetId)

  if (!minimumAreaShare) {
    return features
  }

  const totalArea = features.reduce((sum, feature) => sum + area(feature), 0)
  const filteredFeatures = features.filter(
    (feature) => area(feature) / totalArea >= minimumAreaShare,
  )

  return filteredFeatures.length > 0 ? filteredFeatures : features
}

function removeOverlaps(features) {
  const acceptedFeatures = []
  const candidates = features
    .map((feature) => ({
      ...feature,
      bbox: bbox(feature),
      displayArea: area(feature),
      displayPriority: priorityById.get(feature.properties?.id) ?? 0,
    }))
    .sort((left, right) => {
      if (right.displayPriority !== left.displayPriority) {
        return right.displayPriority - left.displayPriority
      }

      return left.displayArea - right.displayArea
    })

  for (const candidate of candidates) {
    let current = stripRuntimeFields(candidate)

    for (const accepted of acceptedFeatures) {
      if (!bboxesIntersect(bbox(current), accepted.bbox)) {
        continue
      }

      if (!booleanIntersects(current, accepted)) {
        continue
      }

      const cut = difference(featureCollection([current, accepted]))

      if (!cut) {
        overlapFallbackCount += 1
        current = stripRuntimeFields(candidate)
        break
      }

      overlapCutCount += 1
      current = {
        ...cut,
        id: candidate.id,
        properties: {
          ...candidate.properties,
          overlapStatus:
            'Low-zoom hull overlap removed; higher-priority or smaller same-priority hull kept the shared area.',
        },
      }
    }

    if (!current) {
      continue
    }

    acceptedFeatures.push({
      ...current,
      bbox: bbox(current),
    })
  }

  return acceptedFeatures.map(stripRuntimeFields)
}

function stripRuntimeFields(feature) {
  const {
    bbox: _bbox,
    displayArea: _displayArea,
    displayPriority: _displayPriority,
    ...rest
  } = feature
  return rest
}

function bboxesIntersect(left, right) {
  return (
    left[0] <= right[2] &&
    left[2] >= right[0] &&
    left[1] <= right[3] &&
    left[3] >= right[1]
  )
}

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
